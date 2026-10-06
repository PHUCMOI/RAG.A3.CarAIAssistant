# Trang chủ

- Giữ hero, đồ họa và bố cục chính. Việt hóa nội dung; thêm CTA rõ ràng tới trợ lý AI.
- Placeholder tìm theo tên/hãng đúng khả năng hiện có. Chip SUV 7 chỗ kết hợp bodyType và seats; gửi ô trống mở catalogue.
- Xe tải từ /api/cars?limit=100. Số hiển thị là độ dài tập đã tải, không coi count là tổng database; bỏ nhãn verified models. Số đại lý/nguồn lấy items từ API tương ứng, có loading/error/retry riêng.
- Đổi Mẫu xe nổi bật thành Gợi ý khám phá; chọn tối đa 6 xe, ưu tiên hãng khác nhau rồi bổ sung từ dữ liệu hiện có. Không coi đây là xếp hạng hoặc gợi ý cá nhân hóa.
- Card dùng nhãn tiếng Việt, giá tham khảo, placeholder ảnh và nút so sánh. Lựa chọn dùng chung storage với catalogue/detail/compare, giới hạn 3 xe; thanh so sánh cho bỏ từng xe/xóa tất cả và chỉ mở khi đủ 2 xe.
- Nội dung về nguồn mô tả đúng trường hợp API có cung cấp, bỏ diễn giải kỹ thuật database/context khỏi giao diện.

## Kiểm tra

- Build đạt; 51 test FE đạt.
- Test Edge 1440px đạt: số liệu, card, lựa chọn so sánh, URL bộ lọc kết hợp và tìm kiếm bằng Enter.
- BE local: 50 xe đã tải, 22 đại lý, 61 nguồn; 6 card; không tràn ngang hoặc lỗi JavaScript. Đã xem ảnh toàn trang.
- Chưa nghiệm thu mobile; không sửa backend. Bộ xe hiện tải tối đa 100, không khẳng định số tổng toàn database.

Chưa commit/push.
