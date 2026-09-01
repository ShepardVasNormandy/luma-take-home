# ADR-0002 — v1 generation strategy (fidelity spike outcomes)

Date: 2026-09-01 · Status: accepted

## Context

Before building, we needed evidence — not opinions — for: whether Luma `image_edit` preserves real product appearance from the catalog packshots; whether `uni-1-max` justifies its price; actual latency/cost; what prompt material helps; and failure modes on hard products (glass, patterns, sets).

## Method

Six paid generations ($0.38 total), `type: image_edit` with the packshot as `source`, one variable changed per experiment, judged jointly against the source packshots:

| Exp | Product | Variable | Verdict |
|---|---|---|---|
| A | HG-002 sage stoneware mug | baseline, minimal prompt, uni-1 | PASS — slight warm color drift |
| B | same, same prompt | uni-1-max | uni-1 wins on value — max: crisper texture, no approval-relevant fidelity gain |
| C | same, uni-1 | + product facts + preservation sentence | PASS — best result by a clear margin |
| D | HG-041 smoke-glass tumbler set | hard material + set | PARTIAL — shape/bubble texture survive; smoke tint washes out filled + brightly lit; set quantity FAILED (one glass rendered from a one-glass packshot despite "set" prompt language) |
| E | HG-011 chunky knit throw | pattern/texture, drape | PARTIAL — gauge/stripe/color excellent; drape physically implausible (reads as two sections) — would not be approved |

## Decisions

1. **Model: `uni-1` for v1.** `uni-1-max` out of scope: ~2.4× cost ($0.1030 vs $0.0434/edit) and worse, more variable latency (85–145s vs 54–57s) for no fidelity gain where approval happens.
2. **Square output** (2048×2048, follows the square packshots). No ratio parameter in v1.
3. **One Candidate first**; more generation only after the first approval validates the Direction.
4. **Prompt assembly** (deterministic, in code): active Execution Direction + selective useful Product facts (color/material) + one short preservation instruction + source image. No fidelity boilerplate, no full catalog-field dump. Evidence: experiment C beat the minimal prompt on color fidelity at identical cost.
5. **Known fidelity risks, documented not blocking:** transparent/light-sensitive materials; deformable products (surface texture survives, physical continuity may not); set/multi-item quantities when the source shows one unit. These are why the Reviewer compares against the packshot and why `WRONG_PRODUCT_FIDELITY` exists as a rejection reason.
6. **Initial unit-economics assumptions** from observed runs: $0.0434 and ~55s per uni-1 edit; a first-pass approved image ≈ 1–2 generations ($0.04–0.09) plus seconds of review time.

## Consequences

- This ADR is the authority for the prompt template and model choice; changing either requires new evidence, not memory.
- Spike artifacts (raw images, provider responses, report) are archived outside the repo (`~/Downloads/luma-fidelity-spike`); the decisions live here.
