# T11 — Export CSV (delegate)

Goal: "their sheet came back with answers". SPEC §8; CONTEXT Output.

Scope: `GET /imports/:id/export.csv` streamed csv-stringify; row_index order; values from raw jsonb incl. unknown columns; appended columns + status vocabulary exactly per CONTEXT; Approved Image N = max(3, max required_approvals); capability URLs; filename `<basename>-<ready|partial>-<date>.csv`; Import Ready computation exposed in summary endpoint.
Tests: round-trip semantic preservation on real catalog fixture; column math; every status mapping.
