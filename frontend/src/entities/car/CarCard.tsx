import { Link } from 'react-router-dom'
import type { Car } from './model'
import { formatVnd } from '../../shared/formatting/currency'
import { carLabel } from './labels'

export function CarCard({ car, onCompare, selected, catalog = false }: { car: Car; onCompare?: (car: Car) => void; selected?: boolean; catalog?: boolean }) {
  return <article className={`car-card${selected ? ' is-selected' : ''}`}>
    <Link className="car-visual" to={`/cars/${car.carId}`} aria-label={`Xem ${car.displayName}`}>
      <span aria-hidden="true">{car.brand.slice(0, 1)}</span><small>{car.bodyType ? carLabel(car.bodyType) : 'Ô tô'}</small>{catalog && <em className="catalog-image-note">Hình đại diện</em>}
    </Link>
    <div className="car-card-body">
      <div className="eyebrow"><span>{car.brand}</span><span>{catalog ? carLabel(car.marketStatusVn) : car.marketStatusVn.replaceAll('_', ' ')}</span></div>
      <Link to={`/cars/${car.carId}`}><h3>{car.displayName}</h3></Link>
      <div className="car-facts"><span>{car.seats ? `${car.seats} chỗ` : 'Chưa rõ số ghế'}</span><span>{car.fuelType ? catalog ? carLabel(car.fuelType) : car.fuelType : 'Chưa rõ nhiên liệu'}</span>{catalog && car.transmission && <span>{carLabel(car.transmission)}</span>}</div>
      {catalog && car.priceVndFrom != null && <small className="catalog-price-label">Giá tham khảo từ</small>}
      <strong className="price">{formatVnd(car.priceVndFrom)}</strong>
      <div className="card-actions"><Link className="text-link" to={`/cars/${car.carId}`}>Xem chi tiết{catalog && <span aria-hidden="true"> ↗</span>}</Link>{onCompare && <button className="mini-button" aria-pressed={Boolean(selected)} onClick={() => onCompare(car)}>{selected ? 'Đã chọn' : '+ So sánh'}</button>}</div>
    </div>
  </article>
}
