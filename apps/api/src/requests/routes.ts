import type { FastifyInstance } from "fastify";
import { and, eq, max } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/index.js";
import {
  assets,
  directionVersions,
  generationAttempts,
  importRows,
  shotRequests,
} from "../db/schema.js";
import { loadRequests, loadRequestsByImport, type LoadedRequest } from "./projection-loader.js";
import { clearBudgetExhausted, isBudgetExhausted } from "../worker/generation.js";
import { assembleGenerationBody, priceSnapshotUsd } from "../luma/assemble.js";
import { preflightPhoto } from "../imports/preflight.js";

const directionBody = z.object({ content: z.string().trim().min(1) });
const generateBody = z.object({ count: z.number().int().min(1).max(5).optional() });
const closeBody = z.object({ reason: z.string().trim().max(500).optional() });
const requiredApprovalsBody = z.object({ value: z.number().int().min(1).max(10) });

function serialize(loaded: LoadedRequest) {
  const { request, product, row, directions, attempts, candidates, status, approvedCount, spendUsd } =
    loaded;
  return {
    id: request.id,
    importId: request.importId,
    status,
    shotIdea: request.shotIdea,
    requiredApprovals: request.requiredApprovals,
    approvedCount,
    spendUsd,
    closedAt: request.closedAt,
    closeReason: request.closeReason,
    product: {
      sku: product.sku,
      name: product.name,
      colorFinish: product.colorFinish,
      material: product.material,
      photoUrl: product.photoUrl,
      priceRaw: product.priceRaw,
      category: product.category,
    },
    notes: row.notes,
    directions: directions.map((d) => ({
      id: d.id,
      version: d.version,
      content: d.content,
      provenance: d.provenance,
      createdAt: d.createdAt,
    })),
    candidates: candidates.map((c) => ({
      id: c.id,
      createdAt: c.createdAt,
      assetPublicId: c.asset?.publicId ?? null,
      assetState: c.asset?.storeState ?? null,
      decision: c.decision
        ? {
            decision: c.decision.decision,
            reason: c.decision.reason,
            comment: c.decision.comment,
            reviewedAt: c.decision.reviewedAt,
          }
        : null,
    })),
    attempts: attempts.map((a) => ({
      id: a.id,
      state: a.state,
      failureCode: a.failureCode,
      failureReason: a.failureReason,
      model: a.model,
      priceSnapshotUsd: a.priceSnapshotUsd,
      createdAt: a.createdAt,
      submittedAt: a.submittedAt,
      completedAt: a.completedAt,
      providerGenerationId: a.providerGenerationId,
    })),
  };
}

async function loadOne(id: string): Promise<LoadedRequest | null> {
  const loaded = await loadRequests([id]);
  return loaded.get(id) ?? null;
}

export async function requestRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { importId?: string } }>("/requests", async (req, reply) => {
    if (!req.query.importId) return reply.code(400).send({ error: "importId query is required" });
    const loaded = await loadRequestsByImport(req.query.importId);
    return { requests: [...loaded.values()].map(serialize) };
  });

  app.get<{ Params: { id: string } }>("/requests/:id", async (req, reply) => {
    const loaded = await loadOne(req.params.id);
    if (!loaded) return reply.code(404).send({ error: "Request not found" });
    return { request: serialize(loaded) };
  });

  app.post<{ Params: { id: string } }>("/requests/:id/directions", async (req, reply) => {
    const body = directionBody.parse(req.body);
    const loaded = await loadOne(req.params.id);
    if (!loaded) return reply.code(404).send({ error: "Request not found" });
    if (loaded.request.closedAt) return reply.code(409).send({ error: "Request is closed" });

    const versions = await db()
      .select({ current: max(directionVersions.version) })
      .from(directionVersions)
      .where(eq(directionVersions.shotRequestId, loaded.request.id));
    const current = versions[0]?.current ?? 0;

    const [created] = await db()
      .insert(directionVersions)
      .values({
        shotRequestId: loaded.request.id,
        version: current + 1,
        content: body.content,
        provenance: "OPERATOR_EDITED",
      })
      .returning();

    return reply.code(201).send({ direction: created });
  });

  app.post<{ Params: { id: string } }>("/requests/:id/generate", async (req, reply) => {
    const body = generateBody.parse(req.body ?? {});
    const loaded = await loadOne(req.params.id);
    if (!loaded) return reply.code(404).send({ error: "Request not found" });

    if (await isBudgetExhausted()) {
      return reply.code(409).send({ error: "Provider budget exhausted — resolve before generating", code: "BUDGET_EXHAUSTED" });
    }

    switch (loaded.status) {
      case "CLOSED":
        return reply.code(409).send({ error: "Request is closed", code: loaded.status });
      case "NEEDS_REVISION":
        return reply.code(409).send({
          error: "Latest candidate was rejected for a direction problem — revise the Execution Direction first",
          code: loaded.status,
        });
      case "GENERATION_BLOCKED":
        return reply.code(409).send({
          error: "The provider refused this direction (moderation) — revise it before generating again",
          code: loaded.status,
        });
      case "NEEDS_INPUT": {
        // Self-heal: the photo may have been fixed by a later import.
        if (!loaded.product.photoUrl || !(await preflightPhoto(loaded.product.photoUrl))) {
          return reply.code(409).send({
            error: "Source photo missing or unreachable — fix the product photo first",
            code: loaded.status,
          });
        }
        await db()
          .update(importRows)
          .set({ photoPreflight: "OK" })
          .where(eq(importRows.id, loaded.row.id));
        break;
      }
      default:
        break;
    }

    const activeDirection = loaded.directions[loaded.directions.length - 1]!;
    const remaining = Math.max(1, loaded.request.requiredApprovals - loaded.approvedCount);
    const count = body.count ?? remaining;

    const facts = {
      name: loaded.product.name,
      colorFinish: loaded.product.colorFinish,
      material: loaded.product.material,
      photoUrl: loaded.product.photoUrl!,
    };
    const payload = assembleGenerationBody(activeDirection.content, facts);

    await db()
      .insert(generationAttempts)
      .values(
        Array.from({ length: count }, () => ({
          shotRequestId: loaded.request.id,
          directionVersionId: activeDirection.id,
          state: "SUBMITTING" as const,
          requestPayload: payload,
          sourceSnapshot: facts,
          model: payload.model,
          priceSnapshotUsd: String(priceSnapshotUsd()),
        })),
      );

    return reply.code(202).send({
      queued: count,
      estimatedSpendUsd: Number((count * priceSnapshotUsd()).toFixed(4)),
    });
  });

  app.post<{ Params: { id: string } }>("/requests/:id/close", async (req, reply) => {
    const body = closeBody.parse(req.body ?? {});
    const found = await db().query.shotRequests.findFirst({
      where: eq(shotRequests.id, req.params.id),
    });
    if (!found) return reply.code(404).send({ error: "Request not found" });
    if (found.closedAt) return reply.code(409).send({ error: "Already closed" });
    await db()
      .update(shotRequests)
      .set({ closedAt: new Date(), closeReason: body.reason ?? null })
      .where(eq(shotRequests.id, found.id));
    return { closed: true };
  });

  app.post<{ Params: { id: string } }>("/requests/:id/reopen", async (req, reply) => {
    const found = await db().query.shotRequests.findFirst({
      where: eq(shotRequests.id, req.params.id),
    });
    if (!found) return reply.code(404).send({ error: "Request not found" });
    if (!found.closedAt) return reply.code(409).send({ error: "Not closed" });
    await db()
      .update(shotRequests)
      .set({ closedAt: null, closeReason: null })
      .where(eq(shotRequests.id, found.id));
    return { reopened: true };
  });

  app.post<{ Params: { id: string } }>("/requests/:id/required-approvals", async (req, reply) => {
    const body = requiredApprovalsBody.parse(req.body);
    const updated = await db()
      .update(shotRequests)
      .set({ requiredApprovals: body.value })
      .where(eq(shotRequests.id, req.params.id))
      .returning({ id: shotRequests.id });
    if (updated.length === 0) return reply.code(404).send({ error: "Request not found" });
    return { requiredApprovals: body.value };
  });

  // Manual "Retry copy" for an asset whose persistence retries are exhausted.
  app.post<{ Params: { publicId: string } }>("/assets/:publicId/retry-copy", async (req, reply) => {
    const updated = await db()
      .update(assets)
      .set({ storeState: "PENDING", retryCount: 0, nextRetryAt: null })
      .where(and(eq(assets.publicId, req.params.publicId), eq(assets.storeState, "FAILED")))
      .returning({ id: assets.id });
    if (updated.length === 0) return reply.code(404).send({ error: "No failed asset to retry" });
    return { retrying: true };
  });

  app.post("/budget/clear", async () => {
    await clearBudgetExhausted();
    return { cleared: true };
  });
}
