# T04 — Import ingest + staging (owner: main; CSV utils delegable)

Goal: upload → staged Import with dispositions. SPEC §5 imports, CONTEXT Catalog/Imports.

Scope
- `POST /imports` multipart: csv-parse, sha256 exact-file idempotency (200 existing), snapshot persist (headers, raw ordered rows, row_index)
- Disposition computation: product_reconciliation, creative_work, photo_changed (vs current products)
- Photo preflight: lightweight GET, only rows that could generate; OK/FAILED/SKIPPED
- `GET /imports`, `GET /imports/:id` payloads per SPEC
- Tests: real `data/catalog.csv` fixture (quirks: SKU gaps, multi-value colors, tentative ideas), duplicate-hash, invalid rows non-blocking

Out of scope: confirm, products mutation (T05).
