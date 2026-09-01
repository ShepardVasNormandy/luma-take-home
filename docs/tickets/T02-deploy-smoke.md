# T02 — Deploy smoke (owner: main + Enzo for accounts)

Goal: platform problems die while the app is tiny. SPEC §11.2.

Checklist
- Railway project: api service + Postgres + Bucket; variable references per SPEC §9 (BUCKET → BUCKET_NAME, not RAILWAY_BUCKET_NAME)
- `GET /health` 200 on Railway URL; Postgres connect verified; bucket put/get/presign smoke route (temporary, operator-less, removed or guarded after)
- Vercel: web deployed, `/api/health` through rewrite returns Railway response
- Document deploy commands/URLs in docs/deploy.md

Needs Enzo: Railway + Vercel account/link actions, domains.
Out of scope: product UI, auth, real env secrets in repo.
