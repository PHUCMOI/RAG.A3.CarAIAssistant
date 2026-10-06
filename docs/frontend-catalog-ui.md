# Tối ưu giao diện /cars — 06/10/2026

- Phần đầu trang gồm tìm kiếm, lọc nhanh 5/7 chỗ, SUV và liên kết tư vấn. Giữ debounce 300 ms, Enter và URL hiện có.
- Bộ lọc desktop cố định khi cuộn, thu gọn theo nhóm, có số lựa chọn và số xe của từng giá trị trong tập dữ liệu tải về. Các số này không phải số kết quả theo toàn bộ bộ lọc phối hợp hoặc tổng database.
- Dùng nhãn tiếng Việt cho nhiên liệu, hộp số và trạng thái thị trường; giá trị API/URL không đổi. Giá trị chưa biết dùng nhãn dự phòng.
- Thẻ xe đồng nhất kích thước, thông số, giá tham khảo và thao tác. Placeholder chữ hãng vẫn được dùng đến khi có hợp đồng URL ảnh.
- Nút lưới/danh sách có aria-pressed; thẻ đã chọn so sánh có viền và trạng thái rõ ràng. Thanh so sánh hiển thị số xe đã chọn, giới hạn vẫn 3 xe.
- Chip giá hiển thị tiền Việt, phân trang có khoảng kết quả; màn hình rỗng vẫn xóa/sửa được bộ lọc. Khoảng giá không hợp lệ không được áp dụng.
- Tối ưu chính cho desktop, giữ drawer mobile hiện có.

Kiểm tra: build và 30 test FE đạt; hai luồng trình duyệt desktop kiểm tra URL/back/forward, phân trang, giới hạn so sánh, lọc nhanh, nhãn tiếng Việt, chế độ danh sách và giá không hợp lệ. Kiểm tra trực tiếp BE ở localhost:5173/cars tải 50 xe, hiển thị 12 thẻ/trang, cả lưới/danh sách không tràn ngang và không có lỗi JavaScript. Đây là smoke test catalogue, không phải nghiệm thu toàn bộ tính chính xác của dữ liệu.
