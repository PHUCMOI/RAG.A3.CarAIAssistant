import type { Dealer } from './model'
import { formatDate } from '../../shared/formatting/date'
import { Link } from 'react-router-dom'
import { cityLabel, dealerWebsite } from '../../features/dealer-filter/search'

export function DealerCard({ dealer }: { dealer: Dealer }) {
  const website = dealerWebsite(dealer.website)
  const phone = dealer.phone?.replace(/[^\d+]/g, '')
  const map = dealer.address?.trim() ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent([dealer.name, dealer.address, dealer.city, 'Vietnam'].filter(Boolean).join(', '))}` : null
  const checked = dealer.checkedAt && !Number.isNaN(Date.parse(dealer.checkedAt)) ? formatDate(dealer.checkedAt) : 'Chưa cập nhật'
  return <article className="dealer-card">
    <div className="dealer-card-top"><div className="dealer-icon" aria-hidden="true"><svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 21V7l8-4 8 4v14H4Z" stroke="currentColor" strokeWidth="1.5"/><path d="M9 21v-6h6v6M8 9h1m6 0h1M8 12h1m6 0h1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/></svg></div><div className="dealer-brand-tags">{dealer.supportedBrands.map(brand => <span key={brand}>{brand}</span>)}</div><span className="dealer-city-badge">{cityLabel(dealer.city)}</span></div>
    <h3>{dealer.name}</h3><p className="dealer-address"><span aria-hidden="true">⌖</span>{dealer.address || 'Chưa có địa chỉ'}</p>
    <div className="dealer-contact"><span>Liên hệ đại lý</span>{phone && /\d/.test(phone) ? <a href={`tel:${phone}`} aria-label={`Gọi ${dealer.name}: ${dealer.phone}`}><span aria-hidden="true">↗</span> {dealer.phone}</a> : <small>Chưa có số điện thoại</small>}</div>
    <div className="dealer-card-actions">{map && <a className="button secondary" href={map} target="_blank" rel="noopener noreferrer">Xem bản đồ <span aria-hidden="true">↗</span><span className="dealers-sr-only"> (mở tab mới)</span></a>}{website && <a className="text-link" href={website} target="_blank" rel="noopener noreferrer">Website đại lý <span aria-hidden="true">↗</span><span className="dealers-sr-only"> (mở tab mới)</span></a>}</div>
    <footer className="dealer-card-footer"><small>Ngày kiểm tra: {checked}</small>{dealer.sourceId && <Link to={`/sources/${encodeURIComponent(dealer.sourceId)}`}>Xem nguồn ↗</Link>}</footer>
  </article>
}
