import type {
  AssetStoreState,
  AttemptState,
  ImportReadiness,
  RejectionReason,
  RequestStatus,
} from "@shots/shared";

export interface ImportRecord {
  id: string;
  createdAt: string;
  originalFilename: string;
  contentHash: string;
  headers: string[];
  rowCount: number;
  confirmedAt: string | null;
  readiness?: ImportReadiness;
  counts?: {
    awaitingReview: number;
    ready: number;
    noRequest: number;
    deferred: number;
  };
}

export interface ProductRecord {
  id: string;
  sku: string;
  name: string | null;
  category: string | null;
  colorFinish: string | null;
  material: string | null;
  priceRaw: string | null;
  photoUrl: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProductListItem extends ProductRecord {
  requestCount: number;
  statusCounts: Partial<Record<RequestStatus, number>>;
  approvedCount: number;
  approvedAssetPublicId: string | null;
}

export interface ProductRequestSummary {
  id: string;
  importId: string;
  importFilename: string | null;
  shotIdea: string;
  status: RequestStatus;
  approvedCount: number;
  requiredApprovals: number;
  spendUsd: number;
  createdAt: string;
}

export interface ProductAppearance {
  importId: string;
  importFilename: string;
  importedAt: string;
  confirmedAt: string | null;
  rowIndex: number;
  shotIdea: string | null;
  notes: string | null;
  productReconciliation: "NEW_PRODUCT" | "PRODUCT_UNCHANGED" | "PRODUCT_CHANGED" | "INVALID";
  creativeWork: "NO_REQUEST" | "REQUEST_ELIGIBLE" | "NEEDS_INPUT";
  deferredAt: string | null;
  shotRequestId: string | null;
}

export interface ProductDetail {
  product: ProductRecord;
  requests: ProductRequestSummary[];
  appearances: ProductAppearance[];
}

export interface ImportRow {
  id: string;
  createdAt: string;
  importId: string;
  rowIndex: number;
  raw: Record<string, string>;
  sku: string | null;
  productName: string | null;
  category: string | null;
  colorFinish: string | null;
  material: string | null;
  priceRaw: string | null;
  photoUrl: string | null;
  shotIdea: string | null;
  notes: string | null;
  validity: "VALID" | "INVALID";
  invalidReason: string | null;
  productReconciliation: "NEW_PRODUCT" | "PRODUCT_UNCHANGED" | "PRODUCT_CHANGED" | "INVALID";
  creativeWork: "NO_REQUEST" | "REQUEST_ELIGIBLE" | "NEEDS_INPUT";
  photoChanged: boolean;
  photoPreflight: "OK" | "FAILED" | "SKIPPED";
  reconciliationChoice: "USE_IMPORTED" | "KEEP_EXISTING" | null;
  deferredAt: string | null;
  shotRequestId: string | null;
}

export interface ImportDetail {
  import: ImportRecord;
  rows: ImportRow[];
  currentProducts: Record<string, ProductRecord>;
}

export interface RequestCandidate {
  id: string;
  createdAt: string;
  assetPublicId: string | null;
  assetState: AssetStoreState | null;
  decision: {
    decision: "APPROVED" | "REJECTED";
    reason: RejectionReason | null;
    comment: string | null;
    reviewedAt: string;
  } | null;
}

export interface RequestAttempt {
  id: string;
  state: AttemptState;
  failureCode: string | null;
  failureReason: string | null;
  model: string;
  priceSnapshotUsd: string;
  createdAt: string;
  submittedAt: string | null;
  completedAt: string | null;
  providerGenerationId: string | null;
}

export interface DirectionVersion {
  id: string;
  version: number;
  content: string;
  provenance: "INITIAL" | "OPERATOR_EDITED";
  createdAt: string;
}

export interface ShotRequestDetail {
  id: string;
  importId: string;
  status: RequestStatus;
  shotIdea: string;
  requiredApprovals: number;
  approvedCount: number;
  spendUsd: number;
  closedAt: string | null;
  closeReason: string | null;
  product: {
    sku: string;
    name: string | null;
    colorFinish: string | null;
    material: string | null;
    photoUrl: string | null;
    priceRaw: string | null;
    category: string | null;
  };
  notes: string | null;
  directions: DirectionVersion[];
  candidates: RequestCandidate[];
  attempts: RequestAttempt[];
}

export interface ImportSummary {
  counts?: Partial<Record<RequestStatus, number>>;
  spendUsd?: number;
  readiness?: ImportReadiness;
  budgetExhausted?: boolean;
  [key: string]: unknown;
}

export interface SendReviewResult {
  sent: boolean;
  pendingCount: number;
  reviewUrl: string;
  emailError: string | null;
}
