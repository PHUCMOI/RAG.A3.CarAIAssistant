import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import type { Dealer } from '../../entities/dealer/model'
import { DealerCard } from '../../entities/dealer/DealerCard'
import { apiGet } from '../../shared/api/client'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ErrorState } from '../../shared/components/ErrorState'
import { EmptyState } from '../../shared/components/EmptyState'

export default function DealersPage() {
  const [params, setParams] = useSearchParams(); const [dealers, setDealers] = useState<Dealer[] | null>(null); const [error, setError] = useState(false)
  const [loading, setLoading] = useState(true)
  const [retry, setRetry] = useState(0)
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
  const brands = useMemo(() => [...new Set((dealers || []).flatMap(x => x.supportedBrands))].sort(), [dealers]); const cities = useMemo(() => [...new Set((dealers || []).map(x => x.city))].sort(), [dealers])
  const filtered = (dealers || []).filter(x => (!brand || x.supportedBrands.includes(brand)) && (!city || x.city === city))
  function update(key: string, value: string) { const next = new URLSearchParams(params); value ? next.set(key, value) : next.delete(key); setParams(next) }
  return <div className="page"><div className="page-heading"><span className="section-kicker">Mạng lưới đại lý</span><h1>Tìm điểm liên hệ</h1><p>Danh sách đại lý đã được kiểm tra tại ba thành phố lớn.</p></div><div className="inline-filters"><label>Hãng<select value={brand} onChange={e => update('brand', e.target.value)}><option value="">Tất cả hãng</option>{brands.map(x => <option key={x}>{x}</option>)}</select></label><label>Thành phố<select value={city} onChange={e => update('city', e.target.value)}><option value="">Tất cả thành phố</option>{cities.map(x => <option key={x}>{x}</option>)}</select></label><strong>{filtered.length} đại lý</strong></div>{loading ? <LoadingSkeleton /> : error ? <ErrorState onRetry={() => setRetry(x => x + 1)} /> : !filtered.length ? <><EmptyState title="Không tìm thấy đại lý" description="Hãy thử bỏ bớt điều kiện lọc." /><button className="button" onClick={() => setParams({})}>Xóa bộ lọc</button></> : <div className="dealer-grid">{filtered.map(x => <DealerCard key={x.dealerId} dealer={x} />)}</div>}</div>
}
