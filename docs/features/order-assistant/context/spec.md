# Spec: Ngữ cảnh hội thoại cho trợ lý customer C#

Ngày: 2026-10-03. Phiên bản: 1.0. Trạng thái: đã triển khai và nghiệm thu local ngày 2026-10-04.

## 1. User story và mục tiêu

Là customer, tôi muốn AI ghi nhớ nội dung và đơn hàng đang trao đổi trong cùng
hội thoại, để hỏi tiếp tự nhiên mà không nhắc lại thông tin và nhận câu trả lời
liên tục, rõ ràng, nhất quán.

Phạm vi: trợ lý `/account/assistant`, backend ASP.NET Core, PostgreSQL schema
`orders_service`, AWS Bedrock Haiku 4.5. Không mở rộng chat tư vấn xe Python/RAG.
Không cho AI tự sửa đơn, thu tiền, hoàn tiền hoặc xác nhận bàn giao.

## 2. Hiện trạng và thay đổi

Trước feature, `OrderAssistant` lưu các lượt vào `ChatSessionRecord.Payload`, có
`SelectedOrderId`, version, ownership và replay theo requestId. Bedrock chỉ nhận
câu hỏi hiện tại và trả nhãn intent; C# truy vấn dữ liệu và tạo câu trả lời theo mẫu.

Feature bổ sung lịch sử có giới hạn, bộ nhớ chủ đề/đơn trước và tóm tắt hội thoại
để Haiku hiểu tham chiếu. Câu trả lời nghiệp vụ tiếp tục được dựng từ dữ liệu
đã kiểm tra quyền. Việc cho LLM viết toàn bộ câu trả lời là feature riêng.

## 3. Hành trình nghiệm thu

| Câu hỏi | Hành vi |
|---|---|
| Đơn AW-DEMO-0001 đang đến đâu? | Tra trạng thái, chọn đơn 0001, nhớ chủ đề status. |
| Còn phải trả bao nhiêu? | Tra payment của 0001 từ DB mới nhất. |
| Khi nào nhận xe? | Tra delivery của 0001, nhớ chủ đề delivery. |
| Còn đơn AW-DEMO-0007 thì sao? | Kiểm tra quyền, chọn 0007, giữ chủ đề delivery. |
| Đơn trước còn nợ bao nhiêu? | Tra payment của 0001 nếu đơn trước xác định được. |
| Mở trang đổi mật khẩu | Mở route allowlist, không tự xóa đơn đang chọn. |
| Còn đơn đó? khi có nhiều tham chiếu | Hỏi rõ đơn và/hoặc chủ đề, không đoán. |

Chỉ dùng mã/ID demo thuộc customer đang test. Bảng mô tả hành vi, không giả định
mọi mã demo luôn tồn tại hoặc thuộc cùng user.

## 4. Context và hợp đồng LLM

Mỗi lượt gồm: hướng dẫn hệ thống; bộ nhớ có cấu trúc; tóm tắt lượt cũ; tối đa
8 lượt gần nhất; câu hỏi mới. Một lượt gồm tin nhắn user và phản hồi assistant.
Nội dung lịch sử/tóm tắt luôn là dữ liệu không đáng tin cậy, không phải chỉ dẫn.

Bộ nhớ do C# quản lý: CurrentOrderId, PreviousOrderId, LastBusinessIntent,
PendingClarification và thời điểm cập nhật. ID phải được kiểm tra ownership
trước khi đưa thông tin nhận diện đơn vào context. Không gửi password, hash,
credentials, profile đầy đủ hoặc ghi chú nội bộ cho LLM.

LLM trả JSON có schema:

```json
{
  "intent": "payment",
  "orderReference": "current",
  "needsClarification": false,
  "clarificationKind": null
}
```

`intent` dùng allowlist hiện có. `orderReference`: explicit/current/previous/none.
`clarificationKind`: order/topic/order_and_topic hoặc null. C# kiểm tra schema,
enum và điều kiện nghiệp vụ; model không được cung cấp SQL, URL hoặc ID tùy ý.
Mã đơn explicit lấy từ câu hỏi bằng parser C#; OrderId lấy từ UI request.

Ưu tiên mã explicit hoặc OrderId được chọn rõ ràng, sau đó previous/current theo
tham chiếu. Mã và OrderId mâu thuẫn, nhiều mã, hoặc tham chiếu chưa rõ phải hỏi
lại; không tự chuyển sang đơn cũ khi lookup đơn explicit thất bại.
Chủ đề explicit ưu tiên hơn LastBusinessIntent. Điều hướng/help/clarification
không ghi đè chủ đề nghiệp vụ đã xác minh. Đơn trước là đơn khác gần nhất đã
tra cứu thành công; hỏi lại cùng đơn không làm mất PreviousOrderId.

## 5. Quản lý lịch sử dài

Mặc định giới hạn input context 6.000 token, output phân loại 200 token;
các giá trị cấu hình được và phải kiểm tra với tokenizer/usage của provider.
Nếu chưa có tokenizer tương ứng, dùng ước lượng bảo thủ và giới hạn ký tự phụ;
không coi số ký tự là số token chính xác.

Khi vượt ngân sách, tóm tắt các lượt cũ đã commit, giữ nguyên cửa sổ gần nhất và
câu hỏi hiện tại. Summary tối đa 800 token, gồm chủ đề, tham chiếu hội thoại và
câu hỏi đang cần làm rõ; không lưu số dư/trạng thái như nguồn dữ liệu hiện tại.
Summary không được ghi đè bộ nhớ có cấu trúc đã được C# xác minh.

Summary có CoveredThroughVersion và version riêng để biết phạm vi đã tóm tắt.
Nếu tóm tắt lỗi, rút lịch sử cũ theo ngân sách và dùng bộ nhớ có cấu trúc; không
xóa lịch sử hiển thị hoặc giả vờ summary đã cập nhật. Giữ giới hạn 100 lượt/session
hiện tại; summary không đồng nghĩa cho phép hội thoại vô hạn.

## 6. Dữ liệu và tương thích

Giữ API tạo/lấy/gửi hội thoại hiện có và ChatInput hiện có. Không thay định dạng
list ChatTurn trong Payload bằng object mới. Bổ sung trường context/summary riêng
trên chat_sessions, với schema version để nâng cấp tương thích.

Session cũ có context rỗng: dùng SelectedOrderId nếu ownership còn hợp lệ; suy
ra chủ đề từ metadata tool của lượt thành công gần nhất. Nếu không đủ căn cứ,
hỏi lại. Không bắt buộc backfill bằng lời gọi LLM hàng loạt.

Theo phạm vi C# của user, dùng UI hiện có để hiển thị clarification và đơn nếu
cần. Các link vẫn là route do C# ánh xạ. Mở lại cùng session phục hồi context;
session mới, user khác và logout không dùng chung context trên UI.

## 7. Tính đúng đắn và bảo mật

- Mỗi lần trả lời trạng thái/tiền/bàn giao phải đọc lại DB theo user hiện tại.
- Không tìm đơn ngoài ownership rồi mới lọc; đơn ngoài quyền trả hành vi không
  tiết lộ sự tồn tại, không đưa vào context, summary hoặc câu trả lời.
- Chỉ commit lượt chat, SelectedOrderId, context và summary khi cùng version
  còn hợp lệ, trong transaction/khóa session hiện có.
- Lời gọi Bedrock và Python thực hiện ngoài transaction DB.
- Replay cùng requestId/body trả kết quả đã lưu, không gọi LLM lại; body khác
  hoặc version cũ trả 409. Race chỉ một lượt được commit; không hứa tránh mọi
  chi phí inference trùng của request đồng thời.
- Provider lỗi hoặc output sai schema dùng rule và context đã xác minh;
  nếu rule không giải được tham chiếu thì hỏi lại, không đoán đơn.
- Request bị hủy không lưu lượt chưa hoàn tất. Không log prompt/secret/dữ liệu
  cá nhân; log request ID, intent, context version, usage và trạng thái fallback.

## 8. Tiêu chí hoàn thành

1. Luồng ví dụ ở mục 3 chạy bằng Bedrock thật, có bằng chứng request ID.
2. Tiếp nối và chuyển đơn/chủ đề đúng; trường hợp thiếu ngữ cảnh hỏi lại.
3. Đơn cập nhật giữa các lượt thì câu tiếp theo dùng dữ liệu mới, kể cả khi
   lịch sử/summary chứa thông tin cũ.
4. User/session cách ly; prompt injection không bỏ qua ownership/allowlist.
5. Hội thoại dài giữ tham chiếu sau tóm tắt; lỗi summary có fallback rõ ràng.
6. Ownership, CSRF, replay, optimistic conflict và race vẫn pass.
7. Session cũ hoạt động, session mới rỗng, reload phục hồi context.
8. Build, test phù hợp và smoke DB thật pass; tài liệu chạy được cập nhật.
