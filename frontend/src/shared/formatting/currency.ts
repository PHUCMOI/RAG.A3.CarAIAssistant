export function formatVnd(value?: number | null) {
  if (value == null) return 'Chưa có giá tham khảo'
  return new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value)
}
