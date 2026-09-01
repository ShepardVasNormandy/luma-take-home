# T13 — Auth (delegate)

Goal: single-operator auth. SPEC §2 (no operators table), §9.

Scope: `POST /auth/login` (env email + argon2 verify vs OPERATOR_PASSWORD_HASH) → @fastify/secure-session cookie (httpOnly, sameSite=lax); logout; operator guard on all non-review non-asset routes; `scripts/hash-password.ts` (stdin password → argon2 hash, never stored); SESSION_SECRET generation documented (`openssl rand -base64 32`).
