import type { RequestStatus } from "@shots/shared";

export interface ProductRequestFact {
  productId: string;
  status: RequestStatus;
  candidates: {
    decision: "APPROVED" | "REJECTED" | null;
    assetState: "PENDING" | "STORED" | "FAILED" | null;
    publicId: string | null;
    reviewedAt: Date | null;
  }[];
}

export interface ProductRequestSummary {
  requestCount: number;
  statusCounts: Partial<Record<RequestStatus, number>>;
  approvedCount: number;
  approvedAssetPublicId: string | null;
}

export function summarizeProductRequests(
  facts: ProductRequestFact[],
): Record<string, ProductRequestSummary> {
  const result: Record<string, ProductRequestSummary> = {};
  const latestApproval: Record<string, number> = {};

  for (const fact of facts) {
    const summary = (result[fact.productId] ??= {
      requestCount: 0,
      statusCounts: {},
      approvedCount: 0,
      approvedAssetPublicId: null,
    });
    summary.requestCount++;
    summary.statusCounts[fact.status] = (summary.statusCounts[fact.status] ?? 0) + 1;

    for (const c of fact.candidates) {
      if (c.decision !== "APPROVED" || c.assetState !== "STORED" || !c.publicId) continue;
      summary.approvedCount++;
      const approvedAt = c.reviewedAt?.getTime() ?? 0;
      if (approvedAt >= (latestApproval[fact.productId] ?? -1)) {
        latestApproval[fact.productId] = approvedAt;
        summary.approvedAssetPublicId = c.publicId;
      }
    }
  }
  return result;
}
