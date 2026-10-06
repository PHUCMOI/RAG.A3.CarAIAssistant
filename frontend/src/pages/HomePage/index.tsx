import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Car, CarListResponse } from '../../entities/car/model'
import { CarCard } from '../../entities/car/CarCard'
import { apiGet } from '../../shared/api/client'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ErrorState } from '../../shared/components/ErrorState'
import { EmptyState } from '../../shared/components/EmptyState'
import { toggleSelection, useComparisonSelection } from '../../features/car-compare/hooks'
import './home.css'

function useListCount(url: string) {
  const [value, setValue] = useState<number | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setValue(null); setError(false)
    apiGet<{ items: unknown[] }>(url, controller.signal)
      .then(data => { if (!controller.signal.aborted) setValue(data.items.length) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [url, retry])
  return { value, error, retry: () => setRetry(x => x + 1) }
}
export default function HomePage() {
  const [cars, setCars] = useState<Car[]>([])
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [compare, setCompare] = useComparisonSelection()
  const [compareMessage, setCompareMessage] = useState('')
  const dealers = useListCount('/api/dealers')
  const sources = useListCount('/api/sources')
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(false)
    apiGet<CarListResponse>('/api/cars?limit=100', controller.signal)
      .then(x => { if (!controller.signal.aborted) setCars(x.items) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [retry])
  function search(event: FormEvent) { event.preventDefault(); navigate(query.trim() ? `/cars?query=${encodeURIComponent(query.trim())}` : '/cars') }
  function select(car: Car) { const result = toggleSelection(compare, car.carId); if (!result.message) setCompare(result.ids); setCompareMessage(result.message) }
  // Start with distinct brands, then fill the preview from the loaded dataset.
  const highlights = cars.filter((car, index) => cars.findIndex(candidate => candidate.brand === car.brand) === index).slice(0, 6)
  for (const car of cars) { if (highlights.length >= 6) break; if (!highlights.some(item => item.carId === car.carId)) highlights.push(car) }
  return <div className={`home-page${compare.length ? ' home-has-comparison' : ''}`}>
    <section className="hero"><div className="hero-copy"><span className="section-kicker">Khám phá ô tô cùng AutoWise</span><h1>Chọn đúng chiếc xe.<br /><em>Dựa trên dữ liệu.</em></h1><p>Khám phá mẫu xe, đối chiếu giá tham khảo và tìm thông tin bảo hành, đại lý trong cùng một nơi.</p>
      <form className="hero-search" onSubmit={search}><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm theo tên xe hoặc hãng, ví dụ Honda CR-V…" aria-label="Tìm kiếm xe" /><button>Tìm xe →</button></form>
      <div className="quick-links"><Link to="/cars?maxPrice=800000000">Dưới 800 triệu</Link><Link to="/cars?bodyType=SUV">SUV</Link><Link to="/cars?seats=7">7 chỗ</Link><Link to="/cars?bodyType=SUV&seats=7">SUV 7 chỗ</Link></div>
      <Link className="home-ai-cta" to="/chat"><span aria-hidden="true">✦</span> Chưa biết chọn xe nào? Tư vấn cùng AI <span aria-hidden="true">→</span></Link>
    </div><div className="hero-art"><div className="hero-orbit" aria-hidden="true"/><div className="hero-car"><span>AW</span><strong>{loading || error ? '—' : cars.length}</strong><small>{loading ? 'Đang tải mẫu xe' : error ? 'Chưa tải được xe' : 'Mẫu xe đã tải'}</small></div><div className="stat-chip one"><strong>{dealers.value ?? '—'}</strong><span>{dealers.error ? <button onClick={dealers.retry} aria-label="Thử lại số liệu đại lý">Tải lại đại lý</button> : dealers.value === null ? 'đang tải đại lý' : 'đại lý trong dữ liệu'}</span></div><div className="stat-chip two"><strong>{sources.value ?? '—'}</strong><span>{sources.error ? <button onClick={sources.retry} aria-label="Thử lại số liệu nguồn">Tải lại nguồn</button> : sources.value === null ? 'đang tải nguồn' : 'nguồn tham khảo'}</span></div></div></section>
    <section className="page section home-discovery"><div className="section-heading"><div><span className="section-kicker">Khám phá</span><h2>Gợi ý khám phá</h2><p>Một vài mẫu xe từ các hãng trong dữ liệu. Tìm chiếc phù hợp với nhu cầu của bạn.</p></div><Link className="text-link" to="/cars">Xem tất cả →</Link></div>{loading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => setRetry(x => x + 1)} /> : !cars.length ? <EmptyState title="Chưa có mẫu xe" description="Dữ liệu xe đang được cập nhật. Bạn vẫn có thể trao đổi với trợ lý AI." /> : <div className="car-grid">{highlights.map(car => <CarCard catalog key={car.carId} car={car} selected={compare.includes(car.carId)} onCompare={select} />)}</div>}{compareMessage && !compare.length && <p role="status">{compareMessage}</p>}</section>
    <section className="trust-band"><div><span>01</span><strong>Tra cứu nguồn tham khảo</strong><p>Xem nguồn khi dữ liệu có cung cấp, kiểm tra thời điểm cập nhật trước khi sử dụng.</p></div><div><span>02</span><strong>So sánh dễ hiểu</strong><p>Đặt tối đa 3 xe cạnh nhau về giá và thông số; mục chưa có thông tin được ghi rõ.</p></div><div><span>03</span><strong>Trợ lý đồng hành</strong><p>Hỏi về nhu cầu chọn xe hoặc đăng nhập để tra cứu đơn hàng của bạn.</p></div></section>
    {compare.length > 0 && <aside className="comparison-tray" aria-label="Xe đã chọn so sánh"><strong>{compare.length}/3 xe</strong>{compareMessage && <p role="status">{compareMessage}</p>}<div>{compare.map(id => <button className="mini-button" key={id} aria-label={`Bỏ ${cars.find(car => car.carId === id)?.displayName || id}`} onClick={() => { setCompare(compare.filter(value => value !== id)); setCompareMessage('') }}>{cars.find(car => car.carId === id)?.displayName || id} <span aria-hidden="true">×</span></button>)}</div>{compare.length >= 2 ? <Link className="button" to={'/compare?ids=' + encodeURIComponent(compare.join(','))}>So sánh ({compare.length})</Link> : <button className="button" disabled>Chọn thêm 1 xe</button>}<button className="mini-button" onClick={() => { setCompare([]); setCompareMessage('') }}>Bỏ tất cả xe</button></aside>}
  </div>
}
