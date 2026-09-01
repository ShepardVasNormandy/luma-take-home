# T09 — Review UI (delegate once T08 contract frozen)

Goal: Ellie's mobile flow. SPEC §7 Reviewer; CONTEXT Review card/Navigation.

Scope: `/review/[token]` — full-screen card (zoomable candidate, packshot compare toggle, name+SKU, shot idea, progress + request context line), Approve/Reject (reason sheet: 6 reasons + comment, both skippable), synchronous persist (loading on tap, advance on 200, inline retry), explicit back control with decision change, All-caught-up summary, dead-link page.
Never shown: Execution Direction, money.
Contract: packages/shared review schemas only — no invented fields.
