import type { RequestStatus } from "@shots/shared";

export interface ImportCounts {
  awaitingReview: number;
  ready: number;
  noRequest: number;
  deferred: number;
}

interface CountRowLike {
  importId: string;
  creativeWork: "NO_REQUEST" | "REQUEST_ELIGIBLE" | "NEEDS_INPUT";
  deferredAt: Date | null;
}

export function computeImportCounts(
  importIds: string[],
  requests: { importId: string; status: RequestStatus }[],
  rows: CountRowLike[],
): Record<string, ImportCounts> {
  const result: Record<string, ImportCounts> = {};
  for (const id of importIds) {
    result[id] = { awaitingReview: 0, ready: 0, noRequest: 0, deferred: 0 };
  }
  for (const r of requests) {
    const counts = result[r.importId];
    if (!counts) continue;
    if (r.status === "AWAITING_REVIEW") counts.awaitingReview++;
    if (r.status === "READY") counts.ready++;
  }
  for (const row of rows) {
    const counts = result[row.importId];
    if (!counts) continue;
    if (row.creativeWork === "NO_REQUEST") counts.noRequest++;
    if (row.deferredAt !== null) counts.deferred++;
  }
  return result;
}
