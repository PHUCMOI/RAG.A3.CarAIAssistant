const labels: Record<string, string> = {
  petrol: 'Xăng', gasoline: 'Xăng', diesel: 'Dầu diesel', electric: 'Điện', hybrid: 'Hybrid', phev: 'Hybrid sạc ngoài',
  automatic: 'Số tự động', manual: 'Số sàn', cvt: 'CVT', dct: 'Ly hợp kép', at: 'Số tự động', mt: 'Số sàn',
  sedan: 'Sedan', suv: 'SUV', crossover: 'Crossover', hatchback: 'Hatchback', mpv: 'MPV', pickup: 'Bán tải', wagon: 'Wagon', coupe: 'Coupe', convertible: 'Mui trần',
  official_current: 'Đang phân phối', official: 'Phân phối chính hãng', official_discontinued: 'Ngừng phân phối', discontinued: 'Ngừng phân phối',
  official_historical: 'Từng phân phối chính hãng', present_via_import: 'Có mặt qua nhập khẩu', 'hybrid petrol/electric': 'Hybrid (xăng/điện)',
  historical: 'Xe lịch sử', private_import: 'Nhập tư nhân', unofficial_import: 'Nhập không chính hãng',
  imported: 'Nhập khẩu', parallel_import: 'Nhập khẩu tư nhân', grey_import: 'Nhập khẩu tư nhân', unknown: 'Chưa xác định',
}
export function carLabel(value?: string | null) {
  if (!value) return 'Chưa có thông tin'
  return labels[value.toLowerCase().replace(/\s+/g, ' ').trim()] || value.replaceAll('_', ' ')
}
