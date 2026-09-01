# T01 — Scaffold (owner: main)

Goal: pnpm monorepo that typechecks, runs, and is deployable-shaped. SPEC §1, §9.

Deliverables
- pnpm workspace: `apps/api`, `apps/web`, `packages/shared`
- `packages/shared`: zod + ts, exports placeholder schema + `projectStatus` stub
- `apps/api`: Fastify TS, `GET /health` → `{ok:true}`, env loading + zod-validated config, drizzle + drizzle-kit wired (no tables yet), worker tick skeleton (no handlers)
- `apps/web`: Next App Router TS, minimal page, `next.config` rewrite `/api/:path*` → `${API_URL}/:path*`
- root scripts: `dev`, `build`, `typecheck`, `test` (vitest)
- `.env.example` updated to SPEC §9 (placeholders only)

Out of scope: any product feature, deploy config beyond what T02 needs.
Done when: `pnpm typecheck && pnpm build` green; api boots locally; web renders.
