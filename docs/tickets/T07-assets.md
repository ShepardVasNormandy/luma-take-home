# T07 — Asset storage + capability URL

Goal: durable assets, private bucket, stable public capability. SPEC §2 assets, §5 Assets, §6.3.

Delegate (adapter): tiny storage adapter over @aws-sdk/client-s3 for Railway Bucket (put, presign GET, exists) using BUCKET_* env; smoke-tested.
Main (wiring): store handler (fetch provider URL, refresh via re-GET generation on expiry, exp+jitter retries ≤5, never regenerates), `GET /assets/:publicId` → 302 presigned (+ download disposition variant), reviewable = STORED.

Tests: retry never POSTs generation; expired-URL refresh path; 404 unknown publicId.
