# ADR-0001 — Deterministic prompt assembly instead of LLM enrichment

Date: 2026-09-01 · Status: accepted

## Context

The original design used a small text model in the critical path twice: (1) classify customer Notes into a taxonomy so creative notes could feed prompts while operational notes ("bestseller, do this one first") stayed out, and (2) compose/revise a richer Execution Direction from the Shot Idea, with AI-suggested revisions after rejections.

Two facts changed this:

1. **Credential reality.** The only shipped credential is the Luma Agents API key (generation). No Luma text-inference access; personal Anthropic keys cannot ship with the assignment. Any text model would mean bolting on a new external provider purely to rewrite a couple of sentences.
2. **Spike evidence** (see ADR-0002, 2026-09-01). The best generation used deterministic enrichment: the scene text + selective product facts (color/material) + one short preservation instruction + the source image. No creative rewriting was needed to materially improve the result.

## Decision

v1 generation pipeline is: original Shot Idea → initial Execution Direction (verbatim copy, provenance `INITIAL`) → Operator-edited versions when needed (`OPERATOR_EDITED`) → deterministic prompt assembly in code → Luma `uni-1` image_edit.

Cut from v1: automatic Note classification, LLM-composed Directions, AI-suggested revisions (`MODEL_SUGGESTED` provenance). Notes remain preserved and displayed verbatim; the Operator decides what enters a Direction. The rejection loop is human: structured reason + optional comment → Operator edits → explicit regenerate.

## Consequences

- Fewer providers, credentials, failure modes; unit economics contain only generation spend.
- The Operator carries the creative-rewrite load; acceptable at this catalog scale, and the review loop already routes Ellie's feedback to her.
- The spike stays the authority on what prompt material earns its place; changes to the assembly wrapper are integration code, invisible to the Operator.
- If an approved text-model provider becomes available, Note classification, priority-aware queue ordering, and suggest-revision are the obvious v2 additions — the version/provenance model already has room for them.
