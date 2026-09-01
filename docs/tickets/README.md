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

1. **Visual identity revisit** — the shipped identity pass (viewfinder mark, login hero, favicon; commit b62f753) was judged a miss by Enzo ("from-a-vacuum design fail"); direction to be reworked from an explicit mockup round, not another from-scratch pass. Reviewer-flow visuals are approved and frozen.
2. **Vacuous-readiness ruling** — all-deferred imports read "Import ready" / export `-ready-` (see APPROACH.md open decision). Enzo decides; behavior deliberately unchanged so far.
3. **Prod DB holds verification data** — imports `.upload-catalog.csv` (40-row real catalog, all deferred), `.smoke-one-product.csv` (SMOKE-001, READY), `.stress-100.csv` (ST-001…ST-100, mixed states, 13 pending reviews on the live magic link). Decide whether to reset/re-seed before recording the demo video.
4. **Local artifacts (not in repo, on Enzo's machine)** — `~/Downloads/luma-catalog-sample.csv` (the customer export), `~/Downloads/smoke-one-product.csv`, `~/Downloads/styled-shots-stress-100.csv`, `~/Downloads/luma-fidelity-spike/` (spike evidence backing ADR-0002).
5. **Remaining deliverables** — Enzo's ~8-minute video (link into video.md), then `./submit.sh`. T15 stretch (zip export, note-to-direction convenience) remains optional.
