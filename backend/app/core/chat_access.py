import re
import unicodedata

REFUSAL = 'Bạn không có quyền xem doanh thu, lợi nhuận hoặc thống kê nội bộ toàn hệ thống. Tôi có thể giúp bạn tư vấn xe hoặc kiểm tra đơn hàng thuộc tài khoản của bạn sau khi đăng nhập.'


def restricted_admin_question(text: str) -> bool:
    text = ''.join(c for c in unicodedata.normalize('NFD', text.lower()) if unicodedata.category(c) != 'Mn').replace('đ', 'd')
    return bool(re.search(r'doanh thu|revenue|loi nhuan|\bprofits?\b|(?:thong ke|bao cao|tong (?:so|tien)|danh sach).*(?:toan (?:he thong|bo (?:khach hang|cua hang|cong ty))|cua hang|cong ty|dai ly|khach hang khac)|(?:store|company|system).*(?:statistics|sales|turnover)|(?:all|other) customers', text))


def refusal_result():
    return dict(answer=REFUSAL, grounded=False, status='forbidden', evidence=[], citations=[], contexts=[], generationMode='authorization-policy')
