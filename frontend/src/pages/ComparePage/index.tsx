import { useEffect, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Car, CarListResponse } from '../../entities/car/model'
import { apiGet } from '../../shared/api/client'
import { formatVnd } from '../../shared/formatting/currency'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'

export default function ComparePage() {
  const [params] = useSearchParams(); const ids = (params.get('ids') || '').split(',').filter(Boolean); const [cars, setCars] = useState<Car[] | null>(null)
  useEffect(() => { apiGet<CarListResponse>('/api/cars?limit=100').then(x => setCars(ids.map(id => x.items.find(car => car.carId === id)).filter(Boolean) as Car[])).catch(() => setCars([])) }, [params.toString()])
  if (!cars) return <div className="page"><LoadingSkeleton /></div>
  if (cars.length < 2) return <div className="page narrow"><div className="state-card"><span className="section-kicker">So sánh xe</span><h1>Chọn ít nhất hai mẫu xe</h1><p>Thêm xe từ kho dữ liệu để xem các thông tin cạnh nhau.</p><Link className="button" to="/cars">Chọn xe</Link></div></div>
  const rows: [string, (car: Car) => string][] = [['Giá từ', car => formatVnd(car.priceVndFrom)], ['Tình trạng', car => car.marketStatusVn.replaceAll('_', ' ')], ['Kiểu xe', car => car.bodyType || 'Chưa có'], ['Số ghế', car => car.seats ? `${car.seats}` : 'Chưa có'], ['Nhiên liệu', car => car.fuelType || 'Chưa có'], ['Hộp số', car => car.transmission || 'Chưa có'], ['Động cơ', car => car.engine || 'Chưa có'], ['Bảo hành', car => car.warrantyMonths ? `${car.warrantyMonths} tháng` : 'Chưa có']]
  return <div className="page"><div className="page-heading"><span className="section-kicker">Đặt cạnh nhau</span><h1>So sánh xe</h1><p>Thông tin được lấy trực tiếp từ database hiện tại.</p></div><div className="comparison-table"><div className="comparison-row comparison-head"><strong>Tiêu chí</strong>{cars.map(car => <div key={car.carId}><span className="brand-token">{car.brand.slice(0, 1)}</span><Link to={`/cars/${car.carId}`}><strong>{car.displayName}</strong></Link></div>)}</div>{rows.map(([label, getter]) => <div className="comparison-row" key={label}><strong>{label}</strong>{cars.map(car => <span key={car.carId}>{getter(car)}</span>)}</div>)}</div></div>
}
