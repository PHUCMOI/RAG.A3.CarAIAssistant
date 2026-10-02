import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import type { Source } from '../../entities/source/model'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ErrorState } from '../../shared/components/ErrorState'
import { formatDate } from '../../shared/formatting/date'

const typeLabels: Record<string, string> = {
  dataset: 'Bộ dữ liệu', official: 'Nguồn chính thức',
  market_reference: 'Tham khảo thị trường', manufacturer: 'Nhà sản xuất',
}
const groups = [
  ['cars', 'Thông tin xe'], ['prices', 'Giá tham khảo'],
  ['warranties', 'Chính sách bảo hành'], ['dealers', 'Đại lý'], ['documents', 'Tài liệu'],
] as const

function externalUrl(value: string) {
  try {
    const url = new URL(value)
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null
  } catch { return null }
}

export default function SourceDetailPage() {
  const { sourceId } = useParams()
  const [source, setSource] = useState<Source | null>(null)
  const [error, setError] = useState<'missing' | 'network' | null>(null)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    const controller = new AbortController()
    setSource(null)
    setError(null)
    if (!sourceId) { setError('missing'); return }
    async function load() {
      try {
        const response = await fetch(`/api/sources/${encodeURIComponent(sourceId!)}`, { signal: controller.signal })
        if (controller.signal.aborted) return
        if (response.status === 404) { setError('missing'); return }
        if (!response.ok) throw new Error('Source request failed')
        const data: Source = await response.json()
        if (!controller.signal.aborted) setSource(data)
      } catch {
        if (!controller.signal.aborted) setError('network')
      }
    }
    void load()
    return () => controller.abort()
  }, [sourceId, attempt])

  const back = <Link className="back-link" to="/cars">← Quay lại kho xe</Link>
  if (error) return <div className="page narrow">{back}<ErrorState
    message={error === 'missing' ? 'Không tìm thấy nguồn dữ liệu này.' : 'Không thể tải nguồn dữ liệu. Vui lòng thử lại.'}
    onRetry={error === 'network' ? () => setAttempt(value => value + 1) : undefined} /></div>
  if (!source) return <div className="page narrow">{back}<LoadingSkeleton label="Đang tải nguồn dữ liệu…" /></div>
  const url = source.sourceType === 'dataset' ? null : externalUrl(source.url)
  const references = groups.filter(([key]) => source.references[key].length > 0)
  return <div className="page source-page">
    <nav className="source-breadcrumb" aria-label="Đường dẫn"><Link to="/">Trang chủ</Link><span>/</span><Link to="/cars">Kho xe</Link><span>/</span><span>Nguồn dữ liệu</span></nav>
    <header className="page-heading source-heading"><span className="section-kicker">Minh bạch dữ liệu</span><h1>{source.title}</h1><span className="source-type">{typeLabels[source.sourceType] || source.sourceType}</span></header>
    <div className="source-layout">
      <section className="content-panel source-metadata"><h2>Thông tin nguồn</h2><dl>
        <div><dt>Mã nguồn</dt><dd><code>{source.sourceId}</code></dd></div>
        <div><dt>Phạm vi thông tin</dt><dd>{source.supports || 'Chưa có mô tả phạm vi hỗ trợ.'}</dd></div>
        <div><dt>Ngày kiểm tra</dt><dd><time dateTime={source.checkedAt}>{formatDate(source.checkedAt)}</time><small>Ngày dự án kiểm tra nguồn, không phải ngày xuất bản.</small></dd></div>
        <div><dt>Địa chỉ nguồn</dt><dd className="source-address">{source.url || 'Chưa có địa chỉ nguồn'}</dd></div>
      </dl>{url ? <a className="button" href={url} target="_blank" rel="noopener noreferrer">Mở nguồn bên ngoài ↗</a> : <p className="source-note">Nguồn nội bộ hoặc địa chỉ không hỗ trợ mở trên trình duyệt.</p>}</section>
      <aside className="content-panel source-disclaimer"><span className="section-kicker">Cách sử dụng</span><h2>Đọc đúng phạm vi</h2><p>Nguồn chỉ hỗ trợ các thông tin được nêu trong phạm vi. Không dùng nguồn này để suy ra giá, phiên bản hay thông số khác.</p><p>Giá và thông số là dữ liệu tham khảo. Hãy xác nhận thông tin hiện tại với hãng hoặc đại lý trước khi quyết định.</p>{url && <small>Liên kết bên ngoài mở một tab mới và đưa bạn ra khỏi AutoWise.</small>}</aside>
    </div>
    {references.length > 0 && <section className="section source-references"><div className="section-heading"><div><span className="section-kicker">Dữ liệu liên quan</span><h2>Đang tham chiếu nguồn này</h2></div></div><div className="source-reference-grid">{references.map(([key, title]) => <section className="content-panel" key={key}><h3>{title} <span className="source-count">{source.references[key].length}</span></h3><ul>{source.references[key].map(record => <li key={record.recordId}>{record.carId ? <Link className="text-link" to={`/cars/${encodeURIComponent(record.carId)}`}>{record.label} →</Link> : key === 'dealers' ? <Link className="text-link" to="/dealers">{record.label} →</Link> : <span>{record.label}</span>}</li>)}</ul></section>)}</div></section>}
  </div>
}
