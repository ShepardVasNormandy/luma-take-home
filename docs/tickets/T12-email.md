# T12 — Email adapter (delegate)

Goal: Resend send-for-review. SPEC §1, §5.

Scope: tiny adapter (send({to: REVIEWER_EMAIL, subject, cta})), "N shots ready for review" template (import name + one CTA button, nothing else), sender verified early per SPEC §11.12 — flag domain/sender restrictions immediately.
