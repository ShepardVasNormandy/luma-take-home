import { describe, expect, it } from "vitest";
import { summarizeProductRequests, type ProductRequestFact } from "../src/products/summary.js";

const approved = (publicId: string, reviewedAt: string) => ({
  decision: "APPROVED" as const,
  assetState: "STORED" as const,
  publicId,
  reviewedAt: new Date(reviewedAt),
});

const fact = (
  productId: string,
  status: ProductRequestFact["status"],
  candidates: ProductRequestFact["candidates"] = [],
): ProductRequestFact => ({ productId, status, candidates });

describe("summarizeProductRequests", () => {
  it("aggregates request statuses per product", () => {
    const result = summarizeProductRequests([
      fact("p1", "AWAITING_REVIEW"),
      fact("p1", "READY"),
      fact("p1", "READY"),
      fact("p2", "NEEDS_INPUT"),
    ]);

    expect(result["p1"]).toMatchObject({
      requestCount: 3,
      statusCounts: { AWAITING_REVIEW: 1, READY: 2 },
    });
    expect(result["p2"]).toMatchObject({ requestCount: 1, statusCounts: { NEEDS_INPUT: 1 } });
  });

  it("counts only approved candidates with stored assets", () => {
    const result = summarizeProductRequests([
      fact("p1", "READY", [
        approved("asset-a", "2026-01-01T10:00:00Z"),
        { decision: "APPROVED", assetState: "FAILED", publicId: "broken", reviewedAt: new Date("2026-01-02T10:00:00Z") },
        { decision: "REJECTED", assetState: "STORED", publicId: "rejected", reviewedAt: new Date("2026-01-03T10:00:00Z") },
        { decision: null, assetState: "STORED", publicId: "undecided", reviewedAt: null },
      ]),
    ]);

    expect(result["p1"]!.approvedCount).toBe(1);
    expect(result["p1"]!.approvedAssetPublicId).toBe("asset-a");
  });

  it("picks the most recently approved stored candidate as representative", () => {
    const result = summarizeProductRequests([
      fact("p1", "READY", [approved("older", "2026-01-01T10:00:00Z")]),
      fact("p1", "IN_PROGRESS", [approved("newest", "2026-02-01T10:00:00Z")]),
    ]);

    expect(result["p1"]).toMatchObject({ approvedCount: 2, approvedAssetPublicId: "newest" });
  });

  it("returns null representative when nothing is approved", () => {
    const result = summarizeProductRequests([fact("p1", "READY_TO_GENERATE")]);
    expect(result["p1"]).toMatchObject({ approvedCount: 0, approvedAssetPublicId: null });
  });
});
