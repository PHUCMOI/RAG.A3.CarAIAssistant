# Feature Spec — Car Comparison

## Summary

- Route: `/compare?ids={carId1,carId2,carId3}`
- Audience: Public users
- Feature ID: F-04
- Goal: Help users understand material differences between two or three cars.

## Entry points

- Add-to-compare controls in catalogue cards.
- Add-to-compare action on car detail.
- Comparison request from chatbot recommendations.
- Direct shareable URL.

## Layout

1. Header and selected-car count.
2. Sticky vehicle headers with image, name, price and remove/replace controls.
3. Summary verdict limited to facts in the comparison payload.
4. Rows grouped into price/status, powertrain, capacity, dimensions and warranty.
5. Dealer availability summary by city.
6. Ask-chat-about-comparison action.

## Data and API

- `GET /api/cars/compare?ids=id1,id2,id3`.
- Server validates two to three unique valid IDs.
- Response uses a normalized field schema so the UI does not derive units.

## Business rules

- Lowest known price may be highlighted; null prices are neutral.
- Higher power is not automatically labelled better.
- Dimension differences are shown numerically without subjective ranking.
- The summary may state fit by seats/body type only when supported by data.
- A historical price must retain its status and date in the comparison.

## Interactions

- Replace opens a searchable car picker.
- Remove updates the URL immediately.
- Dropping below two cars shows an empty comparison slot and picker.
- Share copies the canonical comparison URL.
- On mobile, one attribute row scrolls horizontally within the table only.

## UI states

- No IDs: onboarding empty state with car picker.
- One ID: prompt to add a second vehicle.
- Invalid ID: omit it and show a non-blocking warning.
- Loading/error: preserve selected IDs and provide retry.

## Acceptance criteria

- Duplicate cars cannot be selected.
- A maximum of three cars is enforced in UI and API.
- All units are shown consistently.
- Shared URL recreates the same selection and order.
- Missing values are visually distinct from zero.

## Out of scope

- User-entered custom trims.
- Total-cost-of-ownership scoring.

