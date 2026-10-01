import type { Dealer } from './model'
import { formatDate } from '../../shared/formatting/date'

export function DealerCard({ dealer }: { dealer: Dealer }) {
  return <article className="dealer-card">
    <div className="dealer-icon">⌖</div>
    <div><div className="eyebrow"><span>{dealer.supportedBrands.join(', ')}</span><span>{dealer.city}</span></div><h3>{dealer.name}</h3><p>{dealer.address}</p><small>Kiểm tra: {formatDate(dealer.checkedAt)}</small>
      <div className="card-actions">{dealer.phone && <a className="text-link" href={`tel:${dealer.phone.replace(/\s/g, '')}`}>{dealer.phone}</a>}{dealer.website && <a className="mini-button" href={dealer.website} target="_blank" rel="noreferrer">Website ↗</a>}</div>
    </div>
  </article>
}
