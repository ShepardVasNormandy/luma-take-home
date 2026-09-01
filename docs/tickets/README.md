# Tickets

Build order = SPEC.md §11. Authority: CONTEXT.md > SPEC.md > ticket. A ticket exposing a missing cross-cutting decision goes back to the orchestrator session — implementers never invent domain rules.

Owner legend: **main** = orchestrator session (domain projections, reconciliation, generation idempotency/recovery, review workflow, integration) · **delegate** = bounded subagent work against a fixed contract (use Context7 for any external library API).

| # | Ticket | Owner |
|---|---|---|
| T01 | Scaffold | main |
| T02 | Deploy smoke | main + Enzo (accounts) |
| T03 | Schema + status projection | delegate (schema) / main (projection) |
| T04 | Import ingest + staging | main, delegated CSV utils |
| T05 | Confirm + reconciliation apply | main |
| T06 | Luma client + worker loop | main |
| T07 | Asset storage + capability URL | delegate (adapter) / main (wiring) |
| T08 | Review backend | main |
| T09 | Review UI (mobile) | delegate |
| T10 | Operator UI | delegate (screens) / main (wiring) |
| T11 | Export CSV | delegate |
| T12 | Email (Resend) | delegate |
| T13 | Auth | delegate |
| T14 | Final deploy + e2e | main + Enzo |
| T15 | Stretch | backlog |

## Open items at handoff (post-verification, pre-submission)

State: all build tickets done; production verified end-to-end (Stage 0–8 diagnostic pass + bounded 100-product stress test, see APPROACH.md "Validated in production"). Cumulative production Luma spend: $0.9982 (23 generations, zero failures).

1. **Visual identity revisit** — ✅ resolved 2026-09-01: operator surface rebuilt from Enzo's explicit mockup — dashboard palette scoped to `.shell`/`.login-wrap` (reviewer flow keeps its frozen `:root` tokens), squares brand mark + favicon, imports dashboard (stat band, per-import work counts, nuqs URL filters), products card catalog (request rollup + latest approved thumbnail), login restyle. Mockup elements without durable facts (uploaded-by, created-by filter, add-product, global export, hand-written status enum) deliberately dropped. New API projections: `GET /imports` counts, `GET /products` rollup — SPEC §5/§7 updated.
2. **Vacuous-readiness ruling** — ✅ resolved 2026-09-01: readiness is a four-valued projection (`READY | PARTIAL | NOT_STARTED | NO_REQUESTS`); `READY` requires ≥1 Shot Request; filename tokens match. See CONTEXT.md "Import readiness", SPEC §3/§8, APPROACH.md.
3. **Prod DB holds verification data** — imports `.upload-catalog.csv` (40-row real catalog, all deferred), `.smoke-one-product.csv` (SMOKE-001, READY), `.stress-100.csv` (ST-001…ST-100, mixed states, 13 pending reviews on the live magic link). Decide whether to reset/re-seed before recording the demo video.
4. **Local artifacts (not in repo, on Enzo's machine)** — `~/Downloads/luma-catalog-sample.csv` (the customer export), `~/Downloads/smoke-one-product.csv`, `~/Downloads/styled-shots-stress-100.csv`, `~/Downloads/luma-fidelity-spike/` (spike evidence backing ADR-0002).
5. **Remaining deliverables** — Enzo's ~8-minute video (link into video.md), then `./submit.sh`. T15 stretch (zip export, note-to-direction convenience) remains optional.
