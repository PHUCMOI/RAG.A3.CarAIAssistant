import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Car, CarListResponse } from '../../entities/car/model'
import { CarCard } from '../../entities/car/CarCard'
import { apiGet } from '../../shared/api/client'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ErrorState } from '../../shared/components/ErrorState'
import { EmptyState } from '../../shared/components/EmptyState'
import { toggleSelection, useComparisonSelection } from '../../features/car-compare/hooks'
import { carLabel } from '../../entities/car/labels'
import { formatVnd } from '../../shared/formatting/currency'
import './catalog.css'
import { ChevronDown } from '../../shared/components/ChevronDown'
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
    {groups.map(([key, label]) => {
      const values = [...new Set([...cars.map(car => groupValue(car, key)), ...params.getAll(key)])].filter(Boolean).sort()
      return <details className="catalog-filter-group" key={key} open={key === 'brand' || key === 'bodyType' || params.getAll(key).length > 0 ? true : undefined}><summary>{label}{params.getAll(key).length > 0 && <span>{params.getAll(key).length}</span>}<b aria-hidden="true"><ChevronDown /></b></summary><fieldset><legend className="catalog-sr-only">{label}</legend>{values.map(value => <label className="filter-option" key={value}><input type="checkbox" checked={params.getAll(key).includes(value)} onChange={e => change(key, e.target.checked ? [...params.getAll(key), value] : params.getAll(key).filter(x => x !== value))} /><span>{key === 'brand' ? value : carLabel(value)}</span><small aria-hidden="true">{cars.filter(car => groupValue(car, key) === value).length}</small></label>)}{!values.length && <small className="catalog-filter-hint">{loading ? 'Đang tải lựa chọn…' : 'Chưa có dữ liệu'}</small>}</fieldset></details>
    })}
    <div className="catalog-filter-section"><label>Số ghế<select value={params.get('seats') || ''} onChange={e => change('seats', [e.target.value])}><option value="">Bất kỳ</option>{[...new Set([...cars.map(car => car.seats), Number(params.get('seats'))].filter((v): v is number => v != null && Number.isSafeInteger(v) && v > 0))].sort((a, b) => a - b).map(value => <option key={value} value={value}>{value} chỗ</option>)}</select></label></div>
    <div className="catalog-filter-section"><h3>Khoảng giá</h3><small className="catalog-filter-hint">Nhập số tiền bằng đồng Việt Nam</small><label>Giá tối thiểu (VND)<input type="number" min="0" step="1" value={min} placeholder="Không giới hạn" onChange={e => setMin(e.target.value)} aria-invalid={Boolean(priceMessage || result.invalidPrice)} aria-describedby={prefix + '-price-error'} /></label><label>Giá tối đa (VND)<input type="number" min="0" step="1" value={max} placeholder="Không giới hạn" onChange={e => setMax(e.target.value)} aria-invalid={Boolean(priceMessage || result.invalidPrice)} aria-describedby={prefix + '-price-error'} /></label><p className="catalog-price-error" id={prefix + '-price-error'} role="status">{priceMessage || result.invalidPrice}</p><button className="mini-button catalog-price-apply" onClick={applyPrices}>Áp dụng khoảng giá</button></div>
  </>
  const chipKeys = ['query', ...groups.map(([key]) => key), 'seats', 'minPrice', 'maxPrice']
  const chips = chipKeys.flatMap(key => params.getAll(key).filter(Boolean).map(value => ({ key, value })))
  function chipLabel(key: string, value: string) {
    if (key === 'minPrice' || key === 'maxPrice') return (key === 'minPrice' ? 'Từ ' : 'Đến ') + (Number.isFinite(Number(value)) ? formatVnd(Number(value)) : value)
    if (key === 'seats') return value + ' chỗ'
    if (key === 'query') return 'Tìm: ' + value
    return key === 'brand' ? value : carLabel(value)
  }
  const startIndex = result.total ? (result.page - 1) * result.pageSize + 1 : 0
  const endIndex = Math.min(result.page * result.pageSize, result.total)
  return <div className={'page catalog-page' + (compare.length ? ' has-comparison' : '')}>
    <div className="catalog-intro"><div className="page-heading"><span className="section-kicker">Khám phá cùng AutoWise</span><h1>Tìm chiếc xe<br /><em>phù hợp với bạn.</em></h1><p>Khám phá thông số, tham khảo giá và so sánh trước khi lựa chọn.</p></div><div className="catalog-discovery"><form className="catalog-search" onSubmit={e => { e.preventDefault(); clearTimeout(searchTimer.current); change('query', [query.trim()]) }}><label className="catalog-sr-only" htmlFor="catalog-query">Tìm xe</label><svg aria-hidden="true" width="20" height="20" viewBox="0 0 24 24" fill="none"><circle cx="10.5" cy="10.5" r="6.5" stroke="currentColor" strokeWidth="1.8"/><path d="m16 16 5 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/></svg><input id="catalog-query" value={query} onChange={e => { const value = e.target.value; setQuery(value); clearTimeout(searchTimer.current); searchTimer.current = setTimeout(() => change('query', [value.trim()]), 300) }} placeholder="Tìm theo tên xe hoặc hãng…" /><button className="button">Tìm kiếm</button></form><div className="catalog-quick-filters"><span>Khám phá nhanh</span>{[5, 7].map(seats => <button key={seats} className="mini-button" aria-pressed={params.get('seats') === String(seats)} onClick={() => change('seats', [params.get('seats') === String(seats) ? '' : String(seats)])}>{seats} chỗ</button>)}{cars.some(car => car.bodyType === 'SUV') && <button className="mini-button" aria-pressed={params.getAll('bodyType').includes('SUV')} onClick={() => change('bodyType', params.getAll('bodyType').includes('SUV') ? params.getAll('bodyType').filter(value => value !== 'SUV') : [...params.getAll('bodyType'), 'SUV'])}>SUV</button>}<Link to="/chat">Nhờ trợ lý tư vấn ↗</Link></div></div></div>
    <button className="button mobile-filter-button" onClick={() => dialog.current?.showModal()}>Mở bộ lọc{chips.length > 0 && <span>({chips.length})</span>}</button>
    <dialog ref={dialog} className="filter-dialog" aria-label="Bộ lọc xe"><button className="mini-button" onClick={() => dialog.current?.close()}>Đóng bộ lọc</button><div className="filters">{filters('mobile')}<button className="button ghost" onClick={() => setParams({})}>Xóa bộ lọc</button></div></dialog>
    <div className="catalog-layout"><aside className="filters catalog-desktop-filters"><div className="catalog-filter-heading"><h2>Bộ lọc{chips.length > 0 && <span>{chips.length}</span>}</h2><button className="catalog-reset" disabled={!chips.length && !min && !max} onClick={() => { setParams({}); setMin(''); setMax(''); setPriceMessage('') }}>Đặt lại</button></div>{filters('desktop')}</aside><section className="catalog-results" aria-label="Danh sách xe">
      <div className="results-toolbar"><div><strong aria-live="polite">{loading ? 'Đang tải danh sách…' : error ? 'Chưa tải được danh sách' : result.total + ' mẫu xe phù hợp'}</strong>{!loading && !error && <small>Trong {cars.length} mẫu xe đã tải</small>}</div><div className="catalog-toolbar-actions"><label>Sắp xếp<select value={params.get('sort') || 'relevance'} onChange={e => change('sort', [e.target.value])}><option value="relevance">Liên quan</option><option value="price_asc">Giá tăng dần</option><option value="price_desc">Giá giảm dần</option><option value="name_asc">Tên A–Z</option></select></label><div className="catalog-view-toggle" role="group" aria-label="Kiểu hiển thị"><button aria-label="Hiển thị lưới" aria-pressed={view === 'grid'} onClick={() => setView('grid')} title="Lưới"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM14 14h7v7h-7z" stroke="currentColor" strokeWidth="1.5"/></svg></button><button aria-label="Hiển thị danh sách" aria-pressed={view === 'list'} onClick={() => setView('list')} title="Danh sách"><svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M9 5h12M9 12h12M9 19h12M3 5h1M3 12h1M3 19h1" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/></svg></button></div></div></div>
      {chips.length > 0 && <div className="filter-chips"><span>Đang lọc:</span>{chips.map(({ key, value }) => <button className="mini-button" key={key + ':' + value} aria-label={'Xóa bộ lọc ' + key + ': ' + value} onClick={() => change(key, params.getAll(key).filter(x => x !== value))}>{chipLabel(key, value)} <span aria-hidden="true">×</span></button>)}<button className="catalog-reset" onClick={() => setParams({})}>Xóa tất cả</button></div>}
      {loading ? <LoadingSkeleton /> : error ? <ErrorState message="Không thể tải danh sách xe. Các bộ lọc của bạn vẫn được giữ." onRetry={() => setRetry(x => x + 1)} /> : result.total === 0 ? <div className="catalog-empty"><span aria-hidden="true">⌕</span><EmptyState title="Không tìm thấy xe" description="Thử thay đổi từ khóa hoặc bỏ bớt điều kiện để khám phá thêm mẫu xe." /><button className="button" onClick={() => setParams({})}>Xóa bộ lọc</button></div> : <div className={view === 'list' ? 'car-list' : 'car-grid'}>{result.items.map(car => <CarCard key={car.carId} car={car} catalog onCompare={toggleCompare} selected={compare.includes(car.carId)} />)}</div>}
      {!loading && !error && result.total > 0 && <nav className="catalog-pagination" aria-label="Phân trang xe"><small>Hiển thị {startIndex}–{endIndex} / {result.total} xe</small><div><button className="mini-button" disabled={result.page === 1} onClick={() => change('page', [String(result.page - 1)])}>Trang trước</button><span>Trang {result.page}/{result.pageCount}</span><button className="mini-button" disabled={result.page === result.pageCount} onClick={() => change('page', [String(result.page + 1)])}>Trang sau</button></div><label>Số xe mỗi trang<select value={result.pageSize} onChange={e => change('pageSize', [e.target.value])}>{[12, 24, 48].map(n => <option key={n}>{n}</option>)}</select></label></nav>}
      <p className="catalog-disclaimer">Giá mang tính tham khảo và có thể thay đổi theo phiên bản, thời điểm hoặc đại lý. Xem chi tiết xe để kiểm tra nguồn thông tin.</p>
      {compare.length > 0 && <aside className="comparison-tray" aria-label="Xe đã chọn so sánh"><div className="catalog-compare-label"><strong>So sánh xe</strong><small>{compare.length}/3 xe đã chọn</small></div>{compareMessage && <p className="comparison-notice" role="status">{compareMessage}</p>}<div>{compare.map(id => <button className="mini-button" key={id} onClick={() => { setCompare(compare.filter(value => value !== id)); setCompareMessage('') }} aria-label={'Bỏ ' + (cars.find(car => car.carId === id)?.displayName || id)}>{cars.find(car => car.carId === id)?.displayName || id} <span aria-hidden="true">×</span></button>)}</div>{compare.length >= 2 ? <Link className="button" to={'/compare?ids=' + encodeURIComponent(compare.join(','))}>So sánh ({compare.length})</Link> : <button className="button" disabled>Chọn thêm 1 xe</button>}<button className="mini-button" onClick={() => { setCompare([]); setCompareMessage('') }}>Bỏ tất cả xe</button></aside>}
    </section></div>
  </div>
}
