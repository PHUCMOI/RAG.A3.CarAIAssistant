# Tối ưu giao diện /compare — 06/10/2026

- Bố cục đồng bộ /cars: ba vị trí chọn xe, thẻ thông số/giá và thao tác thay/xóa rõ ràng, chia sẻ và xóa tất cả.
- Bộ chọn xe dùng dialog có focus ban đầu, Escape, trả focus về thao tác mở; tìm kiếm không phân biệt dấu, lọc hãng, loại xe đã chọn ở vị trí khác.
- Bảng có tiêu đề và cột tiêu chí cố định trong vùng cuộn; đánh dấu và tô nền dòng khác biệt, giữ tùy chọn chỉ xem khác nhau. Giá khác nhau vẫn giữ ngày giá, nguồn giá và thị trường làm ngữ cảnh.
- Nhãn tiếng Việt, nguồn dùng liên kết đúng ID thay vì hiển thị ID kỹ thuật. Thiếu dữ liệu vẫn có nhãn rõ ràng, không thay bằng số 0.
- Thứ tự cột theo URL dù API trả thứ tự khác. Mở /compare không có ids khôi phục lựa chọn đã lưu; xóa tất cả vẫn giữ trạng thái rỗng. URL chia sẻ và giới hạn ba xe được giữ.

Kiểm tra: 33 test FE đạt. Luồng trình duyệt desktop kiểm tra thay xe, Escape/focus, tìm kiếm không dấu, giá thiếu, lọc khác biệt, khôi phục và xóa lựa chọn đạt cùng các luồng catalogue/so sánh hiện có. Smoke test BE thực so sánh ba xe, kiểm tra bốn cột (tiêu chí + ba xe), tiêu đề cố định khi cuộn, không tràn ngang và không có lỗi JavaScript. Tối ưu chính cho desktop; chưa nghiệm thu riêng mobile.
