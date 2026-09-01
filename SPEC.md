# SPEC — Styled-Shot Pipeline v1

Authority chain: `CONTEXT.md` (domain contract) > this spec (system contract) > tickets. `docs/adr/0002` locks the generation strategy (model, prompt template, evidence); `docs/adr/0001` records the enrichment simplification. If implementation exposes a contradiction with CONTEXT.md, stop and escalate — don't invent.

## 1. Topology

- `apps/web` — Next.js (App Router, TS) on **Vercel**. Pure UI: Operator app + Reviewer mobile page. No Route Handlers proxying business logic; same-origin API access via Vercel rewrite `/api/:path*` → Railway API (keeps cookies first-party).
- `apps/api` — **Fastify** (Node 22, TS) on **Railway**. All business logic, worker loop, asset serving, email.
- **Postgres** (Railway) via **Drizzle** (+ drizzle-kit migrations).
- **Railway Bucket** (S3-compatible, private) behind a tiny storage adapter (`put`, `getStream`, `exists`) over `@aws-sdk/client-s3`. No storage framework.
- `packages/shared` — zod schemas + inferred types for every API contract; both apps import from here.
- Email: **Resend** (verify demo sender setup early).
- Provider: Luma Agents API — `uni-1`, `type: image_edit`, poll-only. Prices as code constants with effective date: edit $0.0434 (uni-1).

## 2. Data model

Conventions: `id` uuid pk default random; `created_at timestamptz default now()`; enums as pg enums; FKs `on delete restrict`.

### imports
| col | type | notes |
|---|---|---|
| original_filename | text | |
| content_hash | text unique | sha256 of raw bytes; duplicate upload → return existing import |
| headers | jsonb | ordered array of original header strings |
| row_count | int | |
| confirmed_at | timestamptz null | null = staged |

### import_rows
| col | type | notes |
|---|---|---|
| import_id | fk | |
| row_index | int | original order; unique(import_id, row_index) |
| raw | jsonb | ordered map header→raw string, incl. unknown columns; never mutated |
| sku, product_name, category, color_finish, material, price_raw, photo_url, shot_idea, notes | text null | parsed views of `raw` |
| validity | enum VALID \| INVALID | + `invalid_reason text null` (no SKU, unparseable) |
| product_reconciliation | enum NEW_PRODUCT \| PRODUCT_UNCHANGED \| PRODUCT_CHANGED \| INVALID | computed at staging |
| creative_work | enum NO_REQUEST \| REQUEST_ELIGIBLE \| NEEDS_INPUT | computed at staging |
| photo_changed | bool | flag vs current Product |
| photo_preflight | enum OK \| FAILED \| SKIPPED | GET preflight only for rows that could generate |
| reconciliation_choice | enum USE_IMPORTED \| KEEP_EXISTING null | required before confirm when PRODUCT_CHANGED |
| deferred_at | timestamptz null | set at confirm for unchecked eligible rows |
| shot_request_id | fk null | set at confirm / late start / authored idea |

### products
`sku text unique`, name, category, color_finish, material, price_raw, photo_url, `updated_at`. Created/updated only at confirm per reconciliation choices. **No notes column** — Notes are Import/customer-handoff context ("bestseller, do this one first" is not canonical Product data); they live on `import_rows.notes` and surface through the Request's Import Row.

### shot_requests
`product_id fk`, `import_id fk`, `import_row_id fk`, `shot_idea text` (immutable), `required_approvals int default 2 check ≥1`, `closed_at timestamptz null`, `close_reason text null`.
Close/reopen via dedicated endpoints only. (Single-operator v1: who = Maya by definition; reopen clears `closed_at` — accepted tradeoff, noted in APPROACH.md.)

### direction_versions
`shot_request_id fk`, `version int` (unique per request, 1..n), `content text`, `provenance enum INITIAL | OPERATOR_EDITED`. v1 created at confirm with `content = shot_idea` verbatim.

### generation_attempts
| col | notes |
|---|---|
| shot_request_id fk, direction_version_id fk | |
| state | enum SUBMITTING \| POSTING \| QUEUED \| PROCESSING \| COMPLETED \| FAILED \| UNKNOWN |
| provider_generation_id | text null — set right after successful POST |
| failure_code, failure_reason | text null |
| request_payload | jsonb — exact body sent to Luma |
| source_snapshot | jsonb — photo_url + product facts used at assembly time |
| model | text ('uni-1') |
| price_snapshot_usd | numeric — price constant at creation |
| submitted_at, completed_at | timestamptz null; latency derived |

State semantics: `SUBMITTING` = row created, not yet POSTed. `POSTING` = POST in flight (set immediately before the HTTP call). `UNKNOWN` = found in POSTING without provider id after restart — **never auto re-POSTed**; Operator sees "status unknown — retry manually". QUEUED/PROCESSING/COMPLETED/FAILED mirror provider truth verbatim.

### candidates
`shot_request_id fk`, `generation_attempt_id fk unique`, `asset_id fk null`. Created when an attempt reaches COMPLETED. **Reviewable ⇔ asset stored.**

### assets
`public_id text unique` (128-bit random, base62 — the capability URL segment), `storage_key text` (opaque: `assets/<uuid>`), `content_type`, `bytes int null`, `provider_url_snapshot text`, `store_state enum PENDING | STORED | FAILED`, `retry_count int default 0`, `next_retry_at timestamptz null`, `stored_at timestamptz null`.

### review_sessions
`import_id fk unique`, `token_hash text` (sha256 of raw token; raw shown once per send), `expires_at`, `revoked_at null`, `last_sent_at`, `send_count int`.

### review_decisions
`candidate_id fk unique`, `decision enum APPROVED | REJECTED`, `reason enum WRONG_PRODUCT_FIDELITY | DOESNT_MATCH_IDEA | COMPOSITION | LIGHTING_COLOR | TOO_STAGED | OTHER null`, `comment text null`, `reviewed_at` (updated on upsert).

### app_settings
Key-value (`key text pk, value jsonb, updated_at`). Used for `budget_exhausted` condition ({at, failure_reason}); cleared by Operator "dismiss & retry" action.

No operators table: single account from env (`OPERATOR_EMAIL`, `OPERATOR_PASSWORD_HASH` argon2), stateless signed session cookie (`@fastify/secure-session`, httpOnly, sameSite=lax — first-party via rewrite).

## 3. Request status projection

Pure function `projectStatus(request, rows...)` in `packages/shared`, unit-tested against fixtures. Evaluation order (first match wins — "next action blocking progress"):

1. `CLOSED` — closed_at set
2. `NEEDS_INPUT` — required generation input unusable (photo missing / preflight FAILED and not re-resolved)
3. `GENERATING` — any attempt in SUBMITTING/POSTING/QUEUED/PROCESSING, **or** any candidate whose asset copy is PENDING (still producing). An asset in FAILED belongs to rule 7, not here — export vocabulary already maps persistence failure to "Needs attention"
4. `AWAITING_REVIEW` — ≥1 reviewable candidate without decision
5. `READY` — approvals-with-STORED-asset ≥ required_approvals
6. `GENERATION_BLOCKED` — latest attempt FAILED with `content_moderated` and no direction version newer than it
7. `GENERATION_FAILED` — latest attempt FAILED (other codes) or UNKNOWN, and nothing newer succeeded; **or** any candidate's asset copy is FAILED (retries exhausted — "Retry copy" is the surfaced action)
8. `NEEDS_REVISION` — approvals = 0, latest decided candidate REJECTED with invalidating reason (or no reason), and no direction version newer than that candidate's
9. `IN_PROGRESS` — approvals ≥ 1 (< required)
10. `READY_TO_GENERATE` — everything else (gate lifted / nothing in flight / not yet generated)

`invalidatesDirection` lives beside the reason enum in `packages/shared`.

Import Ready = all its shot_requests project READY or CLOSED, and no unresolved blocking row issues (INVALID rows are warned-and-excluded, non-blocking; NEEDS_INPUT blocks via its request).

## 4. Prompt assembly (integration code, `apps/api/src/luma/assemble.ts`)

```
{direction.content trimmed}
Product: {name}, {color_finish}, {material}.        ← only fields present
Preserve the exact shape, color, and material of the product from the source image.
Photorealistic lifestyle product photograph.
```
POST body: `{ model: 'uni-1', type: 'image_edit', prompt, source: { url: product.photo_url }, output_format: 'jpeg' }`. Exact body persisted on the attempt. `docs/adr/0002` is the authority for this template — changing it requires new evidence.

## 5. API surface (Fastify, prefix `/v1`)

Auth guard: operator cookie for everything except `/auth/login`, `/review/*` (token), `/assets/*` (public capability).

**Auth** — `POST /auth/login {email,password}` → sets cookie · `POST /auth/logout`.

**Imports**
- `POST /imports` multipart CSV → parse, hash (duplicate → `200 {existing: true, import}`), persist snapshot + rows, compute dispositions, run photo preflight for could-generate rows → staged import
- `GET /imports` list (+status, ready flag, counts) · `GET /imports/:id` full staging/detail payload (rows, dispositions, diffs vs current products, preflight, request statuses + spend once confirmed)
- `POST /imports/:id/reconcile {rowIds, choice}` (bulk-capable)
- `POST /imports/:id/confirm {selectedRowIds}` — validates all PRODUCT_CHANGED rows resolved; applies products; creates shot_requests + direction v1 (INITIAL, verbatim); NEEDS_INPUT rows get requests, no attempts; unchecked eligible rows → deferred_at; selected eligible rows → one generation_attempt each (SUBMITTING). Idempotent guard: 409 if already confirmed.
- `POST /imports/:id/rows/:rowId/request {shotIdea?}` — start a deferred row (uses row's idea) or author an idea for a NO_REQUEST row; creates request (+attempt if inputs valid). CTA semantics: "Save idea & generate first candidate".
- `GET /imports/:id/export.csv` — anytime; filename per contract
- `GET /imports/:id/export.zip` — stretch

**Requests**
- `GET /requests?importId&status` · `GET /requests/:id` (idea, notes verbatim, direction history, candidates + decisions, attempts log, spend)
- `POST /requests/:id/directions {content}` → next version, OPERATOR_EDITED
- `POST /requests/:id/generate {count?}` — enforces: not CLOSED/NEEDS_INPUT; gate (NEEDS_REVISION/GENERATION_BLOCKED reject unless newer direction); budget_exhausted flag blocks; count default = remaining-to-target (min 1); response includes est cost. Creates N attempts (SUBMITTING).
- `POST /requests/:id/close {reason?}` · `POST /requests/:id/reopen`
- `POST /requests/:id/required-approvals {value}`

**Review**
- `POST /imports/:id/review/send` — create-or-refresh session (new token, expiry +30d), email via Resend to `REVIEWER_EMAIL` ("N shots ready for review" + link `WEB_URL/review/<rawToken>`). One Reviewer in v1: recipient is config, no reviewer table/UI.
- `GET /review/session` (Bearer raw token) → pending queue (oldest first): candidate asset URL, packshot URL, product name+SKU, shot idea, per-request progress line, session counts; also recently-decided list for back-navigation
- `PUT /review/candidates/:id/decision {decision, reason?, comment?}` — token-scoped; server verifies candidate belongs to session's import, is reviewable, request not closed → 409 on staleness; upsert
- Errors: expired/revoked → 401 with typed code → web renders friendly page

**Assets** — `GET /assets/:publicId` → DB lookup → short-lived presigned bucket GET → **302 redirect** (image bytes never routed through Fastify; bucket stays private; app URL stays the stable capability). Optional `?download=1&filename=` presigns with response-content-disposition for the projection name.

**Status** — `GET /imports/:id/summary` (counts per status, spend totals, cost/approved) — powers Maya's board + APPROACH.md numbers.

## 6. Worker loop (in-process, `apps/api/src/worker`)

Single `setInterval` tick (4s), sequential handlers, each claiming rows `FOR UPDATE SKIP LOCKED`, per-row try/catch (one bad row never blocks the tick):

1. **submit**: attempts in SUBMITTING → set POSTING → POST to Luma → save provider id + state QUEUED. 429 → release row, honor Retry-After via next_retry-style backoff. Boot recovery: POSTING w/o provider id older than 2 min → UNKNOWN (manual retry only). **Verified against live docs (2026-09-01): create-generation supports NO idempotency key and no list-generations endpoint exists for reconciliation — the POSTING→UNKNOWN design stands.** Send `X-Request-Id: <attempt id>` on each POST (tracing-only per docs; docs want a fresh id per retry attempt, which our one-attempt-row-per-retry model gives naturally). Billing facts for telemetry: sync errors never charged; async `content_moderated`/`generation_failed`/`output_not_found` refunded — record refunded outcomes as $0 actual cost, keep price_snapshot for what it would have been.
2. **poll**: attempts QUEUED/PROCESSING → GET generation; mirror state; on COMPLETED create candidate + asset (PENDING, provider_url_snapshot); on FAILED store code/reason; `budget_exhausted` → set app_settings flag.
3. **store**: assets PENDING or FAILED-with-due-retry → fetch provider URL (on 403/expiry re-GET generation for fresh URL) → put bucket → STORED. Backoff exp+jitter, retry_count ≤ 5 then FAILED (manual "Retry copy" resets). Never touches generation POST.

Invariants enforced here: no duplicate paid POST; provider id survives restart; asset retry never regenerates; restart resumes non-terminal work (states are in Postgres, tick is stateless); UI hint "longer than usual" = age > 3 min while PROCESSING.

## 7. Screens (`apps/web`)

Operator (cookie-gated):
- `/login`
- `/` — imports list (name, date, staged/confirmed, ready/partial badge, counts) + CSV upload dropzone (duplicate-hash → navigates to existing)
- `/imports/[id]` — staged: rows table (dispositions, product diffs w/ keep/use-imported + bulk bar, photo flags, preflight, verbatim Notes, selection checkboxes) + confirm bar ("Confirm & generate N first candidates · est $X"). Confirmed: request board (status chips, filters, spend summary, budget banner slot, Send-for-review w/ pending count, export buttons, deferred rows section w/ "Start" actions, NO_REQUEST rows w/ "Add idea").
- `/requests/[id]` — packshot + idea (immutable) + Notes verbatim; direction editor (current + append-only history, provenance tags); candidates grid (image, decision badge, reason/comment surfaced next to generate controls); generate controls (default count = remaining, explicit cost label, disabled states w/ reason: gated/blocked/budget/closed); attempts log (state, failure, latency, cost, provider id, "retry generation"/"retry copy" where applicable, "status unknown" case); close/reopen; required-approvals stepper.

Reviewer (token, mobile-first):
- `/review/[token]` — full-screen card: candidate (pinch/zoom), packshot compare toggle, product name + SKU, shot idea verbatim, progress ("3 / 12" + "Needs 1 more approval"); Approve / Reject (reason sheet: 6 reasons + optional comment, both skippable); explicit back control (decision change = upsert); loading state on tap, advance only on 200, inline retry on failure; end = "All caught up" (N approved, M rejected). Expired/revoked → friendly dead-link page.

## 8. Export contract

`GET /imports/:id/export.csv`, streamed via csv-stringify:
- rows in `row_index` order, values from `raw` (semantic preservation, unknown columns included, original header order)
- appended: `Shot Status`, `Approved Count`, `Approved Image 1..N` (N = max(3, max required_approvals in import); approval-order fill; blank when empty), `Last Reviewed At`
- Shot Status mapping per CONTEXT.md vocabulary; approved image cells = `API_URL/assets/<publicId>`
- filename `<original-basename>-<ready|partial>-<YYYY-MM-DD>.csv`
- zip (stretch): approved assets, `SKU_approved-01.jpg` naming via Content-Disposition-style projection at write time.

## 9. Config

api: `DATABASE_URL, LUMA_AGENTS_API_KEY, RESEND_API_KEY, REVIEW_FROM_EMAIL, REVIEWER_EMAIL, BUCKET_ENDPOINT, BUCKET_NAME, BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY, BUCKET_REGION, OPERATOR_EMAIL, OPERATOR_PASSWORD_HASH, SESSION_SECRET, WEB_URL, API_PUBLIC_URL`
web: `API_URL` (rewrite target). `.env.example` updated accordingly; real values only in deploy env + local `.env.local`.

Railway Bucket mapping (variable references from the Bucket service): `BUCKET` → `BUCKET_NAME` (**not** `RAILWAY_BUCKET_NAME`, which is only the display name), `ENDPOINT` → `BUCKET_ENDPOINT`, `ACCESS_KEY_ID`/`SECRET_ACCESS_KEY`/`REGION` → the matching `BUCKET_*` vars.

Secret hygiene: `scripts/hash-password.ts` generates the argon2 hash for `OPERATOR_PASSWORD_HASH` (raw password never committed, never needed by the app after hashing); `SESSION_SECRET` via `openssl rand -base64 32` (documented, never baked into the repo).

## 10. Testing (focused, not exhaustive)

- `projectStatus` fixture table (every precedence rule + gate/invalidatesDirection cases)
- CSV: parse quirky fixture (the real catalog), staging dispositions, export round-trip (semantic preservation, column math, status vocabulary)
- Prompt assembly snapshot
- Worker handlers with mocked Luma/bucket: submit crash-recovery (UNKNOWN), asset retry never POSTs, budget flag
- Review decision endpoint: staleness 409, upsert

## 11. Build order

1. **Scaffold** — pnpm workspace, shared pkg, Fastify + Drizzle + migrations, Next skeleton, env plumbing
2. **Deploy smoke** — Fastify on Railway (`GET /health` 200, Postgres connect, bucket put/get/presign smoke), Next on Vercel, `/api` rewrite reaches Railway. No product UI — platform/monorepo/rewrite problems die while the app is tiny.
3. **Schema** — full migration + projectStatus + fixtures/tests
4. **Import ingest** — upload→parse→hash→stage→dispositions→preflight (+tests)
5. **Confirm** — reconcile choices, product apply, request/direction creation, deferral
6. **Luma client + worker** — submit/poll, attempts, telemetry, budget flag (verify idempotency-key question against live docs first, §6)
7. **Assets** — bucket adapter, store handler, capability endpoint (302 presign)
8. **Review backend** — sessions, tokens, queue, decision upsert
9. **Review UI** — the mobile flow end-to-end
10. **Operator UI** — imports list/staging/board, request detail, generate controls
11. **Export CSV** + Ready computation
12. **Email** — Resend send-for-review to REVIEWER_EMAIL (verify sender setup early — before video)
13. **Auth** — login, cookie, guards, hash-password script
14. **Deploy final** — full env on Railway (api+pg+bucket) + Vercel, seed operator, run the real catalog end-to-end on the deployed system
15. **Stretch** — zip export, "use in direction" note copy button, packshot side-by-side polish

Demo-critical path = 1–14; every step leaves the system runnable.
