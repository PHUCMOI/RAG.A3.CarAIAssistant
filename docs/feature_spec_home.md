# Feature Spec — Home

## Summary

- Route: `/`
- Audience: Public users
- Feature IDs: F-01, F-06
- Goal: Help a user start car discovery within one interaction.

## Primary user stories

- As a buyer, I want to describe my need in plain language.
- As a browsing user, I want quick access to popular search categories.
- As a returning user, I want to continue to the catalogue or chatbot.

## Layout

1. Global header: logo, Cars, Compare, Dealers and Chat navigation.
2. Hero: product statement, search input and submit button.
3. Quick intents: under VND 800 million, SUV, seven seats, family car and compare.
4. Featured cars: database-driven cards, maximum six.
5. Trust section: verified sources, last-updated messaging and data limitations.
6. Footer: navigation and disclaimer.

## Interactions

- Empty submission keeps focus on the search field and displays an inline validation message.
- A direct model-name query opens catalogue results.
- A needs-based query opens Chat with the query prefilled and submitted.
- Quick intent cards open the catalogue with corresponding URL filters.
- A featured car card opens `/cars/{carId}`.

## Data and API

- `GET /api/cars?limit=6` for featured cars until a dedicated endpoint exists.
- `POST /api/search/text` may be used to classify or preview query results.
- Featured-car selection must not be permanently hard-coded in React.

## UI states

- Loading: skeleton hero suggestions and six card skeletons.
- Empty: hide the featured grid and show a link to all cars.
- API error: keep search usable and show a retry action for featured cars.
- Offline: display a non-blocking system status banner.

## Acceptance criteria

- Navigation works by keyboard and indicates the current page.
- Search submission works with Enter and button click.
- The query is preserved during navigation.
- Every price card labels the value as a starting/reference price.
- Historical/private-import status is visible before opening a car.
- Mobile layout has no horizontal scrolling at 360 px.

## Out of scope

- Personalized recommendations based on an authenticated profile.
- Sponsored placements.

