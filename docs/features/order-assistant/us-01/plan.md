# Plan — US-01: Nhiều nội dung trong một câu hỏi

Ngày: 2026-10-04. Trạng thái: hoàn tất local. Bằng chứng: [verification.md](verification.md).
Spec: [US-01](../us-01-multi-intent.md).

## Hiện trạng

OrderAssistant dựng một câu trả lời từ một intent. Context lưu LastBusinessIntent/PendingIntent đơn; Bedrock trả một intent. UI chỉ render content. Session dùng JSONB, có requestId/replay và version lock trong PostgreSQL.

## Hợp đồng và quyết định

- Thêm Sections tùy chọn vào ChatMessage, giữ Content và metadata cũ.
- Context thêm LastBusinessIntents/PendingIntents; giữ trường đơn cho phiên cũ và test regression.
- ContextDecision thêm Intents tùy chọn, parser chấp nhận hợp đồng cũ và hợp đồng mới có kiểm tra enum/giới hạn. Provider mới trả danh sách intent.
- Rule resolver thu thập chủ đề theo thứ tự xuất hiện; keyword mã đơn không tự tạo status khi câu đã có chủ đề khác.
- Một lượt chỉ một đơn; nhiều mã đơn khác nhau hỏi lại và lưu đủ chủ đề đang chờ.
- Multi-intent hoạt động cả khi ContextEnabled=false; vẫn lưu chủ đề/pending tối thiểu để hoàn tất clarification. Previous/history/summary vẫn theo cờ context.
- Mỗi section xử lý lỗi nguồn độc lập. Chỉ kết quả thành công cập nhật danh sách chủ đề; cancellation của request phải được truyền lên.
- Không thêm migration: các trường bổ sung nằm trong JSON hiện có.

## Các bước

- [x] 1. Hợp đồng sections, multi-intent rule và context tương thích dữ liệu cũ.
- [x] 2. Bedrock parser/prompt/fallback nhiều intent và context builder.
- [x] 3. Orchestration nhiều section, clarification, ownership và replay.
- [x] 4. UI sections và giữ draft khi version conflict.
- [x] 5. Test AC1–AC7: thứ tự, trùng intent, tiếp nối/đổi đơn, thiếu/nhiều mã đơn, nguồn lỗi, model lỗi, phiên cũ, quyền và replay.
- [x] 6. Chạy test C#, integration PostgreSQL, HTTP và UI, build frontend; ghi verification.md và cập nhật trạng thái spec.

## Nghiệm thu

Đầu ra ba chủ đề đủ ba sections; chọn đơn sau clarification giữ đủ chủ đề; một nguồn lỗi không mất dữ liệu khác; không lộ đơn người khác; replay không thêm lượt. Regression assistant/context phải đạt. Bất kỳ kiểm tra chưa chạy được phải được ghi rõ trong verification.md.

US-02 chỉ bắt đầu sau khi US-01 được nghiệm thu; tạo plan riêng trước khi sửa code US-02.
