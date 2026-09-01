# T06 — Luma client + worker loop (owner: main)

Goal: generation lifecycle with the locked invariants. SPEC §4, §6; ADR-0002.

Scope
- FIRST: verify via Context7/live Luma docs whether create-generation supports an idempotency/request key. Yes → use it (recovery may re-POST same key). No → POSTING→UNKNOWN stands. Record which in code comment + ticket note.
- Prompt assembly exactly per SPEC §4; exact body persisted
- Worker tick: submit handler (SUBMITTING→POSTING→QUEUED, 429 backoff), poll handler (mirror provider truth; COMPLETED → candidate + asset PENDING; FAILED codes; budget_exhausted → app_settings flag), SKIP LOCKED, per-row error isolation
- `POST /requests/:id/generate` with all gates (closed/needs-input/revision/blocked/budget, count default remaining, cost estimate)
- Telemetry fields per attempt
- Tests: mocked provider — no duplicate POST across restart, UNKNOWN case, gate matrix

Invariants (CONTEXT Failure semantics) are acceptance criteria.
