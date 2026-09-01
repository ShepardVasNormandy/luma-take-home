import { eq, inArray } from "drizzle-orm";
import {
  projectRequestStatus,
  type ProjectionInput,
  type RejectionReason,
  type RequestStatus,
} from "@shots/shared";
import { db } from "../db/index.js";
import {
  assets,
  candidates,
  directionVersions,
  generationAttempts,
  importRows,
  products,
  reviewDecisions,
  shotRequests,
} from "../db/schema.js";

export interface LoadedRequest {
  request: typeof shotRequests.$inferSelect;
  product: typeof products.$inferSelect;
  row: typeof importRows.$inferSelect;
  directions: (typeof directionVersions.$inferSelect)[];
  attempts: (typeof generationAttempts.$inferSelect)[];
  candidates: Array<
    typeof candidates.$inferSelect & {
      asset: typeof assets.$inferSelect | null;
      decision: typeof reviewDecisions.$inferSelect | null;
    }
  >;
  status: RequestStatus;
  approvedCount: number;
  spendUsd: number;
}

export function toProjectionInput(loaded: {
  request: { closedAt: Date | null; requiredApprovals: number };
  product: { photoUrl: string | null };
  row: { photoPreflight: "OK" | "FAILED" | "SKIPPED" };
  directions: { version: number }[];
  attempts: { state: ProjectionInput["attempts"][number]["state"]; failureCode: string | null; directionVersionId: string; createdAt: Date }[];
  directionVersionById: Map<string, number>;
  candidates: {
    createdAt: Date;
    attemptDirectionVersion: number;
    assetState: "PENDING" | "STORED" | "FAILED" | null;
    decision: { decision: "APPROVED" | "REJECTED"; reason: RejectionReason | null; reviewedAt: Date } | null;
  }[];
}): ProjectionInput {
  const latestDirectionVersion = Math.max(1, ...loaded.directions.map((d) => d.version));
  const hasAttempts = loaded.attempts.length > 0;
  const needsInput =
    !loaded.product.photoUrl || (loaded.row.photoPreflight === "FAILED" && !hasAttempts);

  return {
    closed: loaded.request.closedAt !== null,
    needsInput,
    requiredApprovals: loaded.request.requiredApprovals,
    latestDirectionVersion,
    attempts: loaded.attempts.map((a) => ({
      state: a.state,
      failureCode: a.failureCode,
      directionVersion: loaded.directionVersionById.get(a.directionVersionId) ?? 1,
      createdAt: a.createdAt.toISOString(),
    })),
    candidates: loaded.candidates.map((c) => ({
      directionVersion: c.attemptDirectionVersion,
      assetState: c.assetState ?? "PENDING",
      decision: c.decision
        ? {
            decision: c.decision.decision,
            reason: c.decision.reason,
            reviewedAt: c.decision.reviewedAt.toISOString(),
          }
        : null,
      createdAt: c.createdAt.toISOString(),
    })),
  };
}

export async function loadRequests(requestIds: string[]): Promise<Map<string, LoadedRequest>> {
  if (requestIds.length === 0) return new Map();

  const requests = await db()
    .select()
    .from(shotRequests)
    .where(inArray(shotRequests.id, requestIds));
  const ids = requests.map((r) => r.id);

  const [rows, prods, dirs, atts, cands] = await Promise.all([
    db().select().from(importRows).where(inArray(importRows.shotRequestId, ids)),
    db()
      .select()
      .from(products)
      .where(inArray(products.id, [...new Set(requests.map((r) => r.productId))])),
    db().select().from(directionVersions).where(inArray(directionVersions.shotRequestId, ids)),
    db().select().from(generationAttempts).where(inArray(generationAttempts.shotRequestId, ids)),
    db()
      .select({
        candidate: candidates,
        asset: assets,
        decision: reviewDecisions,
      })
      .from(candidates)
      .leftJoin(assets, eq(candidates.assetId, assets.id))
      .leftJoin(reviewDecisions, eq(reviewDecisions.candidateId, candidates.id))
      .where(inArray(candidates.shotRequestId, ids)),
  ]);

  const rowByRequest = new Map(rows.map((r) => [r.shotRequestId!, r]));
  const productById = new Map(prods.map((p) => [p.id, p]));
  const dirVersionById = new Map(dirs.map((d) => [d.id, d.version]));
  const attemptById = new Map(atts.map((a) => [a.id, a]));

  const result = new Map<string, LoadedRequest>();
  for (const request of requests) {
    const row = rowByRequest.get(request.id);
    const product = productById.get(request.productId);
    if (!row || !product) continue;

    const directions = dirs
      .filter((d) => d.shotRequestId === request.id)
      .sort((a, b) => a.version - b.version);
    const attempts = atts
      .filter((a) => a.shotRequestId === request.id)
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());
    const requestCandidates = cands
      .filter((c) => c.candidate.shotRequestId === request.id)
      .map((c) => ({ ...c.candidate, asset: c.asset, decision: c.decision }))
      .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

    const input = toProjectionInput({
      request,
      product,
      row,
      directions,
      attempts,
      directionVersionById: dirVersionById,
      candidates: requestCandidates.map((c) => {
        const attempt = attemptById.get(c.generationAttemptId);
        return {
          createdAt: c.createdAt,
          attemptDirectionVersion: attempt
            ? (dirVersionById.get(attempt.directionVersionId) ?? 1)
            : 1,
          assetState: c.asset?.storeState ?? null,
          decision: c.decision
            ? {
                decision: c.decision.decision,
                reason: c.decision.reason,
                reviewedAt: c.decision.reviewedAt,
              }
            : null,
        };
      }),
    });

    const approvedCount = requestCandidates.filter(
      (c) => c.decision?.decision === "APPROVED" && c.asset?.storeState === "STORED",
    ).length;
    const spendUsd = attempts
      .filter((a) => a.state === "COMPLETED")
      .reduce((sum, a) => sum + Number(a.priceSnapshotUsd), 0);

    result.set(request.id, {
      request,
      product,
      row,
      directions,
      attempts,
      candidates: requestCandidates,
      status: projectRequestStatus(input),
      approvedCount,
      spendUsd: Number(spendUsd.toFixed(4)),
    });
  }
  return result;
}

export async function loadRequestsByImport(importId: string): Promise<Map<string, LoadedRequest>> {
  const ids = await db()
    .select({ id: shotRequests.id })
    .from(shotRequests)
    .where(eq(shotRequests.importId, importId));
  return loadRequests(ids.map((r) => r.id));
}
