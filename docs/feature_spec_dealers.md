# Feature Spec — Dealers

## Summary

- Route: `/dealers`
- Audience: Public users
- Feature ID: F-05
- Goal: Find a relevant authorized dealer by brand and city.

## Supported initial scope

- 22 seeded dealers.
- Nine supported brands.
- Hanoi, Ho Chi Minh City and Da Nang.

## Layout

1. Header and explanatory text.
2. Brand filter.
3. City filter.
4. Search by dealer name or address.
5. Result count and list/grid toggle.
6. Dealer cards.
7. Optional map placeholder; list is the authoritative view.

## Dealer card

- Dealer name.
- Supported brand badges.
- English database address rendered as stored.
- City.
- Click-to-call phone.
- Visit-website action.
- `Checked on` date shown in Vietnamese UI format.
- Source link.

## Data and API

- `GET /api/dealers?brand=&city=&query=&page=&pageSize=`.
- `GET /api/dealers/{dealerId}` for direct linking or drawer detail.
- API filters `supported_brands` using JSONB containment.

## Business rules

- Default sort: city, brand and dealer name.
- Brand filter matches exact JSON array values.
- External dealer websites open in a new tab.
- A phone action uses a sanitized `tel:` value but displays the formatted value.
- Do not claim live inventory or current opening hours.

## UI states

- No filter results: retain filters and offer clear-all.
- Missing phone/website: hide the unavailable action.
- Error: preserve filters and show retry.
- Empty database: explain that dealer data has not been loaded.

## Acceptance criteria

- Filtering Toyota + Hanoi returns only Toyota dealers in Hanoi.
- Every dealer card exposes `checked_at` and provenance.
- Website links use `noopener noreferrer`.
- The page is usable without location permission.
- Phone links work on mobile.

## Out of scope

- Appointment booking.
- Geolocation distance calculations.
- Dealer reviews and inventory.

