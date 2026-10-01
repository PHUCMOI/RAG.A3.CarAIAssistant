# Feature Spec — Car Catalogue

## Summary

- Route: `/cars`
- Audience: Public users
- Feature ID: F-02
- Goal: Let users efficiently narrow the 50-car dataset using structured criteria.

## URL query model

- `query`: free-text name or keyword
- `brand`: repeatable brand value
- `bodyType`: repeatable body-type value
- `fuelType`: repeatable fuel value
- `transmission`: repeatable transmission value
- `seats`: integer
- `minPrice`, `maxPrice`: VND integers
- `marketStatus`: repeatable status code
- `sort`: `relevance`, `price_asc`, `price_desc`, `name_asc`
- `page`, `pageSize`

## Layout

1. Header and breadcrumb.
2. Search field and result count.
3. Desktop filter sidebar; mobile filter drawer.
4. Active-filter chips with clear-all action.
5. Sorting and view controls.
6. Result card grid.
7. Pagination.
8. Sticky comparison tray when one or more cars are selected.

## Car card content

- Verified image or deterministic placeholder.
- Brand and display name.
- Market-status badge.
- Body type, fuel type and seats where known.
- `price_vnd_from` formatted in VND or `Chưa có giá tham khảo`.
- Add-to-compare control.
- Open-detail action.

## Data and API

- Extend `GET /api/cars` with all URL filter fields, sorting and pagination.
- Add `GET /api/cars/filters` returning available values and result counts.
- Response must include `totalItems` independent of current page size.

## Business rules

- Multiple values inside the same filter group use OR logic.
- Different filter groups use AND logic.
- Cars with a null price are excluded only when a price range is active.
- Changing filters resets `page` to 1.
- Maximum comparison selection is three cars.

## UI states

- Loading: retain the filters and show result skeletons.
- No results: summarize active criteria and offer clear-all.
- Partial record: display only known attributes.
- Error: show retry without clearing current URL filters.

## Acceptance criteria

- Reloading or sharing the URL restores identical filters.
- Browser back/forward restores catalogue state.
- Currency is formatted using Vietnamese locale without decimal places.
- Selecting a fourth comparison car is prevented with an explanatory message.
- Search is debounced, while explicit Enter submits immediately.
- Filter controls have accessible labels and visible focus states.

## Out of scope

- Saved searches and email alerts.
- Dealer inventory availability.

