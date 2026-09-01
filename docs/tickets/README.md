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
