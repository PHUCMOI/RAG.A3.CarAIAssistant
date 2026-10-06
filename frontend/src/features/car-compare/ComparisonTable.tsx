import { Link } from 'react-router-dom'
import type { Car } from '../../entities/car/model'
import { formatVnd } from '../../shared/formatting/currency'
import { formatDate } from '../../shared/formatting/date'
import { carLabel } from '../../entities/car/labels'

const missing = 'Chưa có dữ liệu'
type Field = { key: keyof Car; label: string; unit?: string; source?: boolean }
const groups: { title: string; fields: Field[] }[] = [
  { title: 'Giá và thị trường', fields: [
    { key: 'priceVndFrom', label: 'Giá tham khảo từ', unit: 'VND' },
    { key: 'priceAsOf', label: 'Ngày giá tham khảo' },
    { key: 'priceSourceId', label: 'Nguồn giá', source: true },
    { key: 'marketStatusVn', label: 'Tình trạng tại Việt Nam' },
  ] },
  { title: 'Kiểu xe và vận hành', fields: [
    { key: 'bodyType', label: 'Kiểu thân xe' }, { key: 'fuelType', label: 'Nhiên liệu' },
    { key: 'transmission', label: 'Hộp số' }, { key: 'engine', label: 'Động cơ' },
    { key: 'enginePowerHp', label: 'Công suất', unit: 'hp' },
  ] },
  { title: 'Không gian', fields: [
    { key: 'seats', label: 'Số ghế', unit: 'chỗ' }, { key: 'lengthMm', label: 'Chiều dài', unit: 'mm' },
    { key: 'widthMm', label: 'Chiều rộng', unit: 'mm' }, { key: 'heightMm', label: 'Chiều cao', unit: 'mm' },
    { key: 'wheelbaseMm', label: 'Chiều dài cơ sở', unit: 'mm' },
  ] },
  { title: 'Bảo hành và nguồn', fields: [
    { key: 'warrantyMonths', label: 'Thời hạn bảo hành', unit: 'tháng' },
    { key: 'warrantyDistanceKm', label: 'Giới hạn quãng đường', unit: 'km' },
    { key: 'presenceSourceId', label: 'Nguồn hiện diện xe', source: true },
  ] },
]

function differs(cars: Car[], field: Field) { return new Set(cars.map(car => car[field.key] == null || car[field.key] === '' ? null : car[field.key])).size > 1 }
export function ComparisonTable({ cars, differences }: { cars: Car[]; differences: boolean }) {
  const priceDiffers = new Set(cars.map(car => car.priceVndFrom ?? null)).size > 1
  const visible = groups.map(group => ({ ...group, fields: group.fields.filter(field =>
    !differences || differs(cars, field)
    || (priceDiffers && ['priceAsOf', 'priceSourceId', 'marketStatusVn'].includes(field.key))),
  })).filter(group => group.fields.length > 0)
  if (!visible.length) return <p className="state-card">Không có thông số khác nhau trong dữ liệu hiện có.</p>
  function cell(car: Car, field: Field) {
    const value = car[field.key]
    if (value == null || value === '') return <span className="compare-missing">{missing}</span>
    if (field.source) return <Link className="text-link" to={`/sources/${encodeURIComponent(String(value))}`}>Xem nguồn ↗</Link>
    if (field.key === 'priceVndFrom') return formatVnd(Number(value))
    if (field.key === 'priceAsOf') return formatDate(String(value))
    if (['marketStatusVn', 'bodyType', 'fuelType', 'transmission'].includes(field.key)) return carLabel(String(value))
    return typeof value === 'number' ? `${new Intl.NumberFormat('vi-VN').format(value)} ${field.unit || ''}` : String(value)
  }
  return <div className="compare-scroll" role="region" aria-label="Bảng so sánh xe, cuộn ngang để xem thêm" tabIndex={0}>
    <table className="compare-data"><caption>Đối chiếu {cars.length} mẫu xe · số liệu tham khảo cấp model</caption>
      <thead><tr><th scope="col">Tiêu chí</th>{cars.map((car, index) => <th scope="col" key={car.carId}><small>XE {index + 1}</small><Link to={`/cars/${encodeURIComponent(car.carId)}`}>{car.displayName}</Link></th>)}</tr></thead>
      {visible.map(group => <tbody key={group.title}><tr className="compare-group"><th colSpan={cars.length + 1} scope="colgroup">{group.title}<small>{group.fields.length} tiêu chí</small></th></tr>{group.fields.map(field => <tr key={field.key} className={differs(cars, field) ? 'compare-row-different' : undefined}><th scope="row">{field.label}{differs(cars, field) && <span className="compare-diff-dot" aria-label="Có khác biệt" role="img" />}</th>{cars.map(car => <td key={car.carId} className={field.key === 'priceVndFrom' ? 'compare-price-cell' : undefined}>{cell(car, field)}</td>)}</tr>)}</tbody>)}
    </table>
  </div>
}
