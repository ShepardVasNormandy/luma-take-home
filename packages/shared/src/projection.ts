import { invalidatesDirection, type RejectionReason, type RequestStatus } from "./index.js";

export type AttemptState =
  | "SUBMITTING"
  | "POSTING"
  | "QUEUED"
  | "PROCESSING"
  | "COMPLETED"
  | "FAILED"
  | "UNKNOWN";

export type AssetStoreState = "PENDING" | "STORED" | "FAILED";

export interface ProjectionAttempt {
  state: AttemptState;
  failureCode: string | null;
  directionVersion: number;
  createdAt: string;
}

export interface ProjectionCandidate {
  directionVersion: number;
  assetState: AssetStoreState;
  decision: {
    decision: "APPROVED" | "REJECTED";
    reason: RejectionReason | null;
    reviewedAt: string;
  } | null;
  createdAt: string;
}

export interface ProjectionInput {
  closed: boolean;
  needsInput: boolean;
  requiredApprovals: number;
  latestDirectionVersion: number;
  attempts: ProjectionAttempt[];
  candidates: ProjectionCandidate[];
}

const IN_FLIGHT: ReadonlySet<AttemptState> = new Set(["SUBMITTING", "POSTING", "QUEUED", "PROCESSING"]);

const latestBy = <T>(items: T[], key: (t: T) => string): T | undefined =>
  items.reduce<T | undefined>((acc, item) => (!acc || key(item) > key(acc) ? item : acc), undefined);

// SPEC.md §3 — first match wins; each state names the next action blocking progress.
export function projectRequestStatus(input: ProjectionInput): RequestStatus {
  if (input.closed) return "CLOSED";
  if (input.needsInput) return "NEEDS_INPUT";

  const inFlight = input.attempts.some((a) => IN_FLIGHT.has(a.state));
  const assetCopying = input.candidates.some((c) => c.assetState === "PENDING");
  if (inFlight || assetCopying) return "GENERATING";

  const reviewable = input.candidates.filter((c) => c.assetState === "STORED");
  if (reviewable.some((c) => c.decision === null)) return "AWAITING_REVIEW";

  const approvals = reviewable.filter((c) => c.decision?.decision === "APPROVED").length;
  if (approvals >= input.requiredApprovals) return "READY";

  const latestAttempt = latestBy(input.attempts, (a) => a.createdAt);
  if (
    latestAttempt?.state === "FAILED" &&
    latestAttempt.failureCode === "content_moderated" &&
    input.latestDirectionVersion <= latestAttempt.directionVersion
  ) {
    return "GENERATION_BLOCKED";
  }

  const assetLost = input.candidates.some((c) => c.assetState === "FAILED");
  const latestAttemptDead =
    (latestAttempt?.state === "FAILED" && latestAttempt.failureCode !== "content_moderated") ||
    latestAttempt?.state === "UNKNOWN";
  if (assetLost || latestAttemptDead) return "GENERATION_FAILED";

  if (approvals === 0) {
    const latestDecided = latestBy(
      input.candidates.filter((c) => c.decision !== null),
      (c) => c.decision!.reviewedAt,
    );
    if (
      latestDecided?.decision?.decision === "REJECTED" &&
      invalidatesDirection(latestDecided.decision.reason) &&
      input.latestDirectionVersion <= latestDecided.directionVersion
    ) {
      return "NEEDS_REVISION";
    }
  }

  if (approvals >= 1) return "IN_PROGRESS";
  return "READY_TO_GENERATE";
}
