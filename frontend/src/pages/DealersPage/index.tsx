import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Dealer } from '../../entities/dealer/model'
import { DealerCard } from '../../entities/dealer/DealerCard'
import { apiGet } from '../../shared/api/client'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ErrorState } from '../../shared/components/ErrorState'
import { EmptyState } from '../../shared/components/EmptyState'
import { cityLabel, filterDealers } from '../../features/dealer-filter/search'
import { normalizeText } from '../../features/car-search/catalog'
import './dealers.css'

export default function DealersPage() {
  const [params, setParams] = useSearchParams()
  const [dealers, setDealers] = useState<Dealer[] | null>(null)
  const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
  const [query, setQuery] = useState(params.get('query') || '')
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const paramsRef = useRef(params); paramsRef.current = params
  const queryRef = useRef(query); queryRef.current = query
  useEffect(() => { clearTimeout(timer.current); setQuery(params.get('query') || '') }, [params])
  useEffect(() => () => clearTimeout(timer.current), [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(false)
    apiGet<{ count: number; items: Dealer[] }>('/api/dealers', controller.signal)
      .then(x => { if (!controller.signal.aborted) setDealers(x.items) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [retry])
  const brand = params.get('brand') || '', city = params.get('city') || ''
  const brands = useMemo(() => [...new Set((dealers || []).flatMap(x => x.supportedBrands))].filter(Boolean).sort(), [dealers])
  const cities = useMemo(() => [...new Set((dealers || []).map(x => x.city))].filter(Boolean).sort((a, b) => cityLabel(a).localeCompare(cityLabel(b), 'vi')), [dealers])
  const selectedCity = cities.find(value => normalizeText(cityLabel(value)) === normalizeText(cityLabel(city))) || city
  const filtered = useMemo(() => filterDealers(dealers || [], params), [dealers, params])
  const chips = ['query', 'brand', 'city'].flatMap(key => { const value = params.get(key); return value ? [{ key, value }] : [] })
  function update(key: string, value: string) {
    clearTimeout(timer.current)
    const next = new URLSearchParams(paramsRef.current)
    if (key !== 'query') { const text = queryRef.current.trim(); text ? next.set('query', text) : next.delete('query') }
    value ? next.set(key, value) : next.delete(key)
    setParams(next)
  }
  function clearFilters() {
    clearTimeout(timer.current); setQuery('')
    const next = new URLSearchParams(paramsRef.current)
    for (const key of ['query', 'brand', 'city']) next.delete(key)
    setParams(next)
  }
  return <div className="page dealers-page">
    <div className="dealers-intro"><div className="page-heading"><span className="section-kicker">Mạng lưới đại lý</span><h1>Tìm đại lý.<br /><em>Dễ dàng kết nối.</em></h1><p>Khám phá điểm liên hệ theo hãng và thành phố. Kiểm tra thông tin, gọi đại lý và xem địa chỉ trước khi ghé thăm.</p></div><div className="dealers-discovery"><form className="dealers-search" onSubmit={event => { event.preventDefault(); update('query', query.trim()) }}><label className="dealers-sr-only" htmlFor="dealers-query">Tìm đại lý</label><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg><input id="dealers-query" value={query} onChange={event => { const value = event.target.value; setQuery(value); clearTimeout(timer.current); timer.current = setTimeout(() => update('query', value.trim()), 300) }} placeholder="Tên đại lý, địa chỉ hoặc hãng xe…" /><button className="button">Tìm kiếm</button></form><div className="dealers-quick-cities"><span>Tìm theo thành phố</span>{cities.map(value => <button className="mini-button" key={value} aria-pressed={selectedCity === value} onClick={() => update('city', selectedCity === value ? '' : value)}>{cityLabel(value)}</button>)}</div><Link className="dealers-assistant-link" to="/chat">Chưa biết chọn hãng? Nhờ trợ lý tư vấn ↗</Link></div></div>
    <section className="dealers-filter-bar" aria-label="Bộ lọc đại lý"><label>Hãng xe<select value={brand} onChange={event => update('brand', event.target.value)}><option value="">Tất cả hãng</option>{[...new Set([...brands, brand])].filter(Boolean).map(value => <option key={value}>{value}</option>)}</select></label><label>Thành phố<select value={selectedCity} onChange={event => update('city', event.target.value)}><option value="">Tất cả thành phố</option>{[...new Set([...cities, selectedCity])].filter(Boolean).map(value => <option key={value} value={value}>{cityLabel(value)}</option>)}</select></label><button className="dealers-reset" disabled={!chips.length && !query} onClick={clearFilters}>Đặt lại bộ lọc</button>{dealers && <span className="dealers-coverage">{dealers.length} điểm liên hệ · {brands.length} hãng · {cities.length} thành phố</span>}</section>
    {chips.length > 0 && <div className="dealers-filter-chips"><span>Đang lọc:</span>{chips.map(({ key, value }) => <button className="mini-button" key={key} aria-label={`Xóa bộ lọc ${key}: ${value}`} onClick={() => update(key, '')}>{key === 'query' ? `Tìm: ${value}` : key === 'city' ? cityLabel(value) : value}<span aria-hidden="true">×</span></button>)}<button className="dealers-reset" onClick={clearFilters}>Xóa tất cả</button></div>}
    <div className="dealers-results-toolbar"><div><h2 aria-live="polite">{loading ? 'Đang tải đại lý…' : error ? 'Chưa tải được danh sách' : `${filtered.length} đại lý phù hợp`}</h2>{!loading && !error && <p>Trong danh sách {dealers?.length || 0} điểm liên hệ đã tải</p>}</div><label>Sắp xếp<select value={params.get('sort') === 'city_asc' ? 'city_asc' : 'name_asc'} onChange={event => update('sort', event.target.value)}><option value="name_asc">Tên A–Z</option><option value="city_asc">Theo thành phố</option></select></label></div>
    {loading ? <LoadingSkeleton label="Đang tải danh sách đại lý…" /> : error ? <ErrorState message="Không thể tải đại lý. Từ khóa và bộ lọc của bạn vẫn được giữ." onRetry={() => setRetry(value => value + 1)} /> : !filtered.length ? <div className="dealers-empty"><span aria-hidden="true">⌖</span><EmptyState title="Không tìm thấy đại lý" description="Thử tên hoặc địa chỉ khác, đổi thành phố hoặc bỏ bớt điều kiện lọc." /><button className="button" onClick={clearFilters}>Xóa bộ lọc</button></div> : <section className="dealer-grid" aria-label="Danh sách đại lý">{filtered.map(dealer => <DealerCard key={dealer.dealerId} dealer={dealer} />)}</section>}
    <div className="dealers-disclaimer"><strong>Trước khi ghé đại lý</strong><p>Hãy gọi để xác nhận địa chỉ, thời gian làm việc, mẫu xe và giá hiện tại. Ngày kiểm tra và nguồn được ghi trên từng điểm liên hệ; thông tin có thể thay đổi.</p></div>
  </div>
}
