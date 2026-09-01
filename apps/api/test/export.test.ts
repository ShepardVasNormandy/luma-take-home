import { describe, expect, it } from "vitest";
import { EXPORT_STATUS_LABELS, REQUEST_STATUSES } from "@shots/shared";
import {
  buildExportRows,
  computeImportReadiness,
  exportFilename,
  type ExportCandidateLike,
  type ImportRowLike,
  type LoadedRequestLike,
} from "../src/exports/builder.js";

const API = "http://api.test";

function mkRow(over: Partial<ImportRowLike> = {}): ImportRowLike {
  return {
    rowIndex: 0,
    raw: {},
    shotRequestId: null,
    deferredAt: null,
    shotIdea: null,
    ...over,
  };
}

function mkRequest(over: Partial<LoadedRequestLike> = {}): LoadedRequestLike {
  return { status: "GENERATING", requiredApprovals: 2, candidates: [], ...over };
}

function approved(publicId: string, reviewedAt: string): ExportCandidateLike {
  return {
    asset: { publicId, storeState: "STORED" },
    decision: { decision: "APPROVED", reviewedAt: new Date(reviewedAt) },
  };
}

function build(
  rows: ImportRowLike[],
  requests: [string, LoadedRequestLike][] = [],
  headers: string[] = ["SKU"],
) {
  return buildExportRows({
    headers,
    rows,
    requestsByRowId: new Map(requests),
    apiPublicUrl: API,
  });
}

describe("buildExportRows — semantic preservation", () => {
  const headers = ["SKU", "Product Name", "Mystery Column", "Shot Idea"];

  it("emits original columns in stored header order, not raw key order", () => {
    const raw = {
      "Shot Idea": "on a beach",
      SKU: "HG-001",
      "Mystery Column": "kept, verbatim ☃",
      "Product Name": "Mug",
    };
    const { header, records } = build(
      [mkRow({ raw, shotIdea: "on a beach", shotRequestId: "req-1" })],
      [["req-1", mkRequest()]],
      headers,
    );

    expect(header.slice(0, 4)).toEqual(headers);
    expect(records[0]!.slice(0, 4)).toEqual([
      "HG-001",
      "Mug",
      "kept, verbatim ☃",
      "on a beach",
    ]);
  });

  it("preserves unknown columns and blanks missing keys", () => {
    const { records } = build([mkRow({ raw: { "Mystery Column": "x" } })], [], headers);
    expect(records[0]!.slice(0, 4)).toEqual(["", "", "x", ""]);
  });

  it("orders records by rowIndex", () => {
    const { records } = build([
      mkRow({ rowIndex: 2, raw: { SKU: "third" } }),
      mkRow({ rowIndex: 0, raw: { SKU: "first" } }),
      mkRow({ rowIndex: 1, raw: { SKU: "second" } }),
    ]);
    expect(records.map((r) => r[0])).toEqual(["first", "second", "third"]);
  });
});

describe("buildExportRows — Shot Status vocabulary", () => {
  it.each(REQUEST_STATUSES)("maps %s via EXPORT_STATUS_LABELS", (status) => {
    const { records } = build(
      [mkRow({ shotRequestId: "req-1", shotIdea: "idea" })],
      [["req-1", mkRequest({ status })]],
    );
    expect(records[0]![1]).toBe(EXPORT_STATUS_LABELS[status]);
  });

  it("no request, no idea, not deferred → No request", () => {
    const { records } = build([mkRow()]);
    expect(records[0]![1]).toBe("No request");
  });

  it("deferred row without request → Not started", () => {
    const { records } = build([
      mkRow({ shotIdea: "idea", deferredAt: new Date("2026-08-01T00:00:00Z") }),
    ]);
    expect(records[0]![1]).toBe("Not started");
  });

  it("idea present, no request, not deferred → Not started", () => {
    const { records } = build([mkRow({ shotIdea: "idea" })]);
    expect(records[0]![1]).toBe("Not started");
  });
});

describe("buildExportRows — column math", () => {
  it("defaults to Approved Image 1..3", () => {
    const { header } = build([mkRow()], [["req-1", mkRequest({ requiredApprovals: 2 })]]);
    expect(header.slice(1)).toEqual([
      "Shot Status",
      "Approved Count",
      "Approved Image 1",
      "Approved Image 2",
      "Approved Image 3",
      "Last Reviewed At",
    ]);
  });

  it("widens to the highest requiredApprovals in the import", () => {
    const { header } = build(
      [mkRow()],
      [
        ["req-1", mkRequest({ requiredApprovals: 4 })],
        ["req-2", mkRequest({ requiredApprovals: 2 })],
      ],
    );
    expect(header).toContain("Approved Image 4");
    expect(header).not.toContain("Approved Image 5");
  });
});

describe("buildExportRows — approvals", () => {
  it("fills image slots by reviewedAt ascending, skipping unstored/rejected/undecided", () => {
    const request = mkRequest({
      requiredApprovals: 2,
      candidates: [
        approved("late", "2026-01-03T00:00:00Z"),
        {
          asset: { publicId: "rejected", storeState: "STORED" },
          decision: { decision: "REJECTED", reviewedAt: new Date("2026-01-04T00:00:00Z") },
        },
        approved("early", "2026-01-01T00:00:00Z"),
        {
          asset: { publicId: "pending", storeState: "PENDING" },
          decision: { decision: "APPROVED", reviewedAt: new Date("2026-01-02T00:00:00Z") },
        },
        { asset: null, decision: null },
      ],
    });
    const { records } = build(
      [mkRow({ shotRequestId: "req-1", shotIdea: "idea" })],
      [["req-1", request]],
    );

    const [, , count, img1, img2, img3, lastReviewed] = records[0]!;
    expect(count).toBe("2");
    expect(img1).toBe(`${API}/assets/early`);
    expect(img2).toBe(`${API}/assets/late`);
    expect(img3).toBe("");
    expect(lastReviewed).toBe("2026-01-04T00:00:00.000Z");
  });

  it("leaves approval columns empty when nothing was reviewed", () => {
    const { records } = build(
      [mkRow({ shotRequestId: "req-1", shotIdea: "idea" })],
      [["req-1", mkRequest()]],
    );
    const [, , count, img1, img2, img3, lastReviewed] = records[0]!;
    expect([count, img1, img2, img3, lastReviewed]).toEqual(["0", "", "", "", ""]);
  });
});

describe("computeImportReadiness", () => {
  const noRequest = { creativeWork: "NO_REQUEST" as const };
  const eligible = { creativeWork: "REQUEST_ELIGIBLE" as const };
  const needsInput = { creativeWork: "NEEDS_INPUT" as const };

  it("is NO_REQUESTS when no requests exist and no row ever had a workable idea", () => {
    expect(computeImportReadiness([], [])).toBe("NO_REQUESTS");
    expect(computeImportReadiness([], [noRequest, noRequest])).toBe("NO_REQUESTS");
  });

  it("is NOT_STARTED when work could have started but no request was created", () => {
    expect(computeImportReadiness([], [noRequest, eligible])).toBe("NOT_STARTED");
    expect(computeImportReadiness([], [needsInput])).toBe("NOT_STARTED");
  });

  it("is READY when at least one request exists and every request is READY or CLOSED", () => {
    expect(
      computeImportReadiness([{ status: "READY" }, { status: "CLOSED" }], [eligible, noRequest]),
    ).toBe("READY");
  });

  it("stays READY when everything was explicitly closed", () => {
    expect(computeImportReadiness([{ status: "CLOSED" }], [eligible])).toBe("READY");
  });

  it("is PARTIAL when any request is elsewhere in the lifecycle", () => {
    expect(
      computeImportReadiness([{ status: "READY" }, { status: "GENERATING" }], [eligible]),
    ).toBe("PARTIAL");
  });
});

describe("exportFilename", () => {
  const date = new Date("2026-09-01T10:30:00Z");

  it("carries basename, readiness token, and date", () => {
    expect(exportFilename("september-drop.csv", "READY", date)).toBe(
      "september-drop-ready-2026-09-01.csv",
    );
  });

  it("marks partial exports", () => {
    expect(exportFilename("september-drop.csv", "PARTIAL", date)).toBe(
      "september-drop-partial-2026-09-01.csv",
    );
  });

  it("marks not-started exports", () => {
    expect(exportFilename("september-drop.csv", "NOT_STARTED", date)).toBe(
      "september-drop-not-started-2026-09-01.csv",
    );
  });

  it("marks no-requests exports", () => {
    expect(exportFilename("september-drop.csv", "NO_REQUESTS", date)).toBe(
      "september-drop-no-requests-2026-09-01.csv",
    );
  });

  it("strips only the last extension", () => {
    expect(exportFilename("catalog.v2.csv", "READY", date)).toBe(
      "catalog.v2-ready-2026-09-01.csv",
    );
  });

  it("handles names without an extension", () => {
    expect(exportFilename("catalog", "READY", date)).toBe("catalog-ready-2026-09-01.csv");
  });
});
