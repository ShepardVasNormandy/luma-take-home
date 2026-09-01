# ASSUMPTIONS

The questions I would have asked this team, the assumption I proceeded on instead, and what each changed about what got built. Ordered by how much a different answer would have changed the product.

## 1. Ellie, what exactly killed the creative-automation dashboard?

**Would have asked:** Was it the login? Having another place to remember to check? Desktop-only? The tool itself?

**Assumption:** the failure was *pull, login, and a new surface to remember* — not "web pages" per se. Ellie's own words constrain the shape ("works from my phone", "no installing anything new"), but they don't mandate Slack.

**What it changed:** the Reviewer surface is a **magic email link → mobile web page**. No account, no password, no app, nothing to remember — the link arrives when there's something to review (push, not pull), and the page does exactly one job. If this assumption is wrong and the real constraint is "Slack or nothing," the review surface is the swappable part of the architecture: the queue/decision API stays, only the delivery UI changes.

## 2. What makes a generated image approvable — how faithful must the product be?

**Would have asked:** Does the product need to be pixel-faithful? Is warm-light color drift acceptable? Any policy concerns about AI images on product pages?

**Assumption:** brand people notice wrong glazes — fidelity is the bar, and only Ellie can judge it. Validated cheaply with a 6-generation spike against the real catalog before building (docs/adr/0002): ceramics and textiles pass; smoke glass washes out when filled; set quantities don't survive a one-item packshot; a physically-weird drape can accompany perfect texture.

**What it changed:** the review card always shows the **original packshot next to the candidate**; `WRONG_PRODUCT_FIDELITY` is a first-class rejection reason with its own semantics (it doesn't invalidate the creative direction, so Maya can re-roll without rewriting); known fidelity risks are documented rather than hidden.

## 3. Who writes the 40 shot ideas for the drop?

**Would have asked:** Does every drop product launch with a styled shot, and who authors ideas the sheet doesn't have?

**Assumption:** Maya authors missing ideas — she's the founder, not a vendor; the client's voice and Maya's voice are the same company. But blank Shot Ideas are *normal data* (24 of 40 rows in the sample), never an error, and nothing auto-fills them.

**What it changed:** rows without ideas are visible, non-blocking, and get an explicit "Save idea & generate first candidate" action. AI-suggested shot ideas were considered and cut (see ADR-0001 and #6).

## 4. Where must final files land so the web person stops asking "which is final"?

**Would have asked:** Is the Drive folder sacred, or is any single unambiguous location fine?

**Assumption:** the ritual that matters is "one unambiguous place with unambiguous names," not Drive specifically. The brief says an updated export is fine.

**What it changed:** "done" = the **enriched CSV** — their own sheet back, same columns and order, with status and stable image links appended — plus deterministic filenames (`HG-002_approved-01.jpg`) on download. Asset links are permanent capability URLs served by us, so a CSV opened months later still works. Drive API integration deliberately not built.

## 5. How many approved images make a request done?

**Would have asked:** The brief says "2–3 approved images." Which is it, and does it vary?

**Assumption:** default 2 (the brief's lower bound — half the spend of 3), overridable per request (1–x) by Maya.

**What it changed:** `requiredApprovals` is data, not a constant; progress, generate-button defaults ("Generate remaining N"), and the export's Approved Image column count all derive from it.

## 6. Is a text-model allowed in the stack?

**Would have asked:** nothing — this one was decided by credential reality plus evidence.

**Assumption/decision:** the only shipped credential is the Luma generation key. Rather than bolt on another provider to rewrite sentences, v1 uses **deterministic prompt assembly** (direction + product facts + one preservation line), which the spike showed beats the naive prompt anyway. Note classification and AI-suggested revisions are the documented v2 additions (ADR-0001).

**What it changed:** Notes are preserved and displayed verbatim but never machine-interpreted; Maya decides what enters a direction; the rejection→revision loop is human. One provider, one failure mode, cleaner unit economics.

## 7. Budget: is a hard cap needed?

**Would have asked:** What's the monthly ceiling? Who enforces it?

**Assumption:** Maya's fear is *invisible* waste, not spend per se. Every dollar in this system is behind an explicit human click (confirm, generate, retry), the first candidate is a single image until Ellie validates the direction, and spend is displayed from real per-attempt records.

**What it changed:** no budget-cap configuration surface in v1; a provider `budget_exhausted` signal disables generation globally until cleared.

## 8. Can review links leak?

**Would have asked:** Comfort level with capability URLs?

**Assumption:** acceptable for a six-person team. The review link is a scoped, hashed, 30-day-expiring, revocable token that can only read the queue and write decisions; asset links are unguessable and read-only single-image. Neither can touch the catalog, spend money, or see costs. Named tradeoff, revisit if the team grows.

## 9. Are multi-product scenes ("shoot with the mugs") required for v1?

**Assumption:** no — and the spike gave a harder reason than scope: the model renders the object count of the source packshot (one glass from a one-glass photo, prompt notwithstanding). Cross-product shots are v2 and may require data-model evolution; the sheet's notes recording those wishes are preserved verbatim so the intent isn't lost.

## 10. New exports keep coming — what's "the same import"?

**Assumption:** byte-identical file = same handoff (hash-linked, no duplicate work); any difference = a genuinely new import through reconciliation, where changed product data is never silently overwritten and creative work is never deduplicated across imports (a new campaign may legitimately reshoot the same idea).

**What it changed:** import is a persisted snapshot with explicit per-row reconciliation; absence of a SKU from a later subset export means nothing.
