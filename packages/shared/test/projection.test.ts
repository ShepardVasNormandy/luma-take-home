import { describe, expect, it } from "vitest";
import {
  projectRequestStatus,
  type ProjectionCandidate,
  type ProjectionInput,
} from "../src/projection.js";

let clock = 0;
const ts = () => new Date(2026, 0, 1, 0, 0, ++clock).toISOString();

const base = (over: Partial<ProjectionInput> = {}): ProjectionInput => ({
  closed: false,
  needsInput: false,
  requiredApprovals: 2,
  latestDirectionVersion: 1,
  attempts: [],
  candidates: [],
  ...over,
});

const attempt = (
  state: ProjectionInput["attempts"][number]["state"],
  over: Partial<ProjectionInput["attempts"][number]> = {},
) => ({ state, failureCode: null, directionVersion: 1, createdAt: ts(), ...over });

const candidate = (over: Partial<ProjectionCandidate> = {}): ProjectionCandidate => ({
  directionVersion: 1,
  assetState: "STORED",
  decision: null,
  createdAt: ts(),
  ...over,
});

const approved = (over: Partial<ProjectionCandidate> = {}) =>
  candidate({ decision: { decision: "APPROVED", reason: null, reviewedAt: ts() }, ...over });

const rejected = (
  reason: Parameters<typeof projectRequestStatus>[0]["candidates"][number] extends never
    ? never
    : "WRONG_PRODUCT_FIDELITY" | "TOO_STAGED" | null,
  over: Partial<ProjectionCandidate> = {},
) => candidate({ decision: { decision: "REJECTED", reason, reviewedAt: ts() }, ...over });

describe("projectRequestStatus precedence (SPEC §3)", () => {
  it("CLOSED beats everything", () => {
    expect(
      projectRequestStatus(
        base({ closed: true, needsInput: true, attempts: [attempt("PROCESSING")] }),
      ),
    ).toBe("CLOSED");
  });

  it("NEEDS_INPUT beats generation", () => {
    expect(projectRequestStatus(base({ needsInput: true, attempts: [attempt("QUEUED")] }))).toBe(
      "NEEDS_INPUT",
    );
  });

  it("in-flight attempt → GENERATING", () => {
    for (const s of ["SUBMITTING", "POSTING", "QUEUED", "PROCESSING"] as const) {
      expect(projectRequestStatus(base({ attempts: [attempt(s)] }))).toBe("GENERATING");
    }
  });

  it("asset copy pending → GENERATING (still producing)", () => {
    expect(
      projectRequestStatus(
        base({ attempts: [attempt("COMPLETED")], candidates: [candidate({ assetState: "PENDING" })] }),
      ),
    ).toBe("GENERATING");
  });

  it("undecided reviewable candidate → AWAITING_REVIEW, even with an approval present", () => {
    expect(
      projectRequestStatus(base({ candidates: [approved(), candidate()] })),
    ).toBe("AWAITING_REVIEW");
  });

  it("approvals at target → READY despite a trailing rejection", () => {
    expect(
      projectRequestStatus(base({ candidates: [approved(), approved(), rejected("TOO_STAGED")] })),
    ).toBe("READY");
  });

  it("approval whose asset is lost does not count toward READY (asset existence is part of readiness)", () => {
    expect(
      projectRequestStatus(
        base({
          requiredApprovals: 1,
          attempts: [attempt("COMPLETED")],
          candidates: [approved({ assetState: "FAILED" })],
        }),
      ),
    ).toBe("GENERATION_FAILED");
  });

  it("content_moderated with no newer direction → GENERATION_BLOCKED", () => {
    expect(
      projectRequestStatus(
        base({ attempts: [attempt("FAILED", { failureCode: "content_moderated" })] }),
      ),
    ).toBe("GENERATION_BLOCKED");
  });

  it("content_moderated then revised direction → READY_TO_GENERATE", () => {
    expect(
      projectRequestStatus(
        base({
          latestDirectionVersion: 2,
          attempts: [attempt("FAILED", { failureCode: "content_moderated", directionVersion: 1 })],
        }),
      ),
    ).toBe("READY_TO_GENERATE");
  });

  it("latest attempt FAILED (other code) → GENERATION_FAILED", () => {
    expect(
      projectRequestStatus(base({ attempts: [attempt("FAILED", { failureCode: "generation_failed" })] })),
    ).toBe("GENERATION_FAILED");
  });

  it("latest attempt UNKNOWN → GENERATION_FAILED (manual retry surface)", () => {
    expect(projectRequestStatus(base({ attempts: [attempt("UNKNOWN")] }))).toBe("GENERATION_FAILED");
  });

  it("older failure superseded by newer completed attempt does not project failure", () => {
    expect(
      projectRequestStatus(
        base({
          attempts: [attempt("FAILED", { failureCode: "generation_failed" }), attempt("COMPLETED")],
          candidates: [approved()],
        }),
      ),
    ).toBe("IN_PROGRESS");
  });

  it("invalidating rejection at 0 approvals gates → NEEDS_REVISION", () => {
    expect(
      projectRequestStatus(base({ attempts: [attempt("COMPLETED")], candidates: [rejected("TOO_STAGED")] })),
    ).toBe("NEEDS_REVISION");
  });

  it("reason omitted defaults to gating → NEEDS_REVISION", () => {
    expect(
      projectRequestStatus(base({ attempts: [attempt("COMPLETED")], candidates: [rejected(null)] })),
    ).toBe("NEEDS_REVISION");
  });

  it("WRONG_PRODUCT_FIDELITY rejection never gates → READY_TO_GENERATE", () => {
    expect(
      projectRequestStatus(
        base({ attempts: [attempt("COMPLETED")], candidates: [rejected("WRONG_PRODUCT_FIDELITY")] }),
      ),
    ).toBe("READY_TO_GENERATE");
  });

  it("gating rejection cleared by a newer direction version → READY_TO_GENERATE", () => {
    expect(
      projectRequestStatus(
        base({
          latestDirectionVersion: 2,
          attempts: [attempt("COMPLETED")],
          candidates: [rejected("TOO_STAGED", { directionVersion: 1 })],
        }),
      ),
    ).toBe("READY_TO_GENERATE");
  });

  it("rejection after a first approval does not re-gate → IN_PROGRESS", () => {
    expect(
      projectRequestStatus(base({ candidates: [approved(), rejected("TOO_STAGED")] })),
    ).toBe("IN_PROGRESS");
  });

  it("partial approvals, nothing pending → IN_PROGRESS", () => {
    expect(projectRequestStatus(base({ requiredApprovals: 3, candidates: [approved()] }))).toBe(
      "IN_PROGRESS",
    );
  });

  it("fresh request with no history → READY_TO_GENERATE", () => {
    expect(projectRequestStatus(base())).toBe("READY_TO_GENERATE");
  });
});
