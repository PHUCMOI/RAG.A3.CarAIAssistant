# Chi tiết xe

- Bố cục hero gồm placeholder ảnh và thông tin xe; giá tham khảo, ngày cập nhật và nguồn giá nằm trong khối riêng. Không giả lập gallery khi chưa có URL ảnh.
- Hai thao tác chính: yêu cầu mua xe, hỏi trợ lý; các thao tác lưu yêu thích, so sánh và tìm đại lý ở hàng phụ.
- So sánh dùng chung trạng thái với catalogue, giữ lựa chọn trước, giới hạn 3 xe, có phản hồi và liên kết tới bảng so sánh.
- Dịch nhãn nhiên liệu, hộp số, kiểu xe và trạng thái thị trường. Mô tả và điều kiện bảo hành giữ nguyên nội dung API (dữ liệu seed hiện có tiếng Anh).
- Bảng thông số dùng dl/dt/dd; thiếu dữ liệu có nhãn rõ ràng. Có liên kết tới thông số, bảo hành, đại lý và nguồn thông tin xe.
- Giữ nguồn bảo hành từ API, nguồn giá riêng và retry độc lập của các khối liên quan. Thẻ đại lý được hiển thị theo bố cục một cột trong mỗi thẻ, tối đa 3 đại lý hỗ trợ hãng.

## Kiểm tra

- Build đạt, 48 test FE đạt; bổ sung giữ lựa chọn so sánh và giới hạn 3 xe.
- Hai test Edge desktop đạt: catalogue/compare/detail, nhãn tiếng Việt, giá thiếu, bảo hành và liên kết chat.
- BE local Toyota Hilux: 8 thông số, 3 đại lý, không lỗi JavaScript hoặc tràn ngang ở 1440px. Đã xem ảnh toàn trang và sửa xung đột CSS cũ ở bảng thông số/thẻ đại lý.
- Chưa nghiệm thu mobile; chưa kiểm tra thao tác tạo yêu cầu hoặc ghi xe yêu thích với BE trong đợt này.

Chỉ sửa frontend; chưa commit/push.
