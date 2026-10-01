# AutoWise Product Specification

## 1. Document information

- Product: AutoWise Vietnam Car RAG
- Version: 1.0
- Updated: 2026-10-01
- Backend: ASP.NET Core / C#
- Frontend: React / TypeScript
- Database: PostgreSQL with pgvector
- UI language: Vietnamese
- Stored business data: English

## 2. Product goal

AutoWise helps users discover, evaluate and compare cars available or previously available in Vietnam. Answers must be grounded in the project database and must distinguish current official models, historical official models and private-import references.

The MVP is successful when a user can:

1. Search and filter the car catalogue.
2. Inspect a car's verified details, price, warranty and data sources.
3. Compare two or three cars.
4. Find an authorized dealer by brand and city.
5. Ask the chatbot for grounded recommendations and follow links to relevant cars.

## 3. Personas

### P1 — First-time buyer

Needs simple recommendations based on budget, seats, body type and intended use.

### P2 — Research-oriented buyer

Needs side-by-side specifications, source citations and data freshness information.

### P3 — Data administrator

Needs to maintain cars, prices, warranties, dealers and sources without directly editing PostgreSQL.

### P4 — RAG operator

Needs to inspect ingestion status, document chunks, embeddings and retrieval behavior.

## 4. Data rules

- Prices displayed in the UI come only from `cars.price_vnd_from`.
- Each displayed price must include `price_as_of` and, where available, `price_source_id`.
- `market_status_vn` must be shown in user-friendly Vietnamese but stored using the existing English status code.
- A historical or private-import price must never be presented as a current official list price.
- Dealer recommendations must match the selected brand in `dealers.supported_brands`.
- Warranty values must indicate that time/distance limits use whichever comes first when applicable.
- Missing values display as `Chưa có dữ liệu`; the UI must not invent a value.
- Generated chatbot answers must cite retrieved records or documents.
- Business records remain in English; UI labels and explanatory text are Vietnamese.

## 5. Feature catalogue

| ID | Feature | Priority | MVP status |
|---|---|---:|---|
| F-01 | Home discovery and global search | P0 | Required |
| F-02 | Car catalogue with filters and sorting | P0 | Required |
| F-03 | Car detail with images, price and specifications | P0 | Required |
| F-04 | Compare two or three cars | P0 | Required |
| F-05 | Dealer directory by brand and city | P0 | Required |
| F-06 | Grounded chatbot recommendations | P0 | Partial implementation |
| F-07 | Source provenance viewer | P1 | Required for trust |
| F-08 | Conversation persistence | P1 | After initial MVP |
| F-09 | Data administration | P1 | After public MVP |
| F-10 | RAG ingestion and retrieval operations | P1 | Required before LLM release |
| F-11 | Image-based car retrieval | P2 | Future |
| F-12 | Authentication and admin authorization | P1 | Required before admin deployment |

## 6. Feature requirements

### F-01 Home discovery

- Present the product value proposition and a global search box.
- Provide common intent shortcuts: budget, family car, SUV, seven seats and comparison.
- Show representative cars from the database, never hard-coded catalogue data.
- A submitted query routes to the catalogue when it is filter-oriented and to chat when it is advisory.

### F-02 Car catalogue

- Search by display name, source model name, alias and brand.
- Filter by brand, price, body type, seats, fuel type, transmission and Vietnam market status.
- Sort by relevance, price ascending, price descending and name.
- Preserve filters in the URL query string.
- Paginate results and display total count.

### F-03 Car detail

- Display description, image gallery, price, market status, technical specifications, warranty and sources.
- Show nearby or relevant dealers for the vehicle brand.
- Allow adding the car to comparison.
- Clearly label missing and historical information.

### F-04 Comparison

- Compare a minimum of two and maximum of three cars.
- Highlight the lowest known price and differences in comparable numeric fields.
- Never treat missing values as zero or as a winner.
- Allow replacing or removing a selected car without leaving the screen.

### F-05 Dealer directory

- Filter by brand and city.
- Show name, address, phone, website, supported brands and verification date.
- Provide click-to-call and external website actions.
- Initial data scope is Hanoi, Ho Chi Minh City and Da Nang.

### F-06 Grounded chatbot

- Support discovery, recommendation, comparison, price, warranty, dealer and data-availability intents.
- Extract structured constraints such as budget, seats, brand, body type and city.
- Retrieve structured records and relevant document chunks before generating an answer.
- Return a concise answer, vehicle/dealer cards and source citations.
- State uncertainty when the database cannot support the answer.
- Reject instructions embedded inside retrieved source content.

### F-07 Source provenance

- Allow a user to inspect source title, URL, type, supported claims and checked date.
- Link back to every car, warranty or dealer record that references the source.
- Open external URLs in a new tab with safe link attributes.

### F-08 Conversation persistence

- Create a conversation session on the first user message.
- Save user and assistant messages with timestamps and retrieved references.
- Allow rename, resume and delete.
- Initial anonymous storage may use a generated browser identifier; authenticated ownership is required later.

### F-09 Data administration

- CRUD for cars, dealers, warranties and sources.
- Validate foreign keys and required fields before submission.
- Preserve a change log for price, status and source changes.
- Allow CSV import with preview, validation report and explicit confirmation.
- Trigger embedding refresh only for affected records.

### F-10 RAG operations

- Generate documents for overview, specifications, price, warranty and dealer data.
- Track chunking and embedding state per document.
- Support full-text, vector and hybrid retrieval test modes.
- Show retrieval score, filters, source and final context order.
- Re-index one record or all stale records.

### F-11 Image search

- Accept JPEG, PNG or WebP up to 10 MB.
- Use an image embedding model to retrieve visually similar vehicles.
- Treat results as similarity suggestions, not certain model identification.

### F-12 Authentication

- Public catalogue, comparison, dealers and chat require no login for MVP.
- Admin and RAG configuration require an administrator role.
- Mutation endpoints must reject unauthenticated and unauthorized requests.

## 7. Required API surface

### Existing endpoints

- `GET /api/health`
- `GET /api/cars`
- `GET /api/cars/{carId}`
- `POST /api/search/text`
- `POST /api/chat`

### Endpoints to add

- `GET /api/cars/filters`
- `GET /api/cars/compare?ids={id1,id2,id3}`
- `GET /api/dealers`
- `GET /api/dealers/{dealerId}`
- `GET /api/warranties`
- `GET /api/sources/{sourceId}`
- `POST /api/chat/sessions`
- `GET /api/chat/sessions/{sessionId}`
- `POST /api/chat/sessions/{sessionId}/messages`
- `DELETE /api/chat/sessions/{sessionId}`
- Admin CRUD endpoints under `/api/admin/*`
- RAG operations under `/api/admin/rag/*`

All list endpoints must use a consistent response envelope:

```json
{
  "items": [],
  "page": 1,
  "pageSize": 20,
  "totalItems": 0,
  "totalPages": 0
}
```

All API errors must use Problem Details and include a stable error code.

## 8. Non-functional requirements

- Catalogue API p95 response time: under 500 ms on the local MVP dataset.
- Chat retrieval excluding LLM generation: under 1 second.
- UI must support desktop widths from 1024 px and mobile widths from 360 px.
- All interactive controls must be keyboard accessible.
- Text and controls must meet WCAG AA contrast targets.
- Images require meaningful alt text and lazy loading outside the initial viewport.
- Public mutation-like endpoints must be rate-limited.
- Logs must not contain database passwords, uploaded image bytes or complete user conversations by default.
- Database migrations and seeds must be repeatable without duplicate records.

## 9. Analytics events

- `home_search_submitted`
- `catalog_filter_changed`
- `car_opened`
- `compare_car_added`
- `compare_completed`
- `dealer_contact_clicked`
- `chat_question_submitted`
- `chat_source_opened`
- `chat_recommendation_opened`
- `admin_record_updated`
- `rag_reindex_started`

Analytics payloads must not include free-form chat content unless the user has explicitly consented.

## 10. Release plan

### Release A — Browseable MVP

Home, catalogue, car detail, dealers, comparison and source viewer.

### Release B — Grounded assistant

Hybrid retrieval, LLM generation, citations and saved conversations.

### Release C — Operations

Admin authentication, data management, import workflow and RAG configuration.

### Release D — Multimodal

Image embeddings, similarity retrieval and image-assisted chat.

## 11. Definition of done

A feature is complete when:

1. The acceptance criteria in this document and its screen specification pass.
2. Loading, empty, error and partial-data states are implemented.
3. Backend validation and authorization are covered.
4. Unit or integration tests cover the main success and failure paths.
5. The feature works at 360 px, 768 px and 1280 px viewport widths.
6. No UI value contradicts its referenced database record.

## 12. Screen specifications

- `feature_spec_home.md`
- `feature_spec_car_catalog.md`
- `feature_spec_car_detail.md`
- `feature_spec_car_compare.md`
- `feature_spec_dealers.md`
- `feature_spec_chatbot.md`
- `feature_spec_source_detail.md`
- `feature_spec_data_admin.md`
- `feature_spec_rag_settings.md`
