import { FormEvent, useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import type { Car, CarListResponse } from '../../entities/car/model'
import { CarCard } from '../../entities/car/CarCard'
import { apiGet } from '../../shared/api/client'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ErrorState } from '../../shared/components/ErrorState'
import { EmptyState } from '../../shared/components/EmptyState'

export default function HomePage() {
  const [cars, setCars] = useState<Car[]>([])
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(false)
    apiGet<CarListResponse>('/api/cars?limit=6', controller.signal)
      .then(x => { if (!controller.signal.aborted) setCars(x.items) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [retry])
  function search(event: FormEvent) { event.preventDefault(); if (query.trim()) navigate(`/cars?query=${encodeURIComponent(query.trim())}`) }
  return <>
    <section className="hero"><div className="hero-copy"><span className="section-kicker">Vietnam car intelligence</span><h1>Chọn đúng chiếc xe.<br /><em>Dựa trên dữ liệu.</em></h1><p>Khám phá, so sánh và hỏi đáp về 50 mẫu xe với giá VND, bảo hành, đại lý và nguồn tham khảo minh bạch.</p>
      <form className="hero-search" onSubmit={search}><input value={query} onChange={e => setQuery(e.target.value)} placeholder="Tìm Honda CR-V, SUV 7 chỗ…" aria-label="Tìm kiếm xe" /><button>Tìm xe →</button></form>
      <div className="quick-links"><Link to="/cars?maxPrice=800000000">Dưới 800 triệu</Link><Link to="/cars?bodyType=SUV">SUV</Link><Link to="/cars?seats=7">7 chỗ</Link><Link to="/search-image" style={{ background: '#d8f67e', color: '#173f38', fontWeight: 700 }}>📷 Tìm bằng ảnh</Link><Link to="/chat">Tư vấn bằng AI</Link></div>
    </div><div className="hero-art"><div className="hero-orbit"/><div className="hero-car"><span>AW</span><strong>50</strong><small>verified models</small></div><div className="stat-chip one"><strong>22</strong><span>đại lý</span></div><div className="stat-chip two"><strong>61</strong><span>nguồn</span></div></div></section>
    <section className="page section"><div className="section-heading"><div><span className="section-kicker">Khám phá</span><h2>Mẫu xe nổi bật</h2></div><Link className="text-link" to="/cars">Xem tất cả →</Link></div>{loading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => setRetry(x => x + 1)} /> : !cars.length ? <EmptyState title="Chưa có mẫu xe" description="Vui lòng quay lại sau." /> : <div className="car-grid">{cars.map(car => <CarCard key={car.carId} car={car} />)}</div>}</section>
    <section className="trust-band"><div><span>01</span><strong>Dữ liệu có nguồn</strong><p>Giá và thông tin đều gắn với nguồn kiểm tra.</p></div><div><span>02</span><strong>So sánh minh bạch</strong><p>Không xem dữ liệu thiếu như giá trị bằng không.</p></div><div><span>03</span><strong>Tư vấn có căn cứ</strong><p>Chatbot trả lời từ context trong database.</p></div></section>
  </>
}
