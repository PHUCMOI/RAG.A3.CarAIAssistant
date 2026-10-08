# Câu trả lời tự nhiên qua Bedrock

Các câu trả lời chat thành công đều có `generationMode: bedrock-natural` (image API dùng `generation_mode`). Bước viết câu trả lời luôn dùng Bedrock, độc lập với `RAG_ENABLED`, `LLM_PROVIDER` và tùy chọn phân loại ngữ cảnh của orders-api.

- Xe: `/api/chat` truy vấn dữ liệu, rồi gửi kết quả, description, thông số và evidence cho Bedrock.
- Ảnh: CLIP chọn top 1; tên xe, độ tương đồng và cờ chưa chắc chắn được đưa vào cùng lần viết câu trả lời. Không ghép câu nhận diện ngoài nội dung AI sau đó.
- Đơn hàng: chỉ truy vấn dữ liệu thuộc tài khoản đã xác thực, giải quyết tham chiếu trong context, rồi gọi `/api/chat/compose`. Không gửi toàn bộ danh sách đơn hoặc lịch sử cá nhân ngoài kết quả công cụ cần trả lời.
- Hỏi lại, thiếu dữ liệu, điều hướng, bản nháp và khách chưa đăng nhập: cũng đi qua bước viết bằng Bedrock. Bản nháp vẫn cần thao tác xác nhận riêng; model không thực thi hành động.

Frontend render Markdown an toàn và giữ nội dung AI, không chèn lại phần giới thiệu template. Dữ liệu chi tiết đơn hàng nằm trong mục mở rộng để kiểm tra. Hội thoại lưu nội dung AI cùng generationMode; câu trả lời cũ vẫn hiển thị được.

Prompt yêu cầu giữ dữ kiện, quan hệ xe/đơn, điều kiện nguồn và không thêm kiến thức riêng. Backend từ chối URL/HTML và giá trị số ngoài dữ liệu; thử sửa một lần nếu đầu ra không hợp lệ. Kiểm tra này không chứng minh toàn bộ ý nghĩa câu văn là đúng. Quyền truy cập, chọn đơn và hành động luôn do backend quyết định. Nếu Bedrock lỗi, trả lỗi để người dùng thử lại; không giả lập một câu trả lời template thành công.

Endpoint compose nhận tối đa 60.000 ký tự dữ liệu. Nó chỉ diễn đạt dữ liệu đầu vào, không có quyền truy vấn đơn hàng hoặc thực thi công cụ.

## Hiểu câu hỏi trước khi chọn công cụ

Chat khách và chat tài khoản gọi `/api/chat/understand` qua Bedrock trước khi chọn catalogue hoặc đơn hàng. Đầu vào gồm câu gốc, ba câu hỏi gần nhất, câu trả lời gần nhất và chủ đề hiện tại. Model sửa lỗi chính tả, thiếu dấu và viết tắt khi đủ rõ; câu mơ hồ đi vào luồng hỏi lại. Không tự sửa mã đơn hoặc thêm số tiền/ngày. Backend kiểm tra các tham chiếu số và mã đơn trong câu đã diễn đạt; bản gốc vẫn được lưu trong lịch sử tài khoản. Việc chọn đơn và quyền truy cập vẫn do công cụ xác thực quyết định. Khả năng hiểu ngôn ngữ là xác suất, không bảo đảm mọi lỗi gõ đều được giải quyết chính xác.
