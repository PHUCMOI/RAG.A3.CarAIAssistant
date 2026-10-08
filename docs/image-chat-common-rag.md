# Chat ảnh dùng RAG chung

CLIP và FAISS tiếp tục tạo embedding ảnh, so khớp vector và trả các xe gần giống cùng điểm tương đồng thực tế.

Đã bỏ nhánh mock trong `image_service/app/core/rag_adapter.py`: không còn import `src.rag`, chọn câu trả lời theo từ khóa, mặc định bảo hành 36 tháng/100.000 km, điểm context 0,95 hoặc lấy xe đầu catalogue khi không tìm thấy.

Sau nhận diện chắc chắn, service gửi câu hỏi và ID xe gần nhất sang `POST /api/chat` của Python RAG. Câu trả lời, ý định và nguồn lấy từ kết quả RAG; template dựng câu từ dữ liệu và thông báo nghiệp vụ vẫn được giữ. Chat dùng duy nhất top 1 (cả khi điểm nhận diện thấp, kèm cảnh báo); ảnh không có kết quả yêu cầu ảnh rõ hơn hoặc tên xe; khi RAG lỗi chỉ thông báo nhận diện đã có, không tự tạo giá/bảo hành.

Cấu hình: `IMAGE_SERVICE_RAG_API_URL` (local mặc định `http://localhost:5080`, Docker `http://api:8080`) và `IMAGE_SERVICE_RAG_TIMEOUT_SECONDS` (90 giây).

Đã kiểm tra 17 test image service, gồm chuyển đúng câu hỏi/ID xe sang RAG, không tự chọn xe khi câu hỏi không xác định và không tạo dữ kiện khi RAG lỗi. Test Edge với ảnh Honda CR-V thật xác nhận nhận diện và câu hỏi bảo hành đi qua API chung. Nếu catalogue trả 36 tháng/100.000 km, đó là dữ liệu catalogue chứ không còn giá trị mặc định của adapter.

## Truy vấn bằng top 1

Chat chỉ trả một `identified_cars` và truy vấn `carIds` của xe đó. RAG sử dụng ID đã có để xác định chủ thể trước khi kiểm tra câu hỏi, nên “đây là xe gì? và bảo hành như thế nào” không cần nhắc lại tên model. ID không có trong catalogue trả `no_data`, không thay thế bằng xe khác. Luồng tìm ảnh riêng vẫn có thể trả nhiều ứng viên.

Test thực tế ảnh Ford Edge nhận đúng `car_29_5`, chỉ hiển thị một xe và tra được bảo hành từ catalogue. 124 test backend Python đạt (1 test bỏ qua), 4 test adapter ảnh đạt.
