import { and, eq, isNull, lte, or, sql } from "drizzle-orm";
import { db } from "../db/index.js";
import { assets, candidates, generationAttempts } from "../db/schema.js";
import { getGeneration, outputUrls } from "../luma/client.js";
import { putObject } from "../storage/index.js";

const MAX_RETRIES = 5;

const backoffMs = (retryCount: number) =>
  Math.min(60_000, 2 ** retryCount * 2000) * (0.75 + Math.random() * 0.5);

// SPEC §6.3 — asset persistence is its own failure boundary. Retries copy
// from the SAME provider generation; this handler can never POST a generation.
export async function runStoreHandler() {
  for (let i = 0; i < 3; i++) {
    const claimed = await db().transaction(async (tx) => {
      const [asset] = await tx
        .select()
        .from(assets)
        .where(
          and(
            eq(assets.storeState, "PENDING"),
            or(isNull(assets.nextRetryAt), lte(assets.nextRetryAt, new Date())),
          ),
        )
        .orderBy(assets.createdAt)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!asset) return null;
      // Lease so a concurrent tick doesn't double-copy.
      await tx
        .update(assets)
        .set({ nextRetryAt: new Date(Date.now() + 90_000) })
        .where(eq(assets.id, asset.id));
      return asset;
    });
    if (!claimed) return;

    try {
      let res = await fetch(claimed.providerUrlSnapshot, { signal: AbortSignal.timeout(60_000) });

      if (res.status === 403 || res.status === 404) {
        // Presigned URL expired — mint a fresh one from the same generation.
        const [row] = await db()
          .select({ providerGenerationId: generationAttempts.providerGenerationId })
          .from(candidates)
          .innerJoin(generationAttempts, eq(candidates.generationAttemptId, generationAttempts.id))
          .where(eq(candidates.assetId, claimed.id));
        if (!row?.providerGenerationId) throw new Error("No provider generation to refresh from");
        const fresh = await getGeneration(row.providerGenerationId);
        const url = outputUrls(fresh)[0];
        if (!url) throw new Error("Refreshed generation has no output URL");
        await db()
          .update(assets)
          .set({ providerUrlSnapshot: url })
          .where(eq(assets.id, claimed.id));
        res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      }

      if (!res.ok) throw new Error(`Provider asset fetch failed: ${res.status}`);
      const buffer = Buffer.from(await res.arrayBuffer());
      const contentType = res.headers.get("content-type") ?? "image/jpeg";

      await putObject(claimed.storageKey, buffer, contentType);

      await db()
        .update(assets)
        .set({
          storeState: "STORED",
          storedAt: new Date(),
          bytes: buffer.byteLength,
          contentType,
          nextRetryAt: null,
        })
        .where(eq(assets.id, claimed.id));
    } catch {
      const retryCount = claimed.retryCount + 1;
      const exhausted = retryCount >= MAX_RETRIES;
      await db()
        .update(assets)
        .set({
          retryCount,
          storeState: exhausted ? "FAILED" : "PENDING",
          nextRetryAt: exhausted ? null : new Date(Date.now() + backoffMs(retryCount)),
        })
        .where(and(eq(assets.id, claimed.id), sql`${assets.storeState} = 'PENDING'`));
    }
  }
}
