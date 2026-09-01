import { EXPORT_STATUS_LABELS, type RequestStatus } from "@shots/shared";

export interface ImportRowLike {
  rowIndex: number;
  raw: Record<string, string>;
  shotRequestId: string | null;
  deferredAt: Date | null;
  shotIdea: string | null;
}

export interface ExportCandidateLike {
  asset: { publicId: string; storeState: "PENDING" | "STORED" | "FAILED" } | null;
  decision: { decision: "APPROVED" | "REJECTED"; reviewedAt: Date } | null;
}

export interface LoadedRequestLike {
  status: RequestStatus;
  requiredApprovals: number;
  candidates: ExportCandidateLike[];
}

function shotStatus(row: ImportRowLike, request: LoadedRequestLike | undefined): string {
  if (request) return EXPORT_STATUS_LABELS[request.status];
  if (row.deferredAt || row.shotIdea) return "Not started";
  return "No request";
}

function approvedInReviewOrder(request: LoadedRequestLike): ExportCandidateLike[] {
  return request.candidates
    .filter((c) => c.decision?.decision === "APPROVED" && c.asset?.storeState === "STORED")
    .sort((a, b) => a.decision!.reviewedAt.getTime() - b.decision!.reviewedAt.getTime());
}

function lastReviewedAt(request: LoadedRequestLike | undefined): string {
  if (!request) return "";
  const times = request.candidates
    .filter((c) => c.decision !== null)
    .map((c) => c.decision!.reviewedAt.getTime());
  return times.length === 0 ? "" : new Date(Math.max(...times)).toISOString();
}

export function buildExportRows(input: {
  headers: string[];
  rows: ImportRowLike[];
  // Keyed by the row's shotRequestId (loadRequestsByImport's request-id keys).
  requestsByRowId: Map<string, LoadedRequestLike>;
  apiPublicUrl: string;
}): { header: string[]; records: string[][] } {
  const { headers, rows, requestsByRowId, apiPublicUrl } = input;

  const imageColumns = Math.max(
    3,
    ...[...requestsByRowId.values()].map((r) => r.requiredApprovals),
  );

  const header = [
    ...headers,
    "Shot Status",
    "Approved Count",
    ...Array.from({ length: imageColumns }, (_, i) => `Approved Image ${i + 1}`),
    "Last Reviewed At",
  ];

  const base = apiPublicUrl.replace(/\/+$/, "");

  const records = [...rows]
    .sort((a, b) => a.rowIndex - b.rowIndex)
    .map((row) => {
      const request = row.shotRequestId
        ? requestsByRowId.get(row.shotRequestId)
        : undefined;
      const approved = request ? approvedInReviewOrder(request) : [];

      return [
        ...headers.map((h) => row.raw[h] ?? ""),
        shotStatus(row, request),
        String(approved.length),
        ...Array.from({ length: imageColumns }, (_, i) =>
          approved[i] ? `${base}/assets/${approved[i]!.asset!.publicId}` : "",
        ),
        lastReviewedAt(request),
      ];
    });

  return { header, records };
}

export function computeImportReady(requests: { status: RequestStatus }[]): boolean {
  return requests.every((r) => r.status === "READY" || r.status === "CLOSED");
}

export function exportFilename(originalFilename: string, ready: boolean, date: Date): string {
  const basename = originalFilename.split("/").pop()!.split("\\").pop()!;
  const stem = basename.replace(/\.[^.]*$/, "") || "export";
  return `${stem}-${ready ? "ready" : "partial"}-${date.toISOString().slice(0, 10)}.csv`;
}
