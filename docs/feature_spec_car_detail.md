# Feature Spec — Car Detail

## Summary

- Route: `/cars/:carId`
- Audience: Public users
- Feature IDs: F-03, F-05, F-07
- Goal: Present a trustworthy, source-backed view of one vehicle.

## Layout

1. Breadcrumb and market-status badge.
2. Image gallery with thumbnail navigation.
3. Title, description, starting price and price date.
4. Primary actions: add to comparison, ask chatbot and view dealers.
5. Overview facts: body type, seats, fuel and transmission.
6. Engine and dimension specification table.
7. Warranty section.
8. Dealer section filtered to the vehicle brand.
9. Sources and data-quality section.
10. Similar-car carousel.

## Data and API

- `GET /api/cars/{carId}` must return complete detail rather than catalogue summary only.
- `GET /api/dealers?brand={brand}` returns relevant dealers.
- `GET /api/warranties?brand={brand}&carId={carId}` resolves car-specific warranty first, then brand policy.
- `GET /api/sources/{sourceId}` supplies provenance details.

## Business rules

- Price heading is `Giá từ` for current official data and `Giá tham khảo` otherwise.
- Display the source and `price_as_of` adjacent to the price.
- Never infer a specification from another generation or alias.
- Warranty-specific values override brand-level values.
- Similar cars use body type and price proximity, excluding the current car.

## Interactions

- Gallery supports keyboard arrows and full-screen preview.
- Ask-chat action passes the car ID and name into chat context.
- Dealer action scrolls to the dealer section or opens `/dealers?brand=...`.
- Source links open the internal source detail screen first.

## UI states

- Not found: dedicated 404 state with return-to-catalogue action.
- Missing images: neutral vehicle placeholder, not a broken image.
- Missing price/specification: explicit unavailable label.
- Dealer empty: explain that the current database has no matching dealer.

## Acceptance criteria

- All values shown match the selected `carId` response.
- The image gallery does not render paths that fail verification.
- Price, warranty and status each expose their source where available.
- Comparison selection persists when navigating back to catalogue.
- Mobile specification table is readable without page-level horizontal scroll.

## Out of scope

- Live quotation requests.
- Financing and ownership-cost calculation.

