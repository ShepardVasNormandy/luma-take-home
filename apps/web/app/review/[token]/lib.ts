import { REJECTION_REASONS, type RejectionReason } from "@shots/shared";

export { REJECTION_REASONS };
export type { RejectionReason };

export type Decision = "APPROVED" | "REJECTED";

export type PendingEntry = {
  candidateId: string;
  assetPublicId: string;
  packshotUrl: string | null;
  productName: string | null;
  sku: string;
  shotIdea: string;
  approvedCount: number;
  requiredApprovals: number;
};

export type DecisionInfo = {
  decision: Decision;
  reason: RejectionReason | null;
  comment: string | null;
};

export type DecidedEntry = PendingEntry & {
  decision: DecisionInfo & { reviewedAt: string };
};

export type SessionData = {
  importName: string;
  counts: { pending: number; approved: number; rejected: number };
  pending: PendingEntry[];
  recentlyDecided: DecidedEntry[];
};

export type DecisionBody = {
  decision: Decision;
  reason: RejectionReason | null;
  comment: string | null;
};

export const REASON_LABELS: Record<RejectionReason, string> = {
  WRONG_PRODUCT_FIDELITY: "Product looks wrong",
  DOESNT_MATCH_IDEA: "Doesn't match the idea",
  COMPOSITION: "Composition",
  LIGHTING_COLOR: "Lighting / color",
  TOO_STAGED: "Too staged",
  OTHER: "Other",
};

export class ApiError extends Error {
  status: number;
  code: string | null;

  constructor(status: number, code: string | null) {
    super(`Request failed (${status})`);
    this.status = status;
    this.code = code;
  }
}

async function toApiError(res: Response): Promise<ApiError> {
  let code: string | null = null;
  try {
    code = ((await res.json()) as { code?: string }).code ?? null;
  } catch {
    code = null;
  }
  return new ApiError(res.status, code);
}

export async function fetchSession(token: string): Promise<SessionData> {
  const res = await fetch("/api/review/session", {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) throw await toApiError(res);
  return (await res.json()) as SessionData;
}

export async function putDecision(
  token: string,
  candidateId: string,
  body: DecisionBody,
): Promise<void> {
  const res = await fetch(`/api/review/candidates/${encodeURIComponent(candidateId)}/decision`, {
    method: "PUT",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw await toApiError(res);
}

export const assetUrl = (publicId: string) => `/api/assets/${encodeURIComponent(publicId)}`;

export function contextLine(entry: PendingEntry): string {
  if (entry.approvedCount > 0) {
    return `${entry.approvedCount} of ${entry.requiredApprovals} approved`;
  }
  const needed = Math.max(1, entry.requiredApprovals - entry.approvedCount);
  return `Needs ${needed} more approval${needed === 1 ? "" : "s"}`;
}
