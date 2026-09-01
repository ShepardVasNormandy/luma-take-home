# CLAUDE.md — working rules for this repo

Authority chain for domain/system decisions: CONTEXT.md > SPEC.md > docs/adr/ > docs/tickets/. Before implementing any non-trivial change, read the relevant sections of those docs and the code you are about to touch; prefer reusing current patterns over introducing new ones.

## Restraint

- Prefer the smallest change that satisfies the requirement.
- Do not invent abstractions, state machines, services, tables, queues, providers, or frameworks unless current code genuinely needs them. Statuses here are projections over durable facts, never hand-maintained enums.
- Do not add generic infrastructure for a single use case.
- Do not add dependencies when the existing stack (Fastify, Drizzle, Next, zod, vitest) solves the problem cleanly.
- Preserve existing architecture and domain semantics unless the task explicitly requires a change. If implementation exposes a contradiction with CONTEXT.md, stop and escalate — don't invent.
- Keep scope where the task is: a local task stays local (no repo-wide refactors); a visual-only task never touches domain or API behavior.
- Call out tradeoffs and unrelated problems instead of silently "improving" code the task didn't ask about.

## Comments

- Do not add comments that explain obvious code. A comment earns its place only for: non-obvious invariants, provider quirks, failure/retry semantics, security-sensitive behavior, or why a seemingly odd tradeoff exists.

## Tests

- Test behavior and invariants that matter (projection precedence, money-touching paths, contract preservation, failure recovery). Do not add tests to inflate coverage.

## Production and paid operations

- Diagnose before fixing production issues: reproduce safely, gather evidence (logs/DB/HTTP), report — never patch prod config, code, or data speculatively.
- Never retry an ambiguous paid/provider operation blindly. Luma has no idempotency key and no list endpoint; a POST whose fate is unknown is surfaced for manual retry, never re-POSTed automatically.

## UI

- Keep changes visually coherent with the existing surface; avoid generic "AI SaaS" component soup.
- Reviewer-flow visuals are approved and frozen — do not restyle them.
