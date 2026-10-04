import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import type { Car } from '../../entities/car/model'
import type { Dealer } from '../../entities/dealer/model'
import { DealerCard } from '../../entities/dealer/DealerCard'
import { apiGet } from '../../shared/api/client'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ErrorState } from '../../shared/components/ErrorState'

type Warranty = { warrantyId: number; carId: string | null; brandName: string | null; durationMonths: number | null; distanceLimitKm: number | null; conditions: string | null; sourceId: string | null }
function useResource<T>(url: string) {
  const [data, setData] = useState<T | null>(null)
  const [error, setError] = useState(false)
  const [retry, setRetry] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setData(null); setError(false)
    apiGet<T>(url, controller.signal).then(value => { if (!controller.signal.aborted) setData(value) }).catch(() => { if (!controller.signal.aborted) setError(true) })
    return () => controller.abort()
  }, [url, retry])
  return { data, error, retry: () => setRetry(x => x + 1) }
}
export function CarWarranty({ car }: { car: Car }) {
  const resource = useResource<{ items: Warranty[] }>(`/api/warranties?car_id=${encodeURIComponent(car.carId)}&brand=${encodeURIComponent(car.brand)}`)
  const policy = resource.data?.items[0]
  return <aside className="content-panel warranty-panel"><span className="section-kicker">Bảo hành</span>{resource.error ? <ErrorState message="Không tải được chính sách bảo hành." onRetry={resource.retry} /> : !resource.data ? <LoadingSkeleton /> : !policy ? <p>Chưa có chính sách bảo hành. Hãy xác nhận theo VIN và ngày bán.</p> : <><h2>{policy.durationMonths != null ? `${policy.durationMonths} tháng` : 'Chưa rõ thời hạn'}</h2><p>{policy.distanceLimitKm != null ? `${policy.distanceLimitKm.toLocaleString('vi-VN')} km` : 'Chưa rõ giới hạn quãng đường'}</p><p>{policy.conditions || 'Hãy xác nhận điều kiện theo VIN và ngày bán.'}</p>{policy.sourceId ? <Link className="text-link" to={`/sources/${encodeURIComponent(policy.sourceId)}`}>Nguồn chính sách bảo hành →</Link> : <small>Chưa có nguồn chính sách.</small>}</>}</aside>
}
export function CarDealers({ car }: { car: Car }) {
  const resource = useResource<{ items: Dealer[] }>('/api/dealers')
  const dealers = resource.data?.items.filter(dealer => dealer.supportedBrands.some(brand => brand.toLowerCase() === car.brand.toLowerCase())).slice(0, 3) || []
  return <section className="content-panel"><h2>Đại lý hỗ trợ {car.brand}</h2>{resource.error ? <ErrorState message="Không tải được đại lý." onRetry={resource.retry} /> : !resource.data ? <LoadingSkeleton /> : !dealers.length ? <p>Chưa có đại lý phù hợp trong dữ liệu.</p> : <div className="dealer-grid">{dealers.map(dealer => <DealerCard dealer={dealer} key={dealer.dealerId} />)}</div>}<Link className="text-link" to={`/dealers?brand=${encodeURIComponent(car.brand)}`}>Xem toàn bộ đại lý của hãng →</Link></section>
}
