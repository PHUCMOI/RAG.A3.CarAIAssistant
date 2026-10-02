import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Car, CarListResponse } from '../../entities/car/model'
import { apiGet } from '../../shared/api/client'
import { formatVnd } from '../../shared/formatting/currency'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ErrorState } from '../../shared/components/ErrorState'
import { ComparisonTable } from '../../features/car-compare/ComparisonTable'
import { normalizeSelection, saveComparison } from '../../features/car-compare/hooks'

type Comparison = { items: Car[]; missingIds: string[] }
export default function ComparePage() {
  const [params, setParams] = useSearchParams()
  const raw = params.get('ids') || ''
  const selectionKey = normalizeSelection(raw).join(',')
  const ids = useMemo(() => selectionKey ? selectionKey.split(',') : [], [selectionKey])
  const [cars, setCars] = useState<Car[]>([])
  const [missingIds, setMissingIds] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [notice, setNotice] = useState('')
  const [picker, setPicker] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [catalogue, setCatalogue] = useState<Car[]>([])
  const [catalogueLoading, setCatalogueLoading] = useState(true)
  const [catalogueError, setCatalogueError] = useState(false)
  const [catalogueAttempt, setCatalogueAttempt] = useState(0)
  const [differences, setDifferences] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [shareUrl, setShareUrl] = useState('')

  useEffect(() => {
    if (raw !== selectionKey) {
      setNotice('Lựa chọn đã được chuẩn hóa: tối đa 3 xe khác nhau.')
      const next = new URLSearchParams(params)
      selectionKey ? next.set('ids', selectionKey) : next.delete('ids')
      setParams(next, { replace: true })
    }
    saveComparison(ids)
    setShareMessage(''); setShareUrl('')
  }, [raw, selectionKey, ids, params, setParams])

  useEffect(() => {
    const controller = new AbortController()
    setCars([]); setMissingIds([]); setError(false)
    if (!ids.length) { setLoading(false); return }
    setLoading(true)
    async function load() {
      try {
        let result: Comparison
        if (ids.length === 1) {
          const response = await fetch(`/api/cars/${encodeURIComponent(ids[0])}`, { signal: controller.signal })
          if (response.status === 404) result = { items: [], missingIds: ids }
          else { if (!response.ok) throw new Error('Car request failed'); result = { items: [await response.json()], missingIds: [] } }
        } else result = await apiGet<Comparison>(`/api/cars/compare?ids=${encodeURIComponent(selectionKey)}`, controller.signal)
        if (!controller.signal.aborted) { setCars(result.items); setMissingIds(result.missingIds) }
      } catch { if (!controller.signal.aborted) setError(true) }
      finally { if (!controller.signal.aborted) setLoading(false) }
    }
    void load()
    return () => controller.abort()
  }, [ids, selectionKey, attempt])

  useEffect(() => {
    const controller = new AbortController()
    setCatalogueLoading(true); setCatalogueError(false)
    apiGet<CarListResponse>('/api/cars?limit=100', controller.signal)
      .then(result => { if (!controller.signal.aborted) setCatalogue(result.items) })
      .catch(() => { if (!controller.signal.aborted) setCatalogueError(true) })
      .finally(() => { if (!controller.signal.aborted) setCatalogueLoading(false) })
    return () => controller.abort()
  }, [catalogueAttempt])

  function select(nextIds: string[]) {
    const next = new URLSearchParams(params)
    nextIds.length ? next.set('ids', nextIds.join(',')) : next.delete('ids')
    setParams(next)
    setNotice(''); setPicker(null); setQuery('')
  }
  function openPicker(index: number) { setPicker(index); setQuery('') }
  function choose(car: Car) {
    if (picker == null) return
    const next = [...ids]
    if (picker < ids.length) next[picker] = car.carId
    else if (ids.length < 3) next.push(car.carId)
    select(next)
  }
  async function share() {
    const url = new URL('/compare', window.location.origin)
    if (selectionKey) url.searchParams.set('ids', selectionKey)
    try { await navigator.clipboard.writeText(url.href); setShareMessage('Đã sao chép liên kết.'); setShareUrl('') }
    catch { setShareUrl(url.href); setShareMessage('Hãy sao chép liên kết bên dưới.') }
  }
  const candidates = catalogue.filter(car => !ids.some((id, index) => id === car.carId && index !== picker)
    && `${car.brand} ${car.displayName} ${car.aliases.join(' ')}`.toLocaleLowerCase('vi').includes(query.trim().toLocaleLowerCase('vi')))

  return <div className="page compare-page"><Link className="back-link" to="/cars">← Kho dữ liệu xe</Link>
    <div className="page-heading"><span className="section-kicker">Đặt cạnh nhau</span><h1>So sánh xe</h1><p>Chọn 2–3 mẫu xe để đối chiếu giá, thông số và nguồn dữ liệu.</p></div>
    <div className="compare-toolbar"><strong>{ids.length}/3 xe đã chọn</strong><button className="button secondary" onClick={share}>Sao chép liên kết</button></div>
    {shareMessage && <p role="status">{shareMessage}</p>}{shareUrl && <input className="compare-share-url" aria-label="Liên kết so sánh" value={shareUrl} readOnly onFocus={event => event.target.select()} />}
    {notice && <p className="compare-notice" role="status">{notice}</p>}
    <div className="compare-slots">{ids.map((id, index) => {
      const car = cars.find(item => item.carId === id)
      return <section className="content-panel compare-slot" key={id}><span className="section-kicker">Xe {index + 1}</span>
        {car ? <><span className="brand-token" aria-hidden="true">{car.brand.slice(0, 1)}</span><h2><Link to={`/cars/${encodeURIComponent(id)}`}>{car.displayName}</Link></h2><strong>{formatVnd(car.priceVndFrom)}</strong></> : <h2>{missingIds.includes(id) ? 'Không tìm thấy xe' : loading ? 'Đang tải xe…' : 'Xe đã chọn'}<small>{id}</small></h2>}
        <div className="compare-slot-actions"><button className="mini-button" onClick={() => openPicker(index)} aria-label={`Thay ${car?.displayName || id}`}>Thay xe</button><button className="mini-button" onClick={() => select(ids.filter(value => value !== id))} aria-label={`Xóa ${car?.displayName || id}`}>Xóa xe</button></div>
      </section>
    })}{ids.length < 3 && <section className="content-panel compare-slot compare-add"><h2>{ids.length ? 'Thêm mẫu xe' : 'Bắt đầu so sánh'}</h2><p>{ids.length < 2 ? 'Cần ít nhất 2 mẫu xe để so sánh.' : 'Bạn có thể thêm một xe nữa.'}</p><button className="button" onClick={() => openPicker(ids.length)}>+ Chọn xe</button></section>}</div>
    {picker !== null && <section className="content-panel compare-picker" aria-label="Bộ chọn xe"><div className="compare-toolbar"><h2>{picker < ids.length ? 'Thay mẫu xe' : 'Chọn mẫu xe'}</h2><button className="mini-button" onClick={() => setPicker(null)}>Hủy</button></div><label>Tìm xe theo tên hoặc hãng<input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Ví dụ: Honda CR-V" /></label>
      {catalogueLoading ? <LoadingSkeleton /> : catalogueError ? <ErrorState onRetry={() => setCatalogueAttempt(value => value + 1)} /> : candidates.length ? <ul>{candidates.map(car => <li key={car.carId}><div><strong>{car.displayName}</strong><small>{car.brand} · {formatVnd(car.priceVndFrom)}</small></div><button className="mini-button" onClick={() => choose(car)} aria-label={`Chọn ${car.displayName}`}>Chọn</button></li>)}</ul> : <p>Không có mẫu xe phù hợp. Hãy thử từ khóa khác.</p>}
    </section>}
    {missingIds.length > 0 && <p className="compare-notice" role="status">Không tìm thấy: {missingIds.join(', ')}. Hãy thay hoặc xóa xe này.</p>}
    {loading ? <LoadingSkeleton label="Đang tải dữ liệu so sánh…" /> : error ? <ErrorState message="Không thể tải dữ liệu so sánh. Lựa chọn của bạn vẫn được giữ." onRetry={() => setAttempt(value => value + 1)} /> : cars.length >= 2 ? <><label className="compare-differences"><input type="checkbox" checked={differences} onChange={event => setDifferences(event.target.checked)} />Chỉ xem thông tin khác nhau</label><ComparisonTable cars={cars} differences={differences} /></> : ids.length > 0 && <p className="state-card">Hãy chọn thêm xe để có ít nhất hai mẫu hợp lệ.</p>}
    <p className="compare-disclaimer">Thông tin tham khảo ở cấp model, có thể khác theo phiên bản và đời xe. Giá đi kèm ngày và nguồn; xe lịch sử hoặc nhập tư nhân không đồng nghĩa đang phân phối chính hãng. Xác nhận giá và bảo hành với đại lý theo VIN/ngày bán.</p>
  </div>
}
