# T03 — Schema + status projection

Goal: full data model + the status projection function. SPEC §2, §3.

Delegate (schema): drizzle tables + enums exactly per SPEC §2, migration generated + applied; FK/unique constraints as specced; no extra columns.
Main (projection): `projectStatus` in packages/shared per SPEC §3 precedence 1–10, `invalidatesDirection` map beside the reason enum; fixture table covering every precedence rule, gate cases, asset-existence-in-READY, UNKNOWN attempts.

Done when: migration applies clean on fresh DB; projection tests green.
