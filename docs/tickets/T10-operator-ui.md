# T10 — Operator UI (delegate screens / main wiring)

Goal: Maya's app. SPEC §7 Operator.

Scope: `/login`; `/` imports list + upload (duplicate-hash navigation); `/imports/[id]` staged (dispositions table, diffs + keep/use-imported + bulk, preflight, verbatim Notes, selection, confirm bar w/ count + est spend) and confirmed (status board, filters, spend summary, budget banner, send-for-review, exports, deferred + NO_REQUEST sections); `/requests/[id]` (packshot, immutable idea, Notes verbatim, direction editor + history, candidates grid w/ decision reasons beside generate controls, gated generate buttons w/ cost labels, attempts log w/ retries + unknown state, close/reopen, required-approvals).
Contract: shared schemas; all rules server-enforced — UI reflects, never invents.
