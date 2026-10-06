# Tối ưu giao diện /dealers — 06/10/2026

- Bố cục đồng bộ các trang public: tìm kiếm và thành phố nhanh ở đầu, bộ lọc hãng/thành phố, chip điều kiện, sắp xếp theo tên hoặc thành phố.
- Tìm tên, địa chỉ, hãng và thành phố không phân biệt dấu; debounce 300 ms, Enter áp dụng ngay. Thay bộ lọc giữ từ khóa đang soạn; URL và back/forward phục hồi trạng thái. Retry giữ từ khóa/bộ lọc.
- Tên thành phố hiển thị tiếng Việt; giữ tương thích giá trị API/URL hiện có, hỗ trợ URL dùng tên thành phố tiếng Việt.
- Thẻ đại lý có hãng, thành phố, địa chỉ, số điện thoại, website, ngày kiểm tra và nguồn khi API cung cấp. Thiếu dữ liệu dùng nhãn rõ ràng; ngày không hợp lệ không làm hỏng trang.
- Bản đồ là liên kết tìm địa chỉ trên Google Maps, mở tab mới; không có bản đồ nhúng, định vị, khoảng cách hoặc lịch làm việc giả. Website chỉ nhận URL HTTP/HTTPS. Liên kết nguồn dùng đúng sourceId.
- Kết quả và thống kê phản ánh danh sách đã tải; không suy diễn số đại lý toàn database.

Kiểm tra: build đạt, 37 test FE đạt; kiểm tra trình duyệt desktop tìm kiếm không dấu, phối hợp bộ lọc, back/forward, trạng thái rỗng và URL liên hệ đạt. Smoke test BE thực tải đủ 22 đại lý, kết hợp tên/thành phố trả một kết quả, không tràn ngang và không có lỗi JavaScript. Đã xem ảnh desktop. Không tự mở website, gọi điện hoặc xác nhận độ chính xác của nội dung Google Maps; ưu tiên đợt này vẫn là desktop.
