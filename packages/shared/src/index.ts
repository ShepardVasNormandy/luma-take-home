export const REJECTION_REASONS = [
  "WRONG_PRODUCT_FIDELITY",
  "DOESNT_MATCH_IDEA",
  "COMPOSITION",
  "LIGHTING_COLOR",
  "TOO_STAGED",
  "OTHER",
] as const;

export type RejectionReason = (typeof REJECTION_REASONS)[number];

// CONTEXT.md "Rejection reason": WRONG_PRODUCT_FIDELITY indicts the generation,
// not the direction — it never gates. Everything else (including no reason) does.
export const invalidatesDirection = (reason: RejectionReason | null): boolean =>
  reason !== "WRONG_PRODUCT_FIDELITY";

export const REQUEST_STATUSES = [
  "CLOSED",
  "NEEDS_INPUT",
  "GENERATING",
  "AWAITING_REVIEW",
  "READY",
  "GENERATION_BLOCKED",
  "GENERATION_FAILED",
  "NEEDS_REVISION",
  "IN_PROGRESS",
  "READY_TO_GENERATE",
] as const;

export type RequestStatus = (typeof REQUEST_STATUSES)[number];

export const EXPORT_STATUS_LABELS: Record<RequestStatus, string> = {
  CLOSED: "Closed",
  NEEDS_INPUT: "Needs attention",
  GENERATING: "Generating",
  AWAITING_REVIEW: "Awaiting review",
  READY: "Ready",
  GENERATION_BLOCKED: "Needs revision",
  GENERATION_FAILED: "Needs attention",
  NEEDS_REVISION: "Needs revision",
  IN_PROGRESS: "In progress",
  READY_TO_GENERATE: "In progress",
};

export const IMPORT_READINESS = ["READY", "PARTIAL", "NOT_STARTED", "NO_REQUESTS"] as const;

export type ImportReadiness = (typeof IMPORT_READINESS)[number];

// docs/adr/0002: observed uni-1 image_edit pricing (price snapshot source).
export const PRICE_USD = {
  "uni-1": { imageEdit: 0.0434 },
} as const;

export type GenerationModel = keyof typeof PRICE_USD;

export * from "./projection.js";
