CREATE TYPE "public"."attempt_state" AS ENUM('SUBMITTING', 'POSTING', 'QUEUED', 'PROCESSING', 'COMPLETED', 'FAILED', 'UNKNOWN');--> statement-breakpoint
CREATE TYPE "public"."creative_work" AS ENUM('NO_REQUEST', 'REQUEST_ELIGIBLE', 'NEEDS_INPUT');--> statement-breakpoint
CREATE TYPE "public"."direction_provenance" AS ENUM('INITIAL', 'OPERATOR_EDITED');--> statement-breakpoint
CREATE TYPE "public"."photo_preflight" AS ENUM('OK', 'FAILED', 'SKIPPED');--> statement-breakpoint
CREATE TYPE "public"."product_reconciliation" AS ENUM('NEW_PRODUCT', 'PRODUCT_UNCHANGED', 'PRODUCT_CHANGED', 'INVALID');--> statement-breakpoint
CREATE TYPE "public"."reconciliation_choice" AS ENUM('USE_IMPORTED', 'KEEP_EXISTING');--> statement-breakpoint
CREATE TYPE "public"."rejection_reason" AS ENUM('WRONG_PRODUCT_FIDELITY', 'DOESNT_MATCH_IDEA', 'COMPOSITION', 'LIGHTING_COLOR', 'TOO_STAGED', 'OTHER');--> statement-breakpoint
CREATE TYPE "public"."review_decision" AS ENUM('APPROVED', 'REJECTED');--> statement-breakpoint
CREATE TYPE "public"."store_state" AS ENUM('PENDING', 'STORED', 'FAILED');--> statement-breakpoint
CREATE TYPE "public"."validity" AS ENUM('VALID', 'INVALID');--> statement-breakpoint
CREATE TABLE "app_settings" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "assets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"public_id" text NOT NULL,
	"storage_key" text NOT NULL,
	"content_type" text NOT NULL,
	"bytes" integer,
	"provider_url_snapshot" text NOT NULL,
	"store_state" "store_state" NOT NULL,
	"retry_count" integer DEFAULT 0 NOT NULL,
	"next_retry_at" timestamp with time zone,
	"stored_at" timestamp with time zone,
	CONSTRAINT "assets_public_id_unique" UNIQUE("public_id")
);
--> statement-breakpoint
CREATE TABLE "candidates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shot_request_id" uuid NOT NULL,
	"generation_attempt_id" uuid NOT NULL,
	"asset_id" uuid,
	CONSTRAINT "candidates_generation_attempt_id_unique" UNIQUE("generation_attempt_id")
);
--> statement-breakpoint
CREATE TABLE "direction_versions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shot_request_id" uuid NOT NULL,
	"version" integer NOT NULL,
	"content" text NOT NULL,
	"provenance" "direction_provenance" NOT NULL,
	CONSTRAINT "direction_versions_shot_request_id_version_unique" UNIQUE("shot_request_id","version")
);
--> statement-breakpoint
CREATE TABLE "generation_attempts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"shot_request_id" uuid NOT NULL,
	"direction_version_id" uuid NOT NULL,
	"state" "attempt_state" NOT NULL,
	"provider_generation_id" text,
	"failure_code" text,
	"failure_reason" text,
	"request_payload" jsonb NOT NULL,
	"source_snapshot" jsonb NOT NULL,
	"model" text NOT NULL,
	"price_snapshot_usd" numeric NOT NULL,
	"submitted_at" timestamp with time zone,
	"completed_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "import_rows" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_id" uuid NOT NULL,
	"row_index" integer NOT NULL,
	"raw" jsonb NOT NULL,
	"sku" text,
	"product_name" text,
	"category" text,
	"color_finish" text,
	"material" text,
	"price_raw" text,
	"photo_url" text,
	"shot_idea" text,
	"notes" text,
	"validity" "validity" NOT NULL,
	"invalid_reason" text,
	"product_reconciliation" "product_reconciliation" NOT NULL,
	"creative_work" "creative_work" NOT NULL,
	"photo_changed" boolean NOT NULL,
	"photo_preflight" "photo_preflight" NOT NULL,
	"reconciliation_choice" "reconciliation_choice",
	"deferred_at" timestamp with time zone,
	"shot_request_id" uuid,
	CONSTRAINT "import_rows_import_id_row_index_unique" UNIQUE("import_id","row_index")
);
--> statement-breakpoint
CREATE TABLE "imports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"original_filename" text NOT NULL,
	"content_hash" text NOT NULL,
	"headers" jsonb NOT NULL,
	"row_count" integer NOT NULL,
	"confirmed_at" timestamp with time zone,
	CONSTRAINT "imports_content_hash_unique" UNIQUE("content_hash")
);
--> statement-breakpoint
CREATE TABLE "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"sku" text NOT NULL,
	"name" text,
	"category" text,
	"color_finish" text,
	"material" text,
	"price_raw" text,
	"photo_url" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "products_sku_unique" UNIQUE("sku")
);
--> statement-breakpoint
CREATE TABLE "review_decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"candidate_id" uuid NOT NULL,
	"decision" "review_decision" NOT NULL,
	"reason" "rejection_reason",
	"comment" text,
	"reviewed_at" timestamp with time zone NOT NULL,
	CONSTRAINT "review_decisions_candidate_id_unique" UNIQUE("candidate_id")
);
--> statement-breakpoint
CREATE TABLE "review_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"import_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"last_sent_at" timestamp with time zone NOT NULL,
	"send_count" integer NOT NULL,
	CONSTRAINT "review_sessions_import_id_unique" UNIQUE("import_id")
);
--> statement-breakpoint
CREATE TABLE "shot_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"product_id" uuid NOT NULL,
	"import_id" uuid NOT NULL,
	"import_row_id" uuid NOT NULL,
	"shot_idea" text NOT NULL,
	"required_approvals" integer DEFAULT 2 NOT NULL,
	"closed_at" timestamp with time zone,
	"close_reason" text,
	CONSTRAINT "shot_requests_required_approvals_check" CHECK ("shot_requests"."required_approvals" >= 1)
);
--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_shot_request_id_shot_requests_id_fk" FOREIGN KEY ("shot_request_id") REFERENCES "public"."shot_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_generation_attempt_id_generation_attempts_id_fk" FOREIGN KEY ("generation_attempt_id") REFERENCES "public"."generation_attempts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "candidates" ADD CONSTRAINT "candidates_asset_id_assets_id_fk" FOREIGN KEY ("asset_id") REFERENCES "public"."assets"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "direction_versions" ADD CONSTRAINT "direction_versions_shot_request_id_shot_requests_id_fk" FOREIGN KEY ("shot_request_id") REFERENCES "public"."shot_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_shot_request_id_shot_requests_id_fk" FOREIGN KEY ("shot_request_id") REFERENCES "public"."shot_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "generation_attempts" ADD CONSTRAINT "generation_attempts_direction_version_id_direction_versions_id_fk" FOREIGN KEY ("direction_version_id") REFERENCES "public"."direction_versions"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "import_rows" ADD CONSTRAINT "import_rows_shot_request_id_shot_requests_id_fk" FOREIGN KEY ("shot_request_id") REFERENCES "public"."shot_requests"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_decisions" ADD CONSTRAINT "review_decisions_candidate_id_candidates_id_fk" FOREIGN KEY ("candidate_id") REFERENCES "public"."candidates"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "review_sessions" ADD CONSTRAINT "review_sessions_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_requests" ADD CONSTRAINT "shot_requests_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_requests" ADD CONSTRAINT "shot_requests_import_id_imports_id_fk" FOREIGN KEY ("import_id") REFERENCES "public"."imports"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "shot_requests" ADD CONSTRAINT "shot_requests_import_row_id_import_rows_id_fk" FOREIGN KEY ("import_row_id") REFERENCES "public"."import_rows"("id") ON DELETE restrict ON UPDATE no action;