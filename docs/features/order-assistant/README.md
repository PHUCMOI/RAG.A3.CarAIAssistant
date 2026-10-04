# Order Assistant — đặc tả và lộ trình

Ngày cập nhật: 2026-10-04.

Thư mục này tập trung tài liệu cho trợ lý đơn hàng C# tại `/account/assistant`.
US-01 đã hoàn tất local: [plan](us-01/plan.md), [nghiệm thu](us-01/verification.md). US-02 đã hoàn tất local: [plan](us-02/plan.md), [nghiệm thu](us-02/verification.md). US-03 đã hoàn tất local: [plan](us-03/plan.md), [nghiệm thu](us-03/verification.md). US-04 đã hoàn tất local: [plan](us-04/plan.md), [nghiệm thu](us-04/verification.md). US-05 đã hoàn tất local: [plan](us-05/plan.md), [nghiệm thu](us-05/verification.md). US-06 đã hoàn tất local: [plan](us-06/plan.md), [nghiệm thu](us-06/verification.md). Hoàn thành và nghiệm thu từng US trước khi chuyển sang US tiếp theo; tạo plan riêng trước khi sửa code mỗi US.

| Thứ tự | Spec | Kết quả bàn giao |
|---|---|---|
| 1 | [US-01: Nhiều nội dung trong một câu hỏi](us-01-multi-intent.md) | Một lượt trả lời nhiều nội dung của cùng một đơn |
| 2 | [US-02: Tiến độ và bước tiếp theo](us-02-progress-next-steps.md) | Timeline có căn cứ và hướng dẫn việc cần làm |
| 3 | [US-03: Tạo yêu cầu trong chat](us-03-change-requests.md) | Khách xác nhận trước khi gửi yêu cầu cho admin |
| 4 | [US-04: Thanh toán và hồ sơ](us-04-payments-documents.md) | Chi tiết giao dịch và checklist hồ sơ |
| 5 | [US-05: Chuyển hỗ trợ cho nhân viên](us-05-human-handoff.md) | Phiếu hỗ trợ có ngữ cảnh và phản hồi |
| 6 | [US-06: Thông báo và nhắc việc](us-06-proactive-notifications.md) | Thông báo theo sự kiện, nhắc lịch có thể cập nhật |

## Tài liệu nền hiện có

- [Ngữ cảnh hội thoại](context/spec.md), [kế hoạch](context/plan.md), [nghiệm thu](context/verification.md).
- [Cấu hình Bedrock](bedrock-csharp.md).
- [Module nghiệp vụ C#](../../csharp_owner_features.md).
- [Customer account và hành trình mua xe](../../feature_spec_customer_account.md).

## Quy tắc chung

- Backend C# chịu trách nhiệm nghiệp vụ; dữ liệu catalogue/bảo hành lấy qua API Python.
- Kiểm tra quyền theo user đăng nhập ở mỗi lần đọc/ghi; không tin order ID do model hoặc client cung cấp.
- Model chỉ đề xuất intent/tham chiếu/nội dung nháp; backend xác thực và thực hiện tool trong allowlist.
- Trạng thái, số tiền và lịch phải lấy lại từ backend mỗi lượt. Lịch sử hoặc summary không phải dữ liệu nghiệp vụ hiện tại.
- Giữ tương thích session/messages hiện có. Thay đổi hợp đồng là bổ sung tùy chọn, có fallback cho phiên cũ.
- Giữ requestId, replay và kiểm soát version. Mọi thao tác tạo phải có idempotency ở tầng nghiệp vụ.
- Dữ liệu thiếu/lỗi phải được trình bày rõ; không suy đoán lịch, chứng từ, nguyên nhân hoặc thời gian xử lý.
- Giao diện tiếng Việt; thời gian hiển thị theo Asia/Ho_Chi_Minh, thời điểm lưu có timezone.

## Cách thực hiện tuần tự

Mỗi US thực hiện theo thứ tự: kiểm tra hiện trạng → chốt hợp đồng API/dữ liệu → backend và migration nếu cần → UI → kiểm thử nghiệp vụ/quyền/replay → cập nhật bằng chứng nghiệm thu.

Chỉ đánh dấu hoàn thành khi đạt toàn bộ acceptance criteria của spec. Test và build cần chạy theo phạm vi thay đổi; migration phải kiểm tra với PostgreSQL thực nếu thay đổi schema. Các tên tool/entity trong spec là thiết kế đề xuất, cần đối chiếu model hiện có trước khi thêm mới.
