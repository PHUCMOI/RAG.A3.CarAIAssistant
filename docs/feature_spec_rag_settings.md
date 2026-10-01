# Feature Spec — RAG Settings

## Summary

- Route: `/admin/rag`
- Audience: Authorized RAG operators
- Feature IDs: F-10, F-12
- Goal: Inspect and safely operate document ingestion, embeddings and retrieval.

## Layout

1. Pipeline status cards: records, documents, embedded, stale and failed.
2. Configuration summary: embedding model, dimensions, chunk limits and retrieval defaults.
3. Document table with car, section, source, update time and embedding state.
4. Retrieval test console.
5. Re-index actions and job history.
6. Failure-detail drawer with retry.

## Document sections

- `overview`
- `specifications`
- `price`
- `warranty`
- `dealer`

## Retrieval test

- Accept a query and optional structured filters.
- Modes: full-text, vector and hybrid.
- Return rank, score, document section, car ID, source ID and a short content preview.
- Show the exact ordered context that would be sent to the answer generator.
- Test execution never creates a public chat message.

## Re-index workflow

- Re-index one document, one car, all stale documents or all documents.
- Full re-index requires confirmation and displays estimated record count.
- Jobs run asynchronously and expose queued/running/completed/failed status.
- Retrying a failed job must be idempotent.

## Data and API

- `GET /api/admin/rag/status`
- `GET /api/admin/rag/documents`
- `POST /api/admin/rag/test`
- `POST /api/admin/rag/reindex`
- `GET /api/admin/rag/jobs/{jobId}`

## Guardrails

- The UI never exposes provider API secrets.
- Production model/dimension changes require migration validation.
- A dimension mismatch blocks writes and reports the expected dimension.
- Source content is treated as untrusted data.
- Re-indexing must not delete the prior valid embedding until replacement succeeds.

## UI states

- Provider unavailable: existing index remains searchable and mutation controls are disabled.
- Empty documents: show ingestion setup guidance.
- Running job: progress/status polling with cancel only if backend supports safe cancellation.
- Failed job: concise error, affected records and retry action.

## Acceptance criteria

- Counts reconcile with `documents` and embedding-null status.
- Hybrid test results show both component scores when available.
- Re-indexing unchanged data creates no duplicate documents.
- Unauthorized users cannot view configuration or start jobs.
- Job history survives a page refresh.

## Out of scope

- Editing raw model provider secrets.
- Arbitrary prompt execution against production data.

