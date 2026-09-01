# APPROACH

## What I built and why

A styled-shot pipeline shaped as a **state machine with generation inside it**, not a generator with a UI. Maya's ask ("can the AI just make the shots?") names the visible bottleneck — but the process this team described breaks in four places, and only one of them is the photographer: requests evaporate (Slack 👍), approvals scatter (threads + email), finals are ambiguous (`IMG_43xx.jpg` shipped wrong for three weeks), and status is unanswerable. Generating faster into that would just make the chaos cheaper.

So v1 is one pipeline: **CSV import → human-gated reconciliation → uni-1 image generation from the packshot → Ellie's phone approval via magic link → durable named assets → the same CSV back, enriched with status and image links.**

Two people, two surfaces:
- **Maya (Operator)**: uploads the export, confirms what generates (the single spend gate), edits Execution Directions after rejections, sees status and spend without asking anyone.
- **Ellie (Reviewer)**: gets an email when there's something to judge; opens one link on her phone; approve/reject, one candidate at a time, against the original packshot and the original shot idea. No account, no install, no new tool to remember — the things she explicitly rejected.

"Done" is the brief's definition made mechanical: N approved images (default 2, per-request override), durably stored, named deterministically, linked from the returned sheet.

## Key decisions and tradeoffs

- **Domain first, then code.** CONTEXT.md (ubiquitous language) and SPEC.md were locked through a long grilling before scaffolding. The invariants that matter — status is a projection over durable facts, provider truth is never overwritten, asset persistence is a separate failure boundary from generation, no automatic re-POST of paid work — were decided as product rules, then implemented as code and tests.
- **Evidence before architecture.** A six-generation, $0.38 fidelity spike against the real catalog (ADR-0002) chose the model (uni-1 — max showed no approval-relevant gain at 2.4× cost and worse latency), the prompt shape, square output, one-candidate-first, and produced the documented fidelity risks (transparent materials, deformable products, set quantities).
- **One candidate first.** The first approval validates the creative direction cheaply; only then does batch generation to target make sense. Rejections carry structured reasons, and `WRONG_PRODUCT_FIDELITY` deliberately does *not* gate regeneration — a wrong glaze indicts the generation, not the direction.
- **Shot Idea immutable, Execution Direction versioned.** The client's words are history; the operational brief evolves. Every candidate links to the exact direction version and exact provider payload that produced it — the audit trail today's Slack-thread process lacks.
- **Conservative money paths.** No idempotency key exists at the provider (verified against live docs) and no list endpoint to reconcile orphans — so a POST whose fate is unknown becomes `UNKNOWN` and is only ever retried by a human. Asset-copy retries can never trigger a paid generation.
- **Import is a snapshot; canon changes are explicit.** Byte-identical re-upload is a no-op by hash. Changed product data shows a diff and requires a keep/use-imported choice — never silently overwritten. Creative work is import-scoped: new campaigns may reshoot the same idea.

## The road not taken

**The strongest design I didn't build: Slack-native review** (candidates posted to their channel, Ellie approves with buttons). It matches their stated toolkit exactly and would have won the adoption argument outright — the team already 👍s photos in Slack. I chose the magic-link web queue instead because (a) the drop is the stated first test, and 40 products × candidates × pick-2 is ~100+ decisions — thread-per-candidate collapses at exactly that scale while a queue thrives on it; (b) fidelity judgment needs a full-screen image and a packshot compare, which Slack mobile previews are bad at; (c) Slack app setup + interactivity endpoints would have eaten a large share of the day for a worse review surface. The cost: the link is a new surface Ellie must trust. The mitigation: it arrives where she already lives (email/Slack paste), needs zero setup, and the queue/decision API is delivery-agnostic — a Slack bot in v2 posts the same queue into their channel without touching the domain.

Second road not taken: **LLM prompt enrichment and Note classification** (ADR-0001). Originally designed in; removed when credential reality (only a Luma generation key ships) met spike evidence (deterministic assembly already beat the naive prompt). v1 keeps Notes verbatim and human-routed; classification and AI-suggested revisions are the obvious v2 once a text-model credential exists.

## Scope ledger

**In (built, tested):**
- CSV staging with per-row dispositions, photo preflight, exact-file idempotency — *the entry point for the next export is the product's front door, not an afterthought*
- Reconciliation with explicit keep/use-imported + bulk action — *never silently mutate their catalog*
- Confirm-as-spend-gate with cost estimate; deferral; authored ideas — *every dollar behind a human click*
- Generation worker: submit/poll/store with crash recovery, provider-truth mirroring, budget-exhausted circuit breaker — *a restart mid-generation loses nothing and double-pays nothing*
- Durable assets, private bucket, permanent capability URLs, 302-presign — *approved images outlive the provider's 1-hour URLs and any storage migration*
- Review sessions: hashed revocable 30-day tokens, live queue, per-tap synchronous decisions, structured rejection reasons — *interrupted phone sessions resume safely; feedback is data, not vibes*
- Request lifecycle as a pure projection with 19 fixture tests — *status can't drift from facts*
- Enriched CSV export + asset filenames — *their sheet comes back with answers; kills the IMG_43xx failure mode*
- Spend telemetry per attempt — *unit economics from real rows, not estimates*

**Out (deliberately, by value — each with the reason):**
- Slack integration — see road not taken; v2 delivery channel
- Google Drive/Sheets APIs — export replaces the ritual; Drive is where ambiguity lived
- LLM classification / AI-suggested revisions — ADR-0001; credential + evidence
- Cross-product scenes — spike showed set/count unreliability; data-model evolution when it earns it
- Aspect-ratio variants, un-approve flows, budget caps, multi-reviewer, roles — none blocks the drop test
- Zip export of approved assets — highest-value stretch, first thing next

**Next (in order):** zip export → Slack delivery of review links → reviewer identity / per-decision attribution (concurrent reviewers are last-write-wins today) → cross-import asset reuse offers → note classification + priority-aware queue ordering (with a text model) → per-channel crops.

## Unit economics

Per uni-1 `image_edit`, **measured in production** (23 real generations across the verification passes): **$0.0434 per image, 54.1–64.6s latency, 59.0s average**. Async provider failures are refunded per docs, sync rejections never charged — observed failure count in production: zero.

One approved image, assuming the direction validates in 1–2 candidates: **$0.04–$0.09 and ~2–4 minutes wall clock** (generation ~1 min; Ellie's decision is seconds; the rest is queue latency, not labor). The 40-product drop at target 2: 40 first candidates ($1.74) + ~60 follow-ups ≈ **$4–6 total** — against a photographer cycle measured in weeks and thousands.

## Validated in production

Beyond unit tests, the deployed system passed a staged verification and a bounded stress test on real infrastructure (Railway + Vercel + Luma):

- **100-product production stress test** through the deployed UI: 100 rows parsed/persisted, layout intact under long names, accents, 374-char shot ideas; 20 deferred; 60 no-request; console clean throughout.
- **22 paid generations for $0.9548**: 20-image batch + 2 second candidates. 22/22 completed, 22/22 assets durably stored on first copy. **Zero provider failures, zero storage retries, zero 429s.** Batch wall clock ≈ 2.5 min with the worker's designed submit/poll caps pacing visibly.
- Full review loop exercised on a real phone (magic link, packshot compare, structured rejections, decision change via upsert), mixed-status export verified (`Ready / Awaiting review / Needs revision / In progress / Not started / No request` across 100 rows, original order and values preserved).
- **Known v1 limitation, found live, not a bug:** two reviewers on the same magic link are silent last-write-wins — one current decision per candidate is the locked design, and the projection + spend gates handled a genuinely conflicting flip correctly (an approval overwritten by a rejection re-gated generation, refusing the next paid click). Fine for a one-reviewer team; per-decision attribution or reviewer identity is the v2 item if reviewers multiply.

At **10× catalog** (3,000 products): generation cost scales linearly (~$260–450 per full-catalog pass — still noise vs photography). What actually breaks at 10× is not cost:
- Ellie's serial-approval throughput becomes the bottleneck → needs batch grid review, a second reviewer, or auto-shortlisting
- single-process polling worker hits provider RPM/concurrency ceilings → move to provisioned throughput + real queue
- the "one sheet, enriched" mental model strains at 3,000 rows → status views become the primary surface, CSV becomes the interchange only

## What breaks first under pressure

1. **Ellie's attention.** The design bets one review session clears in minutes. If candidates queue faster than she judges (drop week), pending piles up and Maya over-generates against unvalidated directions. Watch: pending-review age. Mitigation already in: one-candidate gate; next: digest cadence + batch grid.
2. **Fidelity on hard materials.** Smoke glass and drape physics will generate rejections that no direction edit fixes; without the v2 escalation lever (uni-1-max per-request, or photographer fallback tagging) Maya can burn retries on unwinnable products. The rejection-reason telemetry makes this visible per SKU.
3. **The single worker process.** In-process polling + Postgres-as-queue is deliberately boring and survives restarts, but it's one process: a long Railway outage pauses the pipeline (nothing is lost — non-terminal work resumes). Fine at 300 products; the first real scale signal is 429s from Luma concurrency limits.
4. **Capability-URL sprawl.** Exported CSVs copied around the company multiply unguessable-but-unauthenticated links. Revocation exists per asset; rotation policy is a v2 conversation.
