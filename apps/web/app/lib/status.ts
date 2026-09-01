import type { ImportReadiness, RejectionReason, RequestStatus } from "@shots/shared";
import { PRICE_USD } from "@shots/shared";

export const PRICE_PER_IMAGE = PRICE_USD["uni-1"].imageEdit;

export const READINESS_LABELS: Record<ImportReadiness, string> = {
  READY: "Import ready",
  PARTIAL: "Not ready yet",
  NOT_STARTED: "Not started",
  NO_REQUESTS: "No requests",
};

export const STATUS_LABELS: Record<RequestStatus, string> = {
  CLOSED: "Closed",
  NEEDS_INPUT: "Needs input",
  GENERATING: "Generating",
  AWAITING_REVIEW: "Awaiting review",
  READY: "Ready",
  GENERATION_BLOCKED: "Blocked",
  GENERATION_FAILED: "Failed",
  NEEDS_REVISION: "Needs revision",
  IN_PROGRESS: "In progress",
  READY_TO_GENERATE: "Ready to generate",
};

export const STATUS_EXPLANATIONS: Record<RequestStatus, string> = {
  CLOSED: "Closed by the operator — reopen to resume work.",
  NEEDS_INPUT: "Required generation input is missing or unreachable (source photo) — fix it, then generate.",
  GENERATING: "The provider is working on this — new candidates appear as they finish.",
  AWAITING_REVIEW: "A candidate is waiting for Ellie's decision.",
  READY: "Approved shots meet the target — nothing left to do here.",
  GENERATION_BLOCKED: "The provider refused this direction (moderation) — revise it below, then generate again.",
  GENERATION_FAILED: "The last attempt failed — check the log below, then retry manually.",
  NEEDS_REVISION: "Ellie rejected this direction — revise it below, then generate again.",
  IN_PROGRESS: "Partially approved — generate more candidates to reach the target.",
  READY_TO_GENERATE: "Nothing in flight — the next step is generating a candidate.",
};

export function statusChipClass(status: RequestStatus): string {
  switch (status) {
    case "READY":
      return "chip chip-green";
    case "AWAITING_REVIEW":
      return "chip chip-amber";
    case "NEEDS_REVISION":
    case "GENERATION_BLOCKED":
    case "GENERATION_FAILED":
    case "NEEDS_INPUT":
      return "chip chip-red";
    case "GENERATING":
      return "chip chip-blue chip-pulse";
    case "CLOSED":
      return "chip chip-gray";
    default:
      return "chip chip-neutral";
  }
}

export const REASON_LABELS: Record<RejectionReason, string> = {
  WRONG_PRODUCT_FIDELITY: "Product fidelity",
  DOESNT_MATCH_IDEA: "Doesn't match the idea",
  COMPOSITION: "Composition",
  LIGHTING_COLOR: "Lighting / color",
  TOO_STAGED: "Too staged",
  OTHER: "Other",
};

export const usd = (n: number): string => `$${n.toFixed(2)}`;

export const usdExact = (n: number): string =>
  `$${n.toFixed(4).replace(/0+$/, "").replace(/\.$/, ".00")}`;

export const shortDate = (iso: string): string =>
  new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export const dateTime = (iso: string): string =>
  new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export function latency(submittedAt: string | null, completedAt: string | null): string {
  if (!submittedAt || !completedAt) return "—";
  const ms = new Date(completedAt).getTime() - new Date(submittedAt).getTime();
  if (ms < 0) return "—";
  return `${(ms / 1000).toFixed(1)}s`;
}
