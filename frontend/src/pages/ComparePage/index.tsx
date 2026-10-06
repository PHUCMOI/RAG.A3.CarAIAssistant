import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import type { Car, CarListResponse } from '../../entities/car/model'
import { apiGet } from '../../shared/api/client'
import { formatVnd } from '../../shared/formatting/currency'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ErrorState } from '../../shared/components/ErrorState'
import { ComparisonTable } from '../../features/car-compare/ComparisonTable'
import { normalizeSelection, readSavedComparison, saveComparison } from '../../features/car-compare/hooks'

import { carLabel } from '../../entities/car/labels'
import { normalizeText } from '../../features/car-search/catalog'
import './compare.css'

type Comparison = { items: Car[]; missingIds: string[] }
export default function ComparePage() {
  const [params, setParams] = useSearchParams()
  const [saved] = useState(readSavedComparison)
  const raw = params.has('ids') ? params.get('ids') || '' : saved.join(',')
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
  const [brand, setBrand] = useState('')
  const pickerDialog = useRef<HTMLDialogElement>(null)
  const pickerTrigger = useRef<HTMLElement | null>(null)
  const pickerIndex = useRef(0)
  const [catalogue, setCatalogue] = useState<Car[]>([])
  const [catalogueLoading, setCatalogueLoading] = useState(true)
  const [catalogueError, setCatalogueError] = useState(false)
  const [catalogueAttempt, setCatalogueAttempt] = useState(0)
  const [differences, setDifferences] = useState(false)
  const [shareMessage, setShareMessage] = useState('')
  const [shareUrl, setShareUrl] = useState('')

  useEffect(() => {
    if (raw !== selectionKey || (!params.has('ids') && selectionKey)) {
      if (raw !== selectionKey) setNotice('Lựa chọn đã được chuẩn hóa: tối đa 3 xe khác nhau.')
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
    next.set('ids', nextIds.join(','))
    setParams(next)
    setNotice(''); setPicker(null); setQuery('')
  }
  function openPicker(index: number) { pickerTrigger.current = document.activeElement as HTMLElement; pickerIndex.current = index; setPicker(index); setQuery(''); setBrand('') }
  useEffect(() => {
    if (picker !== null) { pickerDialog.current?.showModal(); pickerDialog.current?.querySelector('input')?.focus() }
    else if (pickerDialog.current?.open) pickerDialog.current.close()
  }, [picker])
  function closePicker() {
    setPicker(null)
    if (pickerTrigger.current?.isConnected) pickerTrigger.current.focus()
    else document.querySelectorAll('.compare-slot')[pickerIndex.current]?.querySelector<HTMLButtonElement>('.compare-slot-actions button, .compare-add button')?.focus()
  }
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
    && (!brand || car.brand === brand) && normalizeText(car.brand + ' ' + car.displayName + ' ' + car.aliases.join(' ')).includes(normalizeText(query)))
    .sort((a, b) => a.displayName.localeCompare(b.displayName, 'vi'))
  const orderedCars = ids.flatMap(id => { const car = cars.find(item => item.carId === id); return car ? [car] : [] })

  return <div className="page compare-page"><Link className="back-link" to="/cars">← Khám phá xe</Link>
    <div className="compare-intro"><div className="page-heading"><span className="section-kicker">Lựa chọn rõ ràng hơn</span><h1>Đặt cạnh nhau.<br /><em>Chọn xe tự tin hơn.</em></h1><p>Đối chiếu giá, khả năng vận hành và không gian của tối đa 3 mẫu xe.</p></div><div className="compare-intro-actions"><span className="compare-selection-count">{ids.length}/3 xe đã chọn</span><button className="button secondary" disabled={!ids.length} onClick={share}>Sao chép liên kết <span aria-hidden="true">↗</span></button>{ids.length > 0 && <button className="compare-text-button" onClick={() => select([])}>Xóa tất cả xe</button>}</div></div>
    {shareMessage && <p className="compare-share-feedback" role="status">{shareMessage}</p>}{shareUrl && <input className="compare-share-url" aria-label="Liên kết so sánh" value={shareUrl} readOnly onFocus={event => event.target.select()} />}
    {notice && <p className="compare-notice" role="status">{notice}</p>}
    <div className="compare-slots">{[0, 1, 2].map(index => {
      const id = ids[index]
      const car = orderedCars.find(item => item.carId === id)
      return id ? <section className="compare-slot" key={id}><div className="compare-slot-top"><span>XE {index + 1}</span><button className="compare-remove" onClick={() => select(ids.filter(value => value !== id))} aria-label={'Xóa ' + (car?.displayName || id)} title="Xóa xe">×</button></div>
        {car ? <><div className="compare-vehicle-heading"><span className="compare-brand-avatar" aria-hidden="true">{car.brand.slice(0, 1)}</span><div><small>{car.brand} · {carLabel(car.bodyType)}</small><h2><Link to={'/cars/' + encodeURIComponent(id)}>{car.displayName}</Link></h2></div></div><div className="compare-vehicle-facts"><span>{car.seats ? car.seats + ' chỗ' : 'Chưa rõ số ghế'}</span><span>{carLabel(car.fuelType)}</span><span>{carLabel(car.transmission)}</span></div><div className="compare-vehicle-price"><small>{car.priceVndFrom == null ? 'Giá tham khảo' : 'Giá tham khảo từ'}</small><strong>{formatVnd(car.priceVndFrom)}</strong></div></> : <div className="compare-slot-unavailable"><h2>{missingIds.includes(id) ? 'Không tìm thấy xe' : loading ? 'Đang tải xe…' : error ? 'Chưa tải được xe' : 'Xe đã chọn'}</h2><small>{id}</small></div>}
        <div className="compare-slot-actions"><button className="mini-button" onClick={() => openPicker(index)} aria-label={'Thay ' + (car?.displayName || id)}>⇄ Thay xe</button>{car && <Link className="text-link" to={'/cars/' + encodeURIComponent(id)}>Xem chi tiết ↗</Link>}</div>
      </section> : <section className="compare-slot compare-add" key={'empty-' + index}><span className="compare-add-mark" aria-hidden="true">+</span><h2>{index === 0 ? 'Chọn chiếc xe đầu tiên' : index === 1 ? 'Thêm xe để đối chiếu' : 'Thêm lựa chọn thứ ba'}</h2><p>{index === 2 ? 'Tùy chọn · tối đa 3 mẫu xe' : 'Chọn ít nhất 2 xe để bắt đầu so sánh'}</p><button className="button secondary" onClick={() => openPicker(ids.length)} aria-label={'Chọn xe ' + (index + 1)}>+ Chọn xe</button></section>
    })}</div>
    <dialog ref={pickerDialog} className="compare-picker-dialog" aria-label="Bộ chọn xe" onClose={closePicker} onClick={event => { if (event.target === event.currentTarget) setPicker(null) }}><div className="compare-picker"><header><div><span className="section-kicker">Khám phá xe</span><h2>{picker !== null && picker < ids.length ? 'Thay mẫu xe' : 'Chọn mẫu xe so sánh'}</h2></div><button className="compare-remove" onClick={() => setPicker(null)} aria-label="Đóng bộ chọn xe">×</button></header><div className="compare-picker-search"><label>Tìm xe theo tên hoặc hãng<input autoFocus value={query} onChange={event => setQuery(event.target.value)} placeholder="Ví dụ: Honda CR-V" /></label><label>Hãng xe<select value={brand} onChange={event => setBrand(event.target.value)}><option value="">Tất cả hãng</option>{[...new Set(catalogue.map(car => car.brand))].sort().map(value => <option key={value}>{value}</option>)}</select></label></div>
      {catalogueLoading ? <LoadingSkeleton /> : catalogueError ? <ErrorState onRetry={() => setCatalogueAttempt(value => value + 1)} /> : <><p className="compare-picker-count">{candidates.length} mẫu xe có thể chọn trong danh sách đã tải</p>{candidates.length ? <ul>{candidates.map(car => <li key={car.carId}><span className="compare-picker-avatar" aria-hidden="true">{car.brand.slice(0, 1)}</span><div><strong>{car.displayName}</strong><small>{car.brand} · {carLabel(car.bodyType)} · {formatVnd(car.priceVndFrom)}</small></div><button className="mini-button" disabled={car.carId === ids[picker ?? -1]} onClick={() => choose(car)} aria-label={'Chọn ' + car.displayName}>{car.carId === ids[picker ?? -1] ? 'Đang chọn' : 'Chọn'}</button></li>)}</ul> : <p className="compare-picker-empty">Không tìm thấy xe. Thử từ khóa khác hoặc chọn tất cả hãng.</p>}</>}
    </div></dialog>
    {missingIds.length > 0 && <p className="compare-notice" role="status">Có {missingIds.length} xe không còn trong dữ liệu. Hãy thay hoặc xóa xe ở phía trên.</p>}
    {loading ? <LoadingSkeleton label="Đang tải dữ liệu so sánh…" /> : error ? <ErrorState message="Không thể tải dữ liệu so sánh. Lựa chọn của bạn vẫn được giữ." onRetry={() => setAttempt(value => value + 1)} /> : orderedCars.length >= 2 ? <section className="compare-table-section" aria-label="Đối chiếu thông số"><div className="compare-table-toolbar"><div><h2>So sánh chi tiết</h2><p><span className="compare-diff-dot" aria-hidden="true" />Dòng có dấu xanh thể hiện thông tin khác nhau</p></div><label className="compare-differences"><input type="checkbox" checked={differences} onChange={event => setDifferences(event.target.checked)} /><span>Chỉ xem thông tin khác nhau</span></label></div><ComparisonTable cars={orderedCars} differences={differences} /></section> : <div className="compare-start-hint"><span aria-hidden="true">⇄</span><div><strong>{ids.length ? 'Chọn đủ xe hợp lệ để đối chiếu' : 'Bắt đầu với những mẫu xe bạn quan tâm'}</strong><p>Chọn ít nhất 2 xe hợp lệ. Các thông số sẽ được đặt cạnh nhau ngay tại đây.</p></div><Link to="/cars">Khám phá danh sách xe ↗</Link></div>}
    <div className="compare-disclaimer"><strong>Thông tin trước khi quyết định</strong><p>Dữ liệu tham khảo ở cấp model, có thể khác theo phiên bản và đời xe. Giá đi kèm ngày và nguồn; xe lịch sử hoặc nhập tư nhân không đồng nghĩa đang phân phối chính hãng. Xác nhận giá và bảo hành với đại lý theo VIN/ngày bán.</p></div>
  </div>
}
