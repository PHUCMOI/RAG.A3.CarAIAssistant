import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Car } from '../../entities/car/model'
import { apiGet } from '../../shared/api/client'
import { formatVnd } from '../../shared/formatting/currency'
import { formatDate } from '../../shared/formatting/date'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ErrorState } from '../../shared/components/ErrorState'

export default function CarDetailPage() {
  const { carId } = useParams(); const [car, setCar] = useState<Car | null>(null); const [error, setError] = useState(false)
  useEffect(() => { if (carId) apiGet<Car>(`/api/cars/${carId}`).then(setCar).catch(() => setError(true)) }, [carId])
  if (error) return <div className="page narrow"><ErrorState message="Không tìm thấy mẫu xe này." /></div>
  if (!car) return <div className="page"><LoadingSkeleton /></div>
  const specs = [['Kiểu thân xe', car.bodyType], ['Nhiên liệu', car.fuelType], ['Hộp số', car.transmission], ['Số ghế', car.seats ? `${car.seats}` : null], ['Động cơ', car.engine], ['Số ảnh', `${car.imageCount}`]]
  return <div className="page"><Link className="back-link" to="/cars">← Quay lại danh sách</Link><section className="detail-hero"><div className="detail-visual"><span>{car.brand.slice(0, 1)}</span><small>{car.bodyType || 'Vehicle profile'}</small></div><div className="detail-summary"><div className="eyebrow"><span>{car.brand}</span><span>{car.marketStatusVn.replaceAll('_', ' ')}</span></div><h1>{car.displayName}</h1><p>{car.description}</p><strong className="detail-price">{formatVnd(car.priceVndFrom)}</strong><small>Cập nhật: {formatDate(car.priceAsOf)} · Nguồn: <Link className="text-link" to={`/sources/${encodeURIComponent(car.priceSourceId || car.presenceSourceId)}`}>{car.priceSourceId || car.presenceSourceId}</Link></small><div className="detail-actions"><Link className="button secondary" to={`/compare?ids=${encodeURIComponent(car.carId)}`}>So sánh xe này</Link><Link className="button" to={`/chat?car=${car.carId}`}>Hỏi về xe này</Link><Link className="button secondary" to={`/dealers?brand=${encodeURIComponent(car.brand)}`}>Tìm đại lý</Link></div></div></section>
    <div className="detail-grid"><section className="content-panel"><span className="section-kicker">Thông số</span><h2>Thông tin tổng quan</h2><div className="spec-grid">{specs.map(([label, value]) => <div key={label}><span>{label}</span><strong>{value || 'Chưa có dữ liệu'}</strong></div>)}</div></section><aside className="content-panel warranty-panel"><span className="section-kicker">Bảo hành</span><h2>{car.warrantyMonths ? `${car.warrantyMonths} tháng` : 'Chưa có dữ liệu'}</h2><p>{car.warrantyDistanceKm ? `Hoặc ${new Intl.NumberFormat('vi-VN').format(car.warrantyDistanceKm)} km, tùy điều kiện nào đến trước.` : 'Hãy xác nhận chính sách theo VIN và ngày bán.'}</p><Link className="text-link" to={`/sources/${car.presenceSourceId}`}>Xem nguồn dữ liệu →</Link></aside></div>
  </div>
}
