import { Link } from 'react-router-dom'
import type { Car } from './model'
import { formatVnd } from '../../shared/formatting/currency'

export function CarCard({ car, onCompare, selected }: { car: Car; onCompare?: (car: Car) => void; selected?: boolean }) {
  return <article className="car-card">
    <Link className="car-visual" to={`/cars/${car.carId}`} aria-label={`Xem ${car.displayName}`}>
      <span>{car.brand.slice(0, 1)}</span><small>{car.bodyType || 'Vehicle'}</small>
    </Link>
    <div className="car-card-body">
      <div className="eyebrow"><span>{car.brand}</span><span>{car.marketStatusVn.replaceAll('_', ' ')}</span></div>
      <Link to={`/cars/${car.carId}`}><h3>{car.displayName}</h3></Link>
      <div className="car-facts"><span>{car.seats ? `${car.seats} chỗ` : 'Chưa rõ số ghế'}</span><span>{car.fuelType || 'Chưa rõ nhiên liệu'}</span></div>
      <strong className="price">{formatVnd(car.priceVndFrom)}</strong>
      <div className="card-actions"><Link className="text-link" to={`/cars/${car.carId}`}>Xem chi tiết</Link>{onCompare && <button className="mini-button" onClick={() => onCompare(car)}>{selected ? 'Đã chọn' : '+ So sánh'}</button>}</div>
    </div>
  </article>
}
