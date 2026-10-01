# Feature Spec — Source Detail

## Summary

- Route: `/sources/:sourceId`
- Audience: Public users and administrators
- Feature ID: F-07
- Goal: Explain where a displayed claim originated and what the source supports.

## Layout

1. Breadcrumb.
2. Source title and type badge.
3. External URL action.
4. Supported-claims description.
5. Last checked date.
6. Referencing records grouped by cars, prices, warranties, dealers and documents.
7. Data-use disclaimer.

## Data and API

- `GET /api/sources/{sourceId}`.
- Response includes the source row plus lightweight referencing-record summaries.
- The endpoint must not fetch or proxy the external page at request time.

## Business rules

- `supports` describes scope; it is not a guarantee that the source supports unrelated fields.
- External links are clearly marked as leaving AutoWise.
- Dataset and local-file sources do not expose an unusable external-link action.
- Checked date is the project verification date, not necessarily the publication date.

## UI states

- Not found: return to the originating car or catalogue.
- No references: show source metadata without an empty table.
- External URL unavailable: keep metadata visible.

## Acceptance criteria

- The screen displays the exact source ID and checked date.
- References link back to their applicable detail screens.
- External links use safe target attributes.
- No copyrighted source body is copied into the page.

## Out of scope

- Archiving complete source webpages.
- Automated fact verification.

