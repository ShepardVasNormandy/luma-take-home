# T08 — Review backend (owner: main)

Goal: sessions, tokens, queue, decisions. SPEC §2, §5 Review; CONTEXT Review.

Scope
- `POST /imports/:id/review/send`: create-or-refresh (hashed token, +30d), Resend email to REVIEWER_EMAIL (depends T12 adapter; stub send acceptable until then)
- `GET /review/session`: pending queue oldest-first (candidate asset URL, packshot, name+SKU, shot idea verbatim, progress line, counts) + recently-decided for back-nav
- `PUT /review/candidates/:id/decision`: upsert, token scope check, reviewable+not-closed verification → 409 stale
- Typed 401 codes for expired/revoked
- Tests: staleness, upsert change, revocation, expiry refresh
