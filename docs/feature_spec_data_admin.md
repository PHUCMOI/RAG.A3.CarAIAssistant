# Feature Spec — Data Administration

## Summary

- Route: `/admin/data`
- Audience: Authorized administrators
- Feature IDs: F-09, F-12
- Goal: Maintain business data with validation and auditability.

## Modules

- Cars.
- Dealers.
- Warranties.
- Sources.
- Images.
- CSV import jobs.
- Change history.

## Layout

1. Admin navigation and authenticated-user menu.
2. Entity tabs.
3. Search, filters and data-quality counters.
4. Paginated data table.
5. Create/edit drawer or dedicated form.
6. Import action and validation-results drawer.
7. Audit-history panel.

## Form requirements

- Fields mirror database types and constraints.
- Required fields are identified before submission.
- Source foreign keys use searchable selectors.
- VND prices accept digits only and render a formatted preview.
- JSON fields such as aliases and supported brands use repeatable controls, not raw JSON by default.
- A changed price requires an effective date and source.

## Import workflow

1. Select CSV.
2. Parse without writing records.
3. Display row-level errors and proposed inserts/updates.
4. Require explicit confirmation.
5. Apply the import transactionally.
6. Return an immutable job summary.

## Data and API

- CRUD endpoints under `/api/admin/cars`, `/dealers`, `/warranties`, `/sources` and `/images`.
- Import endpoints under `/api/admin/imports`.
- Mutation requests include a concurrency token or last-known `updated_at`.
- Responses use Problem Details for validation and conflict errors.

## Business rules

- Deleting referenced sources is blocked; archive status is preferred.
- Dealer names remain unique under the current data model.
- Car deletion requires an explicit confirmation showing dependent image/document counts.
- Every mutation records actor, timestamp, entity, record ID and changed fields.
- Embedding refresh is queued only after a successful transaction.

## UI states

- Unauthorized: redirect to login or show access denied.
- Unsaved changes: warn before navigation.
- Conflict: show current server values and allow reload.
- Import errors: allow downloading an error report.

## Acceptance criteria

- Invalid foreign keys and negative prices cannot be submitted.
- Failed imports write no partial business records.
- Sensitive database credentials never appear in admin responses.
- Audit history identifies all successful mutations.
- Destructive actions require explicit confirmation and name the target.

## Out of scope

- Public self-service accounts.
- Direct SQL execution in the browser.

