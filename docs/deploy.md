# Deploy

Two platforms: Railway (api + Postgres + Bucket), Vercel (web). SPEC §1, §9.

## Railway (api)

One project, three services:

1. **Postgres** — Railway template. Provides `DATABASE_URL`.
2. **Bucket** — Railway Bucket. Provides `BUCKET`, `ENDPOINT`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `REGION`.
3. **api** — deploy from repo root with root directory `.` (monorepo):
   - Build: `pnpm install --frozen-lockfile`
   - Start: `pnpm --filter @shots/api start` (tsx-run, no build step)
   - Pre-deploy (or one-off): `pnpm --filter @shots/api db:migrate`

### api service variables

| Var | Source |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` |
| `BUCKET_NAME` | `${{Bucket.BUCKET}}` — NOT `RAILWAY_BUCKET_NAME` (display name only) |
| `BUCKET_ENDPOINT` | `${{Bucket.ENDPOINT}}` |
| `BUCKET_ACCESS_KEY_ID` | `${{Bucket.ACCESS_KEY_ID}}` |
| `BUCKET_SECRET_ACCESS_KEY` | `${{Bucket.SECRET_ACCESS_KEY}}` |
| `BUCKET_REGION` | `${{Bucket.REGION}}` |
| `LUMA_AGENTS_API_KEY` | from `.env.local` (never committed) |
| `RESEND_API_KEY` | Resend dashboard |
| `REVIEW_FROM_EMAIL` | `onboarding@resend.dev` (demo) or verified domain sender |
| `REVIEWER_EMAIL` | the inbox playing Ellie |
| `OPERATOR_EMAIL` | Maya's login email |
| `OPERATOR_PASSWORD_HASH` | `pnpm --filter @shots/api hash-password` (paste output) |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `WEB_URL` | Vercel production URL (review links) |
| `API_PUBLIC_URL` | Railway public URL of this service (export asset links) |
| `PORT` | Railway injects; config default 3001 works locally |

## Vercel (web)

- Project root: `apps/web` (monorepo — set Root Directory in project settings; Vercel handles pnpm workspaces).
- Env: `API_URL` = Railway api public URL (used by next.config rewrite at build/runtime).
- `vercel --cwd apps/web` for preview, `--prod` for production.

## Smoke checklist (T02)

- [ ] `GET <railway-api>/health` → 200
- [ ] Postgres reachable (migrate runs clean)
- [ ] Bucket put/presign smoke (temporary route or one-off script)
- [ ] `<vercel-web>/api/health` → same 200 through the rewrite
- [ ] Login works end-to-end (cookie via rewrite)

## Notes

- Resend demo mode: `onboarding@resend.dev` delivers only to the Resend account owner's inbox — point REVIEWER_EMAIL at that inbox for the demo, or verify a domain.
- Worker runs in-process with the api; a Railway restart mid-generation is safe (reconciler resumes polling; POSTING-without-id → UNKNOWN, manual retry only).
