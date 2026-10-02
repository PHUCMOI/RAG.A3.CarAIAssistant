import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Car, CarListResponse } from '../../entities/car/model'
import { CarCard } from '../../entities/car/CarCard'
import { apiGet } from '../../shared/api/client'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ErrorState } from '../../shared/components/ErrorState'
import { readSavedComparison, saveComparison } from '../../features/car-compare/hooks'
import { EmptyState } from '../../shared/components/EmptyState'

export default function CarCatalogPage() {
  const [params, setParams] = useSearchParams()
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [compare, setCompare] = useState<string[]>(readSavedComparison)
  const load = () => { setLoading(true); setError(false); apiGet<CarListResponse>('/api/cars?limit=100').then(x => setCars(x.items)).catch(() => setError(true)).finally(() => setLoading(false)) }
  useEffect(load, [])
  const brands = useMemo(() => [...new Set(cars.map(x => x.brand))].sort(), [cars])
  const query = params.get('query') || '', brand = params.get('brand') || '', bodyType = params.get('bodyType') || '', seats = params.get('seats') || '', maxPrice = Number(params.get('maxPrice')) || 0
  const filtered = useMemo(() => cars.filter(car => (!query || `${car.displayName} ${car.brand} ${car.aliases.join(' ')}`.toLowerCase().includes(query.toLowerCase())) && (!brand || car.brand === brand) && (!bodyType || car.bodyType?.toLowerCase().includes(bodyType.toLowerCase())) && (!seats || car.seats === Number(seats)) && (!maxPrice || (car.priceVndFrom != null && car.priceVndFrom <= maxPrice))), [cars, query, brand, bodyType, seats, maxPrice])
  function setFilter(name: string, value: string) { const next = new URLSearchParams(params); value ? next.set(name, value) : next.delete(name); setParams(next) }
  function toggleCompare(car: Car) { const next = compare.includes(car.carId) ? compare.filter(x => x !== car.carId) : compare.length < 3 ? [...compare, car.carId] : compare; setCompare(next); saveComparison(next) }
  return <div className="page"><div className="page-heading"><span className="section-kicker">50 mẫu xe</span><h1>Kho dữ liệu xe</h1><p>Lọc theo nhu cầu và mở chi tiết để kiểm tra giá, bảo hành cùng nguồn dữ liệu.</p></div>
    <div className="catalog-layout"><aside className="filters"><h2>Bộ lọc</h2><label>Từ khóa<input value={query} onChange={e => setFilter('query', e.target.value)} placeholder="Tên xe hoặc hãng" /></label><label>Hãng<select value={brand} onChange={e => setFilter('brand', e.target.value)}><option value="">Tất cả hãng</option>{brands.map(x => <option key={x}>{x}</option>)}</select></label><label>Kiểu xe<select value={bodyType} onChange={e => setFilter('bodyType', e.target.value)}><option value="">Tất cả kiểu xe</option><option>SUV</option><option>Saloon</option><option>Hatchback</option><option>Pickup</option></select></label><label>Số ghế<select value={seats} onChange={e => setFilter('seats', e.target.value)}><option value="">Bất kỳ</option><option value="5">5 chỗ</option><option value="7">7 chỗ</option></select></label><label>Giá tối đa<select value={maxPrice || ''} onChange={e => setFilter('maxPrice', e.target.value)}><option value="">Không giới hạn</option><option value="500000000">500 triệu</option><option value="800000000">800 triệu</option><option value="1000000000">1 tỷ</option><option value="2000000000">2 tỷ</option></select></label><button className="button ghost" onClick={() => setParams({})}>Xóa bộ lọc</button></aside>
      <section className="catalog-results"><div className="results-toolbar"><strong>{filtered.length} kết quả</strong>{compare.length > 0 && <Link className={`button ${compare.length < 2 ? 'disabled' : ''}`} to={`/compare?ids=${compare.join(',')}`}>So sánh ({compare.length})</Link>}</div>{loading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={load} /> : filtered.length === 0 ? <EmptyState title="Không tìm thấy xe" description="Hãy thử bỏ bớt điều kiện lọc." /> : <div className="car-grid">{filtered.map(car => <CarCard key={car.carId} car={car} onCompare={toggleCompare} selected={compare.includes(car.carId)} />)}</div>}</section>
    </div>
  </div>
}
