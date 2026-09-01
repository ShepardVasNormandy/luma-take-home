import { and, eq, inArray, isNull, lt, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { db } from "../db/index.js";
import { assets, candidates, generationAttempts, appSettings } from "../db/schema.js";
import {
  LumaRateLimited,
  LumaRequestRejected,
  createGeneration,
  getGeneration,
  outputUrls,
} from "../luma/client.js";

export const BUDGET_EXHAUSTED_KEY = "budget_exhausted";

// Process-local submit pause after a 429. Rate limiting is a per-process
// concern; persistence would buy nothing (a restart just retries once).
let submitPausedUntil = 0;

async function setBudgetExhausted(detail: string) {
  await db()
    .insert(appSettings)
    .values({ key: BUDGET_EXHAUSTED_KEY, value: { at: new Date().toISOString(), detail } })
    .onConflictDoUpdate({
      target: appSettings.key,
      set: { value: { at: new Date().toISOString(), detail }, updatedAt: new Date() },
    });
}

export async function isBudgetExhausted(): Promise<boolean> {
  const row = await db().query.appSettings.findFirst({
    where: eq(appSettings.key, BUDGET_EXHAUSTED_KEY),
  });
  return Boolean(row);
}

export async function clearBudgetExhausted() {
  await db().delete(appSettings).where(eq(appSettings.key, BUDGET_EXHAUSTED_KEY));
}

// SPEC §6.1. Claim SUBMITTING rows one at a time; POSTING without a provider
// id is never auto re-POSTed (no provider idempotency mechanism exists).
export async function runSubmitHandler() {
  // Recovery sweep: POSTING with no provider id for >2 min = fate unknown.
  await db()
    .update(generationAttempts)
    .set({ state: "UNKNOWN" })
    .where(
      and(
        eq(generationAttempts.state, "POSTING"),
        isNull(generationAttempts.providerGenerationId),
        lt(generationAttempts.submittedAt, new Date(Date.now() - 2 * 60_000)),
      ),
    );

  if (Date.now() < submitPausedUntil) return;
  if (await isBudgetExhausted()) return;

  for (let i = 0; i < 3; i++) {
    const claimed = await db().transaction(async (tx) => {
      const [row] = await tx
        .select()
        .from(generationAttempts)
        .where(eq(generationAttempts.state, "SUBMITTING"))
        .orderBy(generationAttempts.createdAt)
        .limit(1)
        .for("update", { skipLocked: true });
      if (!row) return null;
      await tx
        .update(generationAttempts)
        .set({ state: "POSTING", submittedAt: new Date() })
        .where(eq(generationAttempts.id, row.id));
      return row;
    });
    if (!claimed) return;

    try {
      const gen = await createGeneration(claimed.requestPayload as Record<string, unknown>, claimed.id);
      await db()
        .update(generationAttempts)
        .set({ state: "QUEUED", providerGenerationId: gen.id })
        .where(eq(generationAttempts.id, claimed.id));
    } catch (err) {
      if (err instanceof LumaRateLimited) {
        submitPausedUntil = Date.now() + err.retryAfterSeconds * 1000;
        await db()
          .update(generationAttempts)
          .set({ state: "SUBMITTING", submittedAt: null })
          .where(eq(generationAttempts.id, claimed.id));
        return;
      }
      if (err instanceof LumaRequestRejected) {
        // Synchronous rejection: never charged (docs), safe to mark FAILED.
        await db()
          .update(generationAttempts)
          .set({
            state: "FAILED",
            failureCode: err.failureCode,
            failureReason: err.detail,
            completedAt: new Date(),
          })
          .where(eq(generationAttempts.id, claimed.id));
        if (err.failureCode === "budget_exhausted") await setBudgetExhausted(err.detail);
        continue;
      }
      // Network failure mid-POST: fate unknown. Leave POSTING; the recovery
      // sweep above turns it into UNKNOWN after 2 minutes. Never re-POST.
      return;
    }
  }
}

// SPEC §6.2. Mirror provider truth; a local timeout is not provider truth.
export async function runPollHandler() {
  const inFlight = await db()
    .select()
    .from(generationAttempts)
    .where(inArray(generationAttempts.state, ["QUEUED", "PROCESSING"]))
    .orderBy(generationAttempts.createdAt)
    .limit(10);

  for (const attempt of inFlight) {
    if (!attempt.providerGenerationId) continue;
    let gen;
    try {
      gen = await getGeneration(attempt.providerGenerationId);
    } catch {
      continue; // transient — poll again next tick
    }

    if (gen.state === "queued" || gen.state === "processing") {
      const state = gen.state === "queued" ? "QUEUED" : "PROCESSING";
      if (state !== attempt.state) {
        await db()
          .update(generationAttempts)
          .set({ state })
          .where(eq(generationAttempts.id, attempt.id));
      }
      continue;
    }

    if (gen.state === "failed") {
      await db()
        .update(generationAttempts)
        .set({
          state: "FAILED",
          failureCode: gen.failure_code ?? "generation_failed",
          failureReason: gen.failure_reason ?? null,
          completedAt: new Date(),
        })
        .where(eq(generationAttempts.id, attempt.id));
      if (gen.failure_code === "budget_exhausted") {
        await setBudgetExhausted(gen.failure_reason ?? "budget exhausted");
      }
      continue;
    }

    // completed → candidate + PENDING asset, atomically with the state flip.
    const url = outputUrls(gen)[0];
    if (!url) {
      await db()
        .update(generationAttempts)
        .set({
          state: "FAILED",
          failureCode: "output_not_found",
          failureReason: "Completed generation had no output URL",
          completedAt: new Date(),
        })
        .where(eq(generationAttempts.id, attempt.id));
      continue;
    }

    await db().transaction(async (tx) => {
      const [asset] = await tx
        .insert(assets)
        .values({
          publicId: randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "").slice(0, 8),
          storageKey: `assets/${randomUUID()}`,
          contentType: "image/jpeg",
          providerUrlSnapshot: url,
          storeState: "PENDING",
        })
        .returning();
      await tx.insert(candidates).values({
        shotRequestId: attempt.shotRequestId,
        generationAttemptId: attempt.id,
        assetId: asset!.id,
      });
      await tx
        .update(generationAttempts)
        .set({ state: "COMPLETED", completedAt: new Date() })
        .where(
          and(eq(generationAttempts.id, attempt.id), sql`${generationAttempts.state} != 'COMPLETED'`),
        );
    });
  }
}
