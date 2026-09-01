# T05 — Confirm + reconciliation apply (owner: main)

Goal: the human spend gate applies canon. SPEC §5 confirm, CONTEXT canon boundary.

Scope
- `POST /imports/:id/reconcile` (bulk-capable choices)
- `POST /imports/:id/confirm {selectedRowIds}`: validates PRODUCT_CHANGED resolved; products create/update per choice; shot_requests + direction v1 (INITIAL, shot_idea verbatim); NEEDS_INPUT rows get requests without attempts; unchecked eligible → deferred_at; selected eligible → one SUBMITTING attempt each; 409 if already confirmed
- `POST /imports/:id/rows/:rowId/request {shotIdea?}` (deferred start / authored idea; generates only when inputs valid)
- Tests: deferral vs NEEDS_INPUT semantics, idempotent re-confirm rejection, never-delete-on-import

Out of scope: worker execution of attempts (T06).
