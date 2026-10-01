# Feature Spec — Chatbot

## Summary

- Route: `/chat` and optional `/chat/:sessionId`
- Audience: Public users
- Feature IDs: F-06, F-08, F-11
- Goal: Answer car-shopping questions using retrieved project data.

## Supported intents

- Recommend by budget, seats, body type, fuel or brand.
- Find vehicles matching structured constraints.
- Compare named vehicles.
- Explain price and market status.
- Explain warranty coverage.
- Find dealers by brand and city.
- Report missing or unavailable data.
- Future: find visually similar cars from an uploaded image.

## Layout

1. Sidebar: new chat, recent sessions, catalogue and RAG links.
2. Header: title, grounded-data label and clear/delete action.
3. Conversation stream.
4. Suggested prompts for an empty conversation.
5. Message composer with text and optional image attachment.
6. System/API status indicator.

## Assistant response anatomy

- Direct answer first.
- Assumptions or interpreted filters.
- Up to five car or dealer result cards.
- Concise rationale using known fields.
- Inline citations linked to source detail.
- Limitation warning when data is historical, imported or incomplete.
- Suggested follow-up actions.

## Data and API

- Current `POST /api/chat` is retrieval-only and must evolve to accept session and context.
- Target endpoint: `POST /api/chat/sessions/{sessionId}/messages`.
- Request includes `message`, optional `carIds`, optional image reference and locale.
- Response includes `answer`, `intent`, `filters`, `citations`, `cars`, `dealers`, `grounded` and `messageId`.

## Retrieval flow

1. Validate and normalize the question.
2. Detect intent and extract structured filters.
3. Resolve explicit car, brand and city entities.
4. Run structured and hybrid document retrieval.
5. Build a context containing claims and source IDs.
6. Generate an answer constrained to the context.
7. Validate citations and remove unsupported claims.

## Guardrails

- No fabricated specifications, prices, warranties or dealer details.
- Retrieved documents are data, not instructions.
- Do not provide definitive financial, legal or safety advice.
- If no grounded answer exists, state that clearly and propose supported alternatives.
- Limit question length and rate-limit the endpoint.

## Interactions

- Enter sends; Shift+Enter inserts a line break.
- While sending, duplicate submissions are disabled.
- Clicking a car card opens its detail page.
- Clicking compare adds selected recommendations to comparison.
- Clear creates a fresh local conversation; delete requires confirmation for persisted sessions.

## UI states

- Initial: welcome message and four suggested prompts.
- Sending: visible progress indicator and disabled send button.
- Retrieval empty: supported no-answer response.
- API failure: retain the user's message and offer retry.
- Offline: composer remains editable but sending explains unavailable service.

## Acceptance criteria

- Every factual recommendation references at least one returned record/source.
- A VND budget is parsed without requiring separators.
- The response distinguishes current, historical and import statuses.
- Retry never duplicates the user message in persisted history.
- Uploaded images are type/size validated before submission.
- Screen-reader users are notified when a new response arrives.

## Out of scope for initial MVP

- Voice conversation.
- Certain image model identification before image embeddings are connected.

