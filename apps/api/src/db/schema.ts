import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  integer,
  jsonb,
  numeric,
  pgEnum,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

export const validityEnum = pgEnum("validity", ["VALID", "INVALID"]);

export const productReconciliationEnum = pgEnum("product_reconciliation", [
  "NEW_PRODUCT",
  "PRODUCT_UNCHANGED",
  "PRODUCT_CHANGED",
  "INVALID",
]);

export const creativeWorkEnum = pgEnum("creative_work", [
  "NO_REQUEST",
  "REQUEST_ELIGIBLE",
  "NEEDS_INPUT",
]);

export const photoPreflightEnum = pgEnum("photo_preflight", [
  "OK",
  "FAILED",
  "SKIPPED",
]);

export const reconciliationChoiceEnum = pgEnum("reconciliation_choice", [
  "USE_IMPORTED",
  "KEEP_EXISTING",
]);

export const directionProvenanceEnum = pgEnum("direction_provenance", [
  "INITIAL",
  "OPERATOR_EDITED",
]);

export const attemptStateEnum = pgEnum("attempt_state", [
  "SUBMITTING",
  "POSTING",
  "QUEUED",
  "PROCESSING",
  "COMPLETED",
  "FAILED",
  "UNKNOWN",
]);

export const storeStateEnum = pgEnum("store_state", [
  "PENDING",
  "STORED",
  "FAILED",
]);

export const reviewDecisionEnum = pgEnum("review_decision", [
  "APPROVED",
  "REJECTED",
]);

export const rejectionReasonEnum = pgEnum("rejection_reason", [
  "WRONG_PRODUCT_FIDELITY",
  "DOESNT_MATCH_IDEA",
  "COMPOSITION",
  "LIGHTING_COLOR",
  "TOO_STAGED",
  "OTHER",
]);

export const imports = pgTable("imports", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  originalFilename: text("original_filename").notNull(),
  contentHash: text("content_hash").notNull().unique(),
  headers: jsonb("headers").notNull(),
  rowCount: integer("row_count").notNull(),
  confirmedAt: timestamp("confirmed_at", { withTimezone: true }),
});

export const importRows = pgTable(
  "import_rows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "restrict" }),
    rowIndex: integer("row_index").notNull(),
    raw: jsonb("raw").notNull(),
    sku: text("sku"),
    productName: text("product_name"),
    category: text("category"),
    colorFinish: text("color_finish"),
    material: text("material"),
    priceRaw: text("price_raw"),
    photoUrl: text("photo_url"),
    shotIdea: text("shot_idea"),
    notes: text("notes"),
    validity: validityEnum("validity").notNull(),
    invalidReason: text("invalid_reason"),
    productReconciliation: productReconciliationEnum(
      "product_reconciliation",
    ).notNull(),
    creativeWork: creativeWorkEnum("creative_work").notNull(),
    photoChanged: boolean("photo_changed").notNull(),
    photoPreflight: photoPreflightEnum("photo_preflight").notNull(),
    reconciliationChoice: reconciliationChoiceEnum("reconciliation_choice"),
    deferredAt: timestamp("deferred_at", { withTimezone: true }),
    shotRequestId: uuid("shot_request_id").references(
      (): AnyPgColumn => shotRequests.id,
      { onDelete: "restrict" },
    ),
  },
  (t) => [unique().on(t.importId, t.rowIndex)],
);

export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  sku: text("sku").notNull().unique(),
  name: text("name"),
  category: text("category"),
  colorFinish: text("color_finish"),
  material: text("material"),
  priceRaw: text("price_raw"),
  photoUrl: text("photo_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

export const shotRequests = pgTable(
  "shot_requests",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id, { onDelete: "restrict" }),
    importId: uuid("import_id")
      .notNull()
      .references(() => imports.id, { onDelete: "restrict" }),
    importRowId: uuid("import_row_id")
      .notNull()
      .references(() => importRows.id, { onDelete: "restrict" }),
    shotIdea: text("shot_idea").notNull(),
    requiredApprovals: integer("required_approvals").notNull().default(2),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closeReason: text("close_reason"),
  },
  (t) => [
    check("shot_requests_required_approvals_check", sql`${t.requiredApprovals} >= 1`),
  ],
);

export const directionVersions = pgTable(
  "direction_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    shotRequestId: uuid("shot_request_id")
      .notNull()
      .references(() => shotRequests.id, { onDelete: "restrict" }),
    version: integer("version").notNull(),
    content: text("content").notNull(),
    provenance: directionProvenanceEnum("provenance").notNull(),
  },
  (t) => [unique().on(t.shotRequestId, t.version)],
);

export const generationAttempts = pgTable("generation_attempts", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  shotRequestId: uuid("shot_request_id")
    .notNull()
    .references(() => shotRequests.id, { onDelete: "restrict" }),
  directionVersionId: uuid("direction_version_id")
    .notNull()
    .references(() => directionVersions.id, { onDelete: "restrict" }),
  state: attemptStateEnum("state").notNull(),
  providerGenerationId: text("provider_generation_id"),
  failureCode: text("failure_code"),
  failureReason: text("failure_reason"),
  requestPayload: jsonb("request_payload").notNull(),
  sourceSnapshot: jsonb("source_snapshot").notNull(),
  model: text("model").notNull(),
  priceSnapshotUsd: numeric("price_snapshot_usd").notNull(),
  submittedAt: timestamp("submitted_at", { withTimezone: true }),
  completedAt: timestamp("completed_at", { withTimezone: true }),
});

export const candidates = pgTable("candidates", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  shotRequestId: uuid("shot_request_id")
    .notNull()
    .references(() => shotRequests.id, { onDelete: "restrict" }),
  generationAttemptId: uuid("generation_attempt_id")
    .notNull()
    .unique()
    .references(() => generationAttempts.id, { onDelete: "restrict" }),
  assetId: uuid("asset_id").references(() => assets.id, {
    onDelete: "restrict",
  }),
});

export const assets = pgTable("assets", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  publicId: text("public_id").notNull().unique(),
  storageKey: text("storage_key").notNull(),
  contentType: text("content_type").notNull(),
  bytes: integer("bytes"),
  providerUrlSnapshot: text("provider_url_snapshot").notNull(),
  storeState: storeStateEnum("store_state").notNull(),
  retryCount: integer("retry_count").notNull().default(0),
  nextRetryAt: timestamp("next_retry_at", { withTimezone: true }),
  storedAt: timestamp("stored_at", { withTimezone: true }),
});

export const reviewSessions = pgTable("review_sessions", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  importId: uuid("import_id")
    .notNull()
    .unique()
    .references(() => imports.id, { onDelete: "restrict" }),
  tokenHash: text("token_hash").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
  lastSentAt: timestamp("last_sent_at", { withTimezone: true }).notNull(),
  sendCount: integer("send_count").notNull(),
});

export const reviewDecisions = pgTable("review_decisions", {
  id: uuid("id").primaryKey().defaultRandom(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  candidateId: uuid("candidate_id")
    .notNull()
    .unique()
    .references(() => candidates.id, { onDelete: "restrict" }),
  decision: reviewDecisionEnum("decision").notNull(),
  reason: rejectionReasonEnum("reason"),
  comment: text("comment"),
  reviewedAt: timestamp("reviewed_at", { withTimezone: true }).notNull(),
});

export const appSettings = pgTable("app_settings", {
  key: text("key").primaryKey(),
  value: jsonb("value").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});
