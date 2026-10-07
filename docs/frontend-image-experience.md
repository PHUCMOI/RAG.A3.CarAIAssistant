# Tối ưu trải nghiệm tìm xe bằng ảnh và chat

Ngày kiểm tra: 07/10/2026. Phạm vi: frontend, ưu tiên desktop 1280px/1440px.

## Chức năng

- `/search-image`: bố cục hai cột; ảnh, tùy chọn và thao tác ở bên trái; kết quả bên phải. Nội dung tiếng Việt, tập trung vào thao tác của người dùng.
- Tải ảnh bằng nút có thể dùng bàn phím hoặc kéo thả; xem trước ảnh đầy đủ, đổi/xóa ảnh, chọn 3/5/8 kết quả. Chấp nhận JPG/PNG/WebP, không hiển thị giới hạn dung lượng chưa được kiểm chứng.
- Loading, lỗi/thử lại và trạng thái không có kết quả. Giữ ảnh khi lỗi; thử lại ảnh mẫu đúng mẫu đã chọn. Khóa chọn/xóa ảnh và gửi trùng khi request chạy; bỏ qua phản hồi khi trang unmount. Thu hồi URL xem trước khi đổi ảnh/rời trang.
- Thẻ kết quả có mức tương đồng, liên kết chi tiết và chat chứa `car`/`carName`. Không coi độ tương đồng là xác suất nhận diện đúng; chỉ hiển thị thời gian xử lý khi API cung cấp.
- `/chat`: nút ảnh nhỏ cạnh ô nhập, thẻ ảnh đính kèm với tên và nút bỏ ảnh, lỗi định dạng hiển thị tại vùng nhập. Giữ retry đúng ảnh/câu hỏi; không xóa ảnh mới đang soạn khi thử lại ảnh cũ.
- Header và màn hình chào của chat có liên kết tới tìm kiếm ảnh cho guest/customer. Gửi ảnh trực tiếp tiếp tục thuộc chat guest như API tích hợp trước; luồng đơn hàng customer không thay đổi.
- CSS trang ảnh tách riêng, không áp dụng tên class chung ra ngoài trang. Màn hình chào chat gọn hơn để vừa vùng hội thoại khi đính kèm ảnh.

## Kiểm tra

- Build frontend đạt.
- Vitest: 54 test / 15 file đạt.
- Playwright (API mock): 12 lượt test ở 1280px và 1440px đạt, gồm luồng tìm kiếm, đổi/xóa ảnh, giữ ảnh/thử lại, lỗi ảnh mẫu, khóa thao tác, liên kết chat đúng tên xe, lỗi định dạng và retry gửi ảnh không trùng.
- Đã xem ảnh chụp trang ảnh trống/kết quả và chat đính kèm ở desktop; không tràn ngang. Test kiểm tra focus tiêu đề kết quả và nhãn điều khiển.
- Kiểm thử hồi quy: 16 test trình duyệt ở 1440px đạt, gồm chat guest/customer, cache, lỗi dịch vụ tài khoản, header và các trang public/account.

## Giới hạn

- Dịch vụ nhận diện ảnh chưa chạy local. Chưa nghiệm thu kết quả nhận diện, tải ảnh mẫu hoặc chất lượng câu trả lời với BE thật; test mock không thay thế kiểm tra tích hợp.
- Kết nối công cụ Browser lỗi môi trường; sử dụng bộ Playwright của dự án và xem screenshot để kiểm tra desktop.
- Mobile chưa thuộc phạm vi nghiệm thu đợt này. Không đổi endpoint, payload backend, CSRF hoặc luồng xử lý đơn hàng.
