export function formatDate(value?: string | null) {
  if (!value) return 'Chưa cập nhật'
  return new Intl.DateTimeFormat('vi-VN').format(new Date(value))
}
