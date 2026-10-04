# Plan: Triển khai ngữ cảnh hội thoại C#/Bedrock

Ngày: 2026-10-03. Trạng thái: hoàn tất triển khai và nghiệm thu local ngày 2026-10-04.
Yêu cầu nghiệm thu: [spec.md](spec.md).

## 1. Thiết kế và migration

- [x] Thêm DTO context, enum intent/reference/clarification, schema version.
- [x] Bổ sung context JSONB, summary và CoveredThroughVersion trên chat_sessions;
  chọn lưu summary chung trong context JSONB hoặc cột riêng khi thiết kế migration.
- [x] Giữ Payload list ChatTurn và SelectedOrderId tương thích.
- [x] Định nghĩa khởi tạo session cũ và bộ nhớ từ tool metadata; không tự gọi
  Bedrock khi chạy migration.

Đầu ra: migration chỉ tác động schema orders_service, test session cũ/mới,
quy tắc serialization/version được chốt.

## 2. Bộ dựng context và ngân sách

- [x] Tạo ConversationContextBuilder ở Application/Infrastructure phù hợp.
- [x] Lấy 8 lượt gần nhất, bộ nhớ có cấu trúc và summary đã commit.
- [x] Xác minh ownership các đơn được tham chiếu trước khi gửi thông tin cho LLM.
- [x] Giới hạn token/ước lượng bảo thủ; giữ câu hỏi mới và system prompt.
- [x] Thêm cấu hình history window, input/output budget và summary budget.

Đầu ra: context có thứ tự cố định, không trộn session/user, không gửi dữ liệu
nhạy cảm; test ngân sách với tiếng Việt và nội dung dài.

## 3. Nhận diện intent và tham chiếu bằng Bedrock

- [x] Mở rộng BedrockAssistant.Resolve thành kết quả có cấu trúc thay cho string.
- [x] Gửi lịch sử và bộ nhớ bằng Converse; phân tách instructions và dữ liệu.
- [x] Parse JSON theo schema, kiểm tra enum/field, fallback khi sai output.
- [x] Chốt prompt cho câu tiếp nối, chuyển đơn, chủ đề và clarification.
- [x] Giữ timeout, cancellation, default credential chain và inference profile
  us.anthropic.claude-haiku-4-5-20251001-v1:0 tại us-east-1.

Đầu ra: test mock provider cho JSON hợp lệ/sai, service errors, timeout,
cancellation và prompt injection; không test live AWS trong unit suite.

## 4. Điều phối tra cứu và bộ nhớ

- [x] Tách resolver tham chiếu khỏi logic truy vấn trong OrderAssistant.Send.
- [x] Xử lý explicit/current/previous; conflict mã và OrderId; nhiều mã.
- [x] Duy trì CurrentOrderId, PreviousOrderId và LastBusinessIntent theo spec.
- [x] Dựng câu hỏi clarification bằng template và lưu PendingClarification.
- [x] Đọc DB mới nhất theo ownership, dùng các query nghiệp vụ hiện có.
- [x] Commit messages/context/summary cùng version trong transaction hiện có.
- [x] Bảo toàn replay, 409, rollback và không gọi network khi giữ khóa DB.

Đầu ra: luồng hỏi nối tiếp hoạt động, không dùng dữ liệu lịch sử để tính tiền;
test chuyển đơn thất bại không rơi về trả lời đơn cũ.

## 5. Tóm tắt lịch sử dài

- [x] Thêm dịch vụ summary có prompt riêng, chỉ tóm tắt lượt đã commit.
- [x] Tạo summary khi vượt ngân sách; cập nhật mốc version cùng lượt mới.
- [x] Bảo vệ summary khỏi kết quả stale khi race; không commit kết quả thua.
- [x] Khi summary lỗi, cắt lịch sử cũ và giữ bộ nhớ xác minh/cửa sổ gần nhất.
- [x] Không rút ngắn lịch sử hiển thị hoặc tăng giới hạn 100 lượt ngầm.

Đầu ra: hội thoại dài vẫn hiểu đơn trước/chủ đề, summary không thành nguồn dữ
liệu giao dịch; đo token usage thực tế và số lời gọi bổ sung.

## 6. UI và quan sát vận hành

- [x] Hiển thị ngữ cảnh đơn hiện tại và câu clarification dễ hiểu nếu cần.
- [x] Session mới/logout xóa context UI; reload/mở session cũ phục hồi từ server.
- [x] Giữ draft khi conflict/error; tải lại không gửi lặp mutation.
- [x] Log request ID, latency, usage, context version và fallback, không prompt.
- [x] Cập nhật docs/bedrock-csharp.md và hợp đồng assistant hiện có.

## 7. Kiểm thử nghiệm thu

| Nhóm | Ca bắt buộc |
|---|---|
| Ngữ cảnh | Hỏi status → payment → delivery; đổi đơn, hỏi đơn trước; đổi chủ đề; mơ hồ hỏi lại. |
| Dữ liệu | Admin đổi trạng thái/thanh toán giữa các lượt; câu sau đọc dữ liệu mới. |
| Bảo mật | Mã/ID customer khác, session khác, injection trong lịch sử và summary. |
| Độ dài | Vượt context budget, summary success/failure, tham chiếu sau tóm tắt. |
| Đồng thời | Replay, body conflict, version cũ, hai request race, rollback. |
| Tương thích | Session trước migration; reload; session mới; logout/login user khác. |
| Provider | Output sai, thiếu quyền, throttle, timeout, cancellation, fallback. |

Chạy unit/integration cần thiết, build frontend, smoke assistant trên DB thật.
Smoke Bedrock có opt-in rõ ràng, dùng credentials ngoài repo, ít lượt và dữ liệu
demo; ghi request ID để chứng minh không fallback. Test UI luồng clarification,
chuyển session và khôi phục; có thể thực hiện manual khi không có browser runner.

## 8. Thứ tự rollout

1. Migration tương thích và context builder; đặt feature flag mặc định tắt.
2. Bật context intent + resolver + clarification ở local, chưa summary.
3. Bổ sung summary/budget và kiểm tra regression.
4. Build/test pass, bật feature trên Docker local và smoke Bedrock thật.
5. Ghi kết quả nghiệm thu; chỉ đánh dấu complete khi các tiêu chí spec pass.

Fallback rollout: tắt feature flag context để dùng luồng hiện tại; giữ cột bổ
sung và lịch sử đã lưu, không rollback bằng xóa dữ liệu. Không deploy production
trong phạm vi tạo spec/plan này.

Phạm vi cuối: chỉ sửa code C#; các mục UI được nghiệm thu bằng giao diện có sẵn, HTTP smoke và kiểm tra source, không thêm code frontend. Bằng chứng và giới hạn: [verification.md](verification.md).
