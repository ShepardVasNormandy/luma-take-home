import { describe, expect, it } from "vitest";
import { computeImportCounts } from "../src/imports/counts.js";

const row = (
  importId: string,
  creativeWork: "NO_REQUEST" | "REQUEST_ELIGIBLE" | "NEEDS_INPUT",
  deferred = false,
) => ({ importId, creativeWork, deferredAt: deferred ? new Date() : null });

describe("computeImportCounts", () => {
  it("counts request statuses and row facts per import", () => {
    const counts = computeImportCounts(
      ["a", "b"],
      [
        { importId: "a", status: "AWAITING_REVIEW" },
        { importId: "a", status: "AWAITING_REVIEW" },
        { importId: "a", status: "READY" },
        { importId: "b", status: "READY_TO_GENERATE" },
      ],
      [
        row("a", "REQUEST_ELIGIBLE"),
        row("a", "NO_REQUEST"),
        row("a", "REQUEST_ELIGIBLE", true),
        row("b", "NEEDS_INPUT"),
        row("b", "NO_REQUEST"),
      ],
    );

    expect(counts["a"]).toEqual({ awaitingReview: 2, ready: 1, noRequest: 1, deferred: 1 });
    expect(counts["b"]).toEqual({ awaitingReview: 0, ready: 0, noRequest: 1, deferred: 0 });
  });

  it("returns zeroes for an import with no rows or requests", () => {
    expect(computeImportCounts(["bare"], [], [])).toEqual({
      bare: { awaitingReview: 0, ready: 0, noRequest: 0, deferred: 0 },
    });
  });

  it("does not double-count a deferred NO_REQUEST row across facts", () => {
    const counts = computeImportCounts(["a"], [], [row("a", "NO_REQUEST", true)]);
    expect(counts["a"]).toEqual({ awaitingReview: 0, ready: 0, noRequest: 1, deferred: 1 });
  });
});
