import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Car, CarListResponse } from '../../entities/car/model'
import { CarCard } from '../../entities/car/CarCard'
import { apiGet } from '../../shared/api/client'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ErrorState } from '../../shared/components/ErrorState'
import { EmptyState } from '../../shared/components/EmptyState'
import { toggleSelection, useComparisonSelection } from '../../features/car-compare/hooks'
import { groups, groupValue, priceError, selectCars, updateQuery } from '../../features/car-search/catalog'

export default function CarCatalogPage() {
  const [params, setParams] = useSearchParams()
  const [cars, setCars] = useState<Car[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  const [compare, setCompare] = useComparisonSelection()
  const [compareMessage, setCompareMessage] = useState('')
  const [query, setQuery] = useState(params.get('query') || '')
  const [min, setMin] = useState(params.get('minPrice') || '')
  const [max, setMax] = useState(params.get('maxPrice') || '')
  const [priceMessage, setPriceMessage] = useState('')
  const [view, setView] = useState('grid')
  const dialog = useRef<HTMLDialogElement>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const paramsRef = useRef(params)
  paramsRef.current = params
  const change = (key: string, values: string[]) => setParams(updateQuery(paramsRef.current, key, values))
  useEffect(() => {
    clearTimeout(searchTimer.current)
    setQuery(params.get('query') || '')
    setMin(params.get('minPrice') || ''); setMax(params.get('maxPrice') || ''); setPriceMessage('')
  }, [params])
  useEffect(() => () => clearTimeout(searchTimer.current), [])
  useEffect(() => {
    const controller = new AbortController()
    setLoading(true); setError(false)
    apiGet<CarListResponse>('/api/cars?limit=100', controller.signal)
      .then(result => { if (!controller.signal.aborted) setCars(result.items) })
      .catch(() => { if (!controller.signal.aborted) setError(true) })
      .finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [retry])
  const result = useMemo(() => selectCars(cars, params), [cars, params])
  function applyPrices() {
    const message = priceError(min, max)
    setPriceMessage(message)
    if (!message) setParams(updateQuery(updateQuery(params, 'minPrice', [min]), 'maxPrice', [max]))
  }
  function toggleCompare(car: Car) {
    const next = toggleSelection(compare, car.carId)
    setCompareMessage(next.message); setCompare(next.ids)
  }
  const filters = (prefix: string) => <>
    {groups.map(([key, label]) => <fieldset key={key}><legend>{label}</legend>{[...new Set([...cars.map(car => groupValue(car, key)), ...params.getAll(key)])].filter(Boolean).sort().map(value => <label className="filter-option" key={value}><input type="checkbox" checked={params.getAll(key).includes(value)} onChange={e => change(key, e.target.checked ? [...params.getAll(key), value] : params.getAll(key).filter(x => x !== value))} />{value.replaceAll('_', ' ')}</label>)}</fieldset>)}
    <label>Số ghế<select value={params.get('seats') || ''} onChange={e => change('seats', [e.target.value])}><option value="">Bất kỳ</option>{[...new Set(cars.map(car => car.seats).filter((v): v is number => v != null))].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value} chỗ</option>)}</select></label>
    <label>Giá tối thiểu (VND)<input type="number" min="0" step="1" value={min} onChange={e => setMin(e.target.value)} aria-describedby={`${prefix}-price-error`} /></label>
    <label>Giá tối đa (VND)<input type="number" min="0" step="1" value={max} onChange={e => setMax(e.target.value)} aria-describedby={`${prefix}-price-error`} /></label>
    <p id={`${prefix}-price-error`} role="status">{priceMessage || result.invalidPrice}</p>
    <button className="mini-button" onClick={applyPrices}>Áp dụng khoảng giá</button>
    <button className="button ghost" onClick={() => setParams({})}>Xóa bộ lọc</button>
  </>
  const chipKeys = ['query', ...groups.map(([key]) => key), 'seats', 'minPrice', 'maxPrice']
  const chips = chipKeys.flatMap(key => params.getAll(key).filter(Boolean).map(value => ({ key, value })))
  return <div className="page catalog-page">
    <div className="page-heading"><span className="section-kicker">Khám phá xe</span><h1>Kho dữ liệu xe</h1><p>Lọc và so sánh trong {cars.length} mẫu xe đã tải.</p></div>
    <form className="catalog-search" onSubmit={e => { e.preventDefault(); clearTimeout(searchTimer.current); change('query', [query.trim()]) }}><label>Tìm xe<input value={query} onChange={e => { const value = e.target.value; setQuery(value); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => change('query', [value.trim()]), 300) }} placeholder="Tên xe hoặc hãng" /></label><button className="button">Tìm kiếm</button></form>
    <button className="button mobile-filter-button" onClick={() => dialog.current?.showModal()}>Mở bộ lọc</button>
    <dialog ref={dialog} className="filter-dialog" aria-label="Bộ lọc xe"><button className="mini-button" onClick={() => dialog.current?.close()}>Đóng bộ lọc</button><div className="filters">{filters('mobile')}</div></dialog>
    <div className="filter-chips">{chips.map(({ key, value }) => <button className="mini-button" key={`${key}:${value}`} aria-label={`Xóa bộ lọc ${key}: ${value}`} onClick={() => change(key, params.getAll(key).filter(x => x !== value))}>{key === 'minPrice' ? 'Giá từ: ' : key === 'maxPrice' ? 'Giá đến: ' : ''}{value} ×</button>)}{chips.length > 0 && <button className="mini-button" onClick={() => setParams({})}>Xóa tất cả</button>}</div>
    <div className="catalog-layout"><aside className="filters catalog-desktop-filters"><h2>Bộ lọc</h2>{filters('desktop')}</aside><section className="catalog-results">
      <div className="results-toolbar"><strong aria-live="polite">{result.total} kết quả trong tập đã tải</strong><label>Sắp xếp<select value={params.get('sort') || 'relevance'} onChange={e => change('sort', [e.target.value])}><option value="relevance">Liên quan</option><option value="price_asc">Giá tăng dần</option><option value="price_desc">Giá giảm dần</option><option value="name_asc">Tên A–Z</option></select></label><label>Hiển thị<select value={view} onChange={e => setView(e.target.value)}><option value="grid">Lưới</option><option value="list">Danh sách</option></select></label></div>
      {loading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => setRetry(x => x + 1)} /> : result.total === 0 ? <><EmptyState title="Không tìm thấy xe" description="Hãy xóa bớt các bộ lọc phía trên." /><button className="button" onClick={() => setParams({})}>Xóa bộ lọc</button></> : <div className={view === 'list' ? 'car-list' : 'car-grid'}>{result.items.map(car => <CarCard key={car.carId} car={car} onCompare={toggleCompare} selected={compare.includes(car.carId)} />)}</div>}
      {!loading && !error && <nav className="catalog-pagination" aria-label="Phân trang xe"><button className="mini-button" disabled={result.page === 1} onClick={() => change('page', [String(result.page - 1)])}>Trang trước</button><span>Trang {result.page}/{result.pageCount}</span><button className="mini-button" disabled={result.page === result.pageCount} onClick={() => change('page', [String(result.page + 1)])}>Trang sau</button><label>Số xe mỗi trang<select value={result.pageSize} onChange={e => change('pageSize', [e.target.value])}>{[12, 24, 48].map(n => <option key={n}>{n}</option>)}</select></label></nav>}
      <p role="status">{compareMessage}</p>
      {compare.length > 0 && <aside className="comparison-tray" aria-label="Xe đã chọn so sánh"><div>{compare.map(id => <button className="mini-button" key={id} onClick={() => { setCompare(compare.filter(value => value !== id)); setCompareMessage('') }} aria-label={`Bỏ ${cars.find(car => car.carId === id)?.displayName || id}`}>{cars.find(car => car.carId === id)?.displayName || id} ×</button>)}</div>{compare.length >= 2 ? <Link className="button" to={`/compare?ids=${encodeURIComponent(compare.join(','))}`}>So sánh ({compare.length})</Link> : <button className="button" disabled>Chọn thêm 1 xe</button>}<button className="mini-button" onClick={() => { setCompare([]); setCompareMessage('') }}>Bỏ tất cả xe</button></aside>}
    </section></div>
  </div>
}
