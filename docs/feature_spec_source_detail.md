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


## Implementation — 2026-10-02

Đã triển khai metadata, link ngoài HTTP(S) an toàn, xử lý loading/404/lỗi và retry.
API detail bổ sung `references` gồm `cars`, `prices`, `warranties`, `dealers`,
`documents`; mỗi item có `recordId`, `label`, `carId` nullable. Nhóm rỗng không
hiển thị bảng. Xe/giá/bảo hành theo xe dẫn đến trang xe; đại lý dẫn đến danh sách
đại lý, còn bảo hành theo hãng và tài liệu không có detail route nên hiển thị tên.
Không fetch nội dung trang nguồn; nguồn dataset không có nút mở URL.

Validation: 21 backend tests pass (mock DB), frontend build pass, browser checks
metadata, dataset link suppression, 404 và retry 503. Preview desktop/mobile dùng
fixture local, không phải bằng chứng PostgreSQL integration. Docker daemon chưa
chạy nên truy vấn reference SQL chưa được kiểm chứng trên database thực.
`source-detail-preview.png` là screenshot với fixture kiểm thử.

Phần này chỉ đọc metadata/tham chiếu nguồn; không triển khai RAG retrieval,
embedding hoặc generation. Phần RAG do hai dev khác phụ trách.
