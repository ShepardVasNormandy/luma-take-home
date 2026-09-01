# CONTEXT — Ubiquitous Language

Glossary for the styled-shot pipeline. Implementation details live in SPEC.md; decisions with history live in docs/adr/.

## Actors

- **Operator** — Maya. Uploads catalog CSVs, reconciles Imports, authors missing Shot Ideas, edits Execution Directions, triggers generation, sends Review Sessions, closes/reopens Shot Requests. Authenticated (email/password). The only credentialed user.
- **Reviewer** — Ellie. Judges Candidates from her phone via magic email link. Approves or rejects. No account, no install, never gets Operator credentials.
- **Web person** — downstream consumer of the Export. Not a user in v1.

## Catalog and Imports

- **Product** — one catalog item, identified by SKU. SKUs are not contiguous; SKU is the join key across Imports. A Product without a Shot Idea is a normal, non-blocking state (**NO_REQUEST**), not an error and not auto-filled.
- **Import** — one customer CSV handoff, persisted as a snapshot at staging (original filename, SHA-256 content hash, headers, raw rows, row order). Staged vs confirmed is expressed by confirmedAt — no heavy Import state machine. **The canon boundary:** staging persists the snapshot but never mutates canonical Products or creates generation work; confirmation is the human gate before generation spend. Staging itself spends nothing (no model calls of any kind).
- **Exact-file idempotency** — an upload whose content hash matches an existing Import links to that Import; no duplicate staging, no re-reconciliation. Any byte difference = a genuinely new Import through normal reconciliation.
- **Import Row** — the immutable, exact snapshot of one row as received. Never mutated — including its original Shot Idea and Note, whether or not work is started on it.
- **Reconciliation dimensions** — orthogonal, never one mutually-exclusive enum:
  - *Product reconciliation:* `NEW_PRODUCT`, `PRODUCT_UNCHANGED`, `PRODUCT_CHANGED`, `INVALID` (excluded + warned; never blocks the rest of the import).
  - *Creative work:* `NO_REQUEST`, `REQUEST_ELIGIBLE`, `NEEDS_INPUT`.
  - *Flags:* `PHOTO_CHANGED` (distinct warning — affects future generation fidelity), photo preflight result, …
- **PRODUCT_CHANGED resolution** — explicit Operator choice per row with visible diff: use imported data / keep existing data. Bulk action allowed ("use imported data for all N changed"). Never silently overwrite canon on confirm.
- **Note** — free-text annotation on a Product row, preserved and displayed verbatim as customer data wherever the row/Request appears. **Not machine-classified and never automatically injected into prompts in v1** (deliberate simplification — see ADR-0001): "bestseller, do this one first" is operational context, not image input; the Operator reads Notes and decides what enters the Execution Direction. A small "use in direction" convenience is stretch, not core. Automatic taxonomy/classification is v2.
- **Generation eligibility (minimum inputs)** — valid Product identity (SKU), non-empty Shot Idea, valid and reachable source Photo URL (lightweight GET preflight, run only for rows that could actually generate — not the whole catalog). Product attrs (color/material) improve prompts (spike-confirmed) but remain non-blocking.
- **Selection at confirm** — all eligible rows selected by default. The Operator unchecks to defer, informed by the verbatim Notes shown in the preview (e.g. "discontinued after spring?" — uncertain human context is surfaced, never auto-suppressed). Confirm UI states scope and estimated initial spend.
- **Deferred row (unchecked)** — `DEFERRED`: Maya deliberately opted out at confirm. Original Shot Idea preserved on the Import Row; **no Shot Request is created**; non-blocking for Import readiness; Maya can start it later, explicitly, from Import detail. Distinct from `NEEDS_INPUT`, which HAS a Request. Creative disposition must survive refresh/export and distinguish: no idea (`NO_REQUEST`) / idea present but Maya deferred (`DEFERRED`, user-facing "Not started") / Request exists with broken required input (`NEEDS_INPUT`) / otherwise derived from Request lifecycle.
- **Drop** — a batch of new Products arriving via a new Import.

## Shot Requests and generation

- **Shot Idea** — the customer's original free-text scene wish. **Immutable once captured.** The Operator may author one for a Product lacking it (explicit CTA: "Save idea & generate first candidate" — spend consequence visible; if generation inputs are missing, the idea saves but nothing generates until the blocker is resolved).
- **Shot Request** — the unit of work: a Shot Idea attached to a Product within an Import. Import-scoped: creative work is never deduplicated across Imports — a new Import may legitimately create fresh work even when text matches previous work. Cross-import asset-reuse offers are a v2 optimization.
- **Execution Direction** — **the one thing the Operator understands and edits.** The initial version IS the Shot Idea verbatim (provenance `INITIAL`); the Operator edits/versions it manually when needed (`OPERATOR_EDITED`). **Append-only versions**; every Candidate links to the version that generated it. No LLM composes or rewrites Directions in v1 (ADR-0001); AI-suggested revisions are v2.
  - *Immutable ≠ always injected:* the Shot Idea anchors history/review/revision but is NOT fed into generation once a Direction diverges from it — a revised Direction ("no sofa visible") must not fight the original idea ("styled on a sofa") inside the same prompt. Only the active Direction is sent.
  - *Deterministic prompt assembly* (locked by the fidelity spike, 2026-09-01 — recorded in ADR-0002): final provider request assembled in code from the active Execution Direction + selective useful Product facts (color/material) + one short preservation instruction + the source image. Square output. No giant fidelity boilerplate, no dumping every catalog field. ADR-0002 is the authority on what extra prompt material earns its place; changing the template requires new evidence. The assembly wrapper is Luma-integration code — not a domain concept, never Operator-visible.
  - *Known fidelity limitations (v1, from spike):* transparent/light-sensitive materials (tint washes out under fill + strong light); deformable objects (surface texture survives, physical continuity may not); set/multi-item quantities when the reference image shows one unit. These inform review expectations and ASSUMPTIONS.md — not blockers; they are why the Reviewer compares against the packshot.
- **NEEDS_INPUT** — creative work requested but required generation input missing/dead (e.g. unreachable photo). No generation spend until resolved.
- **Candidate** — one generated image awaiting review. Every Candidate requires an individual decision; no auto-approve. **A Candidate is reviewable only once its durable Asset is stored** — no half-alive Candidates in the review queue.
- **Generation Attempt** — one provider-side job holding **provider truth**: `QUEUED | PROCESSING | COMPLETED | FAILED`. If the provider says COMPLETED, it stays COMPLETED — persisted separately from the Request projection.
- **History is never reinterpreted** — each Generation Attempt retains exactly what happened at that point: Direction version, source/product snapshot refs, the exact prompt/request sent to the provider, model + provider generation ID, timing/cost/outcome. Later changes to canonical Product data or the assembly wrapper never retroactively apply to existing Candidates.
- **Asset** — the durable copy of a generated image in our own object storage. Exists because reviewed/approved images must be durable business artifacts independent of provider retention. Every successful Candidate is stored, approved or rejected. **Asset persistence is its own failure boundary, separate from generation:** a storage failure retries the copy from the same provider generation and must NEVER trigger a paid regeneration.
- **Asset capability URL** — the stable, unauthenticated, unguessable application URL (`/assets/<publicId>`) written into exports. The app resolves it (serve/stream or redirect); the bucket stays private, assets stay revocable, storage provider stays swappable without breaking exported CSVs. Tradeoff (anyone with URL sees the image) goes in ASSUMPTIONS.md — narrower capability than the review link.
- **Asset filename** — deterministic projection at export/download time (`HG-002_approved-01.jpg`); the approved ordinal is a view, never object identity. Storage keys are opaque and immutable; no renames when decisions change.
- **Required Approvals** — per-Request target. Default 2, Operator override (1–x).
- **Overshoot guard** — approvedCount should not normally exceed requiredApprovals via the regular UI; default generation action reflects remaining-to-target. Intentional extra generation allowed, never encouraged.

## Request lifecycle

**Status is a projection over durable facts** (Import Rows, Direction versions, Generation Attempts, Review Decisions, close/reopen actions) — never a hand-maintained enum. Close/reopen are explicit durable Operator actions.

States: `GENERATING` → `AWAITING_REVIEW` → (`NEEDS_REVISION` | `IN_PROGRESS` | `READY_TO_GENERATE`) → `READY`; plus `GENERATION_FAILED` (retryable — no failure may collapse into an infinite spinner), `GENERATION_BLOCKED`, `NEEDS_INPUT`, and `CLOSED`.

- **Precedence:** projected state names the next action blocking progress (1 approval + 1 pending Candidate → `AWAITING_REVIEW`, not `IN_PROGRESS`).
- **NEEDS_REVISION** — latest Candidate rejected while approvals = 0, for a reason that invalidates the Direction. Generation gated until a new Direction version exists (Operator edit).
- **READY_TO_GENERATE** — no work in flight, gate lifted (e.g. Direction revised after rejection), next action is the Operator generating.
- Rejection after ≥1 approval does **not** re-gate. Rejection reason/comment visible next to the generation action.
- **READY** — Approved Shots ≥ Required Approvals, where each counted approval points at a Candidate with a durable, available Asset. **Asset existence is part of readiness** — approval rows alone never suffice.
- **CLOSED** — intentional abandonment: stops generation, leaves actionable counts, stays in history/export, records who/when + optional reason, reversible. Reopen restores whatever the history projects.

## Failure semantics

- **Generation failure** — **no automatic re-POST, ever.** Failure surfaces with provider reason + manual "Retry generation"; human click = potentially new spend.
- **GENERATION_BLOCKED** — `content_moderated`: not an Ellie rejection (no Candidate existed). The current Direction was refused by the provider; Operator must revise before generating again. Same consequence as NEEDS_REVISION, distinct reason/history.
- **Budget exhausted** — global Operator-visible condition; generation actions unavailable while it holds. Reflects observed provider state (react to the provider error, lightweight recheck/clear) — never invented provider state, never an immutable env var.
- **Asset-store failure** — aggressive automatic retries (exponential + jitter), refreshing the provider output URL when expired, then manual "Retry copy". Never becomes a generation call — the paid generation already succeeded.
- **Recovery invariant** — a local poll timeout is not provider truth: provider says PROCESSING → still PROCESSING; our restarts/timeouts never mark FAILED. A reconciler resumes polling all non-terminal Attempts after restart and never POSTs a generation as part of recovery. "Still processing, longer than usual" is a UI hint, not a domain state.

## Review

- **Review Session** — one persistent review context per Import. "Send for review" is an explicit Operator action; each send emails a link showing only currently pending Candidates.
- **Review token** — bearer credential for the session link: scoped, revocable, expiring (30 days, refreshed on re-send). Distinct from the session.
- **Review Decision** — one current decision per Candidate, updatable (upsert): `APPROVED | REJECTED`, optional reason, optional comment, reviewedAt. Persisted synchronously per tap; advance only after persistence succeeds (interrupted sessions resume safely). Reviewer may go back and change a decision. No append-only decision log, no batch commit, no confirm modals in v1.
- **Rejection reason** — structured enum first, free text second; both skippable. **Each reason carries its gate semantics** (`invalidatesDirection`) rather than services special-casing:
  | Reason | invalidatesDirection |
  |---|---|
  | `WRONG_PRODUCT_FIDELITY` | false — generation variance, not a direction verdict; regenerate same Direction allowed |
  | `DOESNT_MATCH_IDEA`, `COMPOSITION`, `LIGHTING_COLOR`, `TOO_STAGED`, `OTHER`, *(none given)* | true — pre-approval, gates until a new Direction version exists |
  Post-first-approval, no reason hard-gates (Direction already validated). Trim enum after observing real usage.
- **Review card** — per Candidate the Reviewer sees: the Candidate large (zoomable), the source packshot easy to inspect/expand, product name + SKU, and the **Shot Idea verbatim** (client's words as judgment anchor). Never the Execution Direction, never spend/cost. Tiny Request context line ("1 of 2 approved" / "Needs 1 more approval") explains reappearing Products.
- **Queue order** — oldest pending first. (Priority-aware ordering depended on Note classification — v2 with it. v1 prioritization is the Operator's judgment: she reads Notes and chooses what to generate and send first.)
- **Navigation** — one Candidate at a time, full-screen; explicit previous/back control to revisit and change a decision (swipe = optional progressive enhancement, never the only way back). End of queue = "All caught up" summary (N approved, M rejected, no pending right now) — the session persists; more Candidates may arrive later. No submit action.
- **Live queue** — the session resolves its queue from current live pending state, never a frozen Candidate list. Closing a Request removes its pending Candidates immediately; the review mutation verifies server-side that the Candidate is still reviewable and fails cleanly on staleness.
- **Review email** — transport only. Subject "N shots ready for review" (N = pending count at send time), body = tiny context (Import/drop name) + one CTA. No thumbnails, no controls, no frozen batch semantics.

## Output

- **Import Ready** — every Shot Request in the Import is `READY` or `CLOSED`, and no unresolved blocking Import Row issues. Blank Shot Ideas (NO_REQUEST) and deferred (unchecked) rows never block.
- **Export** — regenerated CSV, downloadable anytime, per Import: every original row, original ordering, original + unknown columns semantically preserved, our columns appended (Shot Status, Approved Count, Approved Image 1..N, Last Reviewed At). Must feel like "their sheet came back with answers," never a report from our data model. Approved Image column count = `max(3, highest requiredApprovals among the Import's Requests)` — schema derives from targets, not current approvals; unfilled slots blank. Filename carries original basename + ready/partial state + export date (`september-drop-ready-2026-09-01.csv`); no metadata rows in the CSV.
- **Shot Status export vocabulary** — internal states compress to customer language: NO_REQUEST → "No request"; DEFERRED → "Not started"; NEEDS_INPUT + GENERATION_FAILED + asset persistence failure → "Needs attention"; GENERATING → "Generating"; AWAITING_REVIEW → "Awaiting review"; NEEDS_REVISION + GENERATION_BLOCKED → "Needs revision"; IN_PROGRESS + READY_TO_GENERATE → "In progress"; READY → "Ready"; CLOSED → "Closed". Internal detail stays internal.
- **Generation metadata** — per attempt: model, price snapshot, latency, outcome, provider ID — sufficient to compute total spend, per-Request spend, cost per approved image from real data. Aggregates are computed, never counters. Display-only v1, no budget caps.
- **Cross-Product Shot** — multi-Product scene. v2, and may require data-model evolution: v1 deliberately models one Product per Shot Request rather than carrying unused many-to-many plumbing.
