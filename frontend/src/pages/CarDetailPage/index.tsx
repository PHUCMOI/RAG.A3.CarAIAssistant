import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import type { Car } from "../../entities/car/model";
import { apiGet, PublicApiError } from "../../shared/api/client";
import { formatVnd } from "../../shared/formatting/currency";
import { formatDate } from "../../shared/formatting/date";
import { LoadingSkeleton } from "../../shared/components/LoadingSkeleton";
import { ErrorState } from "../../shared/components/ErrorState";
import { request } from "../../features/orders/api";
import { useOrdersSession } from "../../features/orders/Session";
import { useNavigate } from "react-router-dom";
import { CarWarranty, CarDealers } from "../../features/car-search/CarRelatedInfo";
import { carLabel } from "../../entities/car/labels";
import { toggleSelection, useComparisonSelection } from "../../features/car-compare/hooks";
import './detail.css';

export default function CarDetailPage() {
  const { user } = useOrdersSession();
  const navigate = useNavigate();
  const [favoriteMessage, setFavoriteMessage] = useState("");
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useComparisonSelection();
  const [compareMessage, setCompareMessage] = useState('');
  async function favorite() {
    if (!user) {
      navigate("/login?returnTo=" + encodeURIComponent("/account/favorites"));
      return;
    }
    setSaving(true);
    try {
      await request("/my/favorites", "POST", { carId });
      setFavoriteMessage("Đã lưu xe yêu thích.");
    } catch (e) {
      setFavoriteMessage(e instanceof Error ? e.message : "Không thể lưu xe.");
    } finally {
      setSaving(false);
    }
  }
  const { carId } = useParams();
  const [car, setCar] = useState<Car | null>(null);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setCar(null); setError(""); setFavoriteMessage(""); setCompareMessage('');
    if (carId) apiGet<Car>(`/api/cars/${encodeURIComponent(carId)}`, controller.signal)
      .then(value => { if (!controller.signal.aborted) setCar(value); })
      .catch(e => { if (!controller.signal.aborted) setError(e instanceof PublicApiError && e.status === 404 ? "Không tìm thấy mẫu xe này." : "Không kết nối được dữ liệu xe. Vui lòng thử lại."); });
    return () => controller.abort();
  }, [carId, retry]);
  if (error)
    return (
      <div className="page narrow">
        <ErrorState message={error} onRetry={() => setRetry(x => x + 1)} />
      </div>
    );
  if (!car)
    return (
      <div className="page">
        <LoadingSkeleton />
      </div>
    );
  const specs = [
    ["Kiểu thân xe", car.bodyType ? carLabel(car.bodyType) : null],
    ["Nhiên liệu", car.fuelType ? carLabel(car.fuelType) : null],
    ["Hộp số", car.transmission ? carLabel(car.transmission) : null],
    ["Số ghế", car.seats ? `${car.seats}` : null],
    ["Động cơ", car.engine],
    ["Công suất", car.enginePowerHp != null ? `${car.enginePowerHp} mã lực` : null],
    ["Dài × rộng × cao", [car.lengthMm, car.widthMm, car.heightMm].every(x => x != null) ? `${car.lengthMm} × ${car.widthMm} × ${car.heightMm} mm` : null],
    ["Chiều dài cơ sở", car.wheelbaseMm != null ? `${car.wheelbaseMm} mm` : null],
  ];
  return (
    <div className="page car-detail-page">
      <nav className="car-detail-breadcrumb" aria-label="Đường dẫn trang"><Link to="/cars">← Danh sách xe</Link><span aria-hidden="true">/</span><span>{car.displayName}</span></nav>
      <section className="detail-hero">
        <div className="detail-visual">
          <div className="detail-visual-top"><strong>{car.brand}</strong><small>{carLabel(car.bodyType)}</small></div>
          <span aria-hidden="true">{car.brand.slice(0, 1)}</span>
          <div className="detail-visual-bottom"><strong>{car.displayName}</strong><small>Ảnh xe đang được cập nhật</small></div>
        </div>
        <div className="detail-summary">
          <div className="detail-eyebrow">
            <span>{car.brand}</span>
            <span>{carLabel(car.marketStatusVn)}</span>
          </div>
          <h1>{car.displayName}</h1>
          <p className="detail-description">{car.description || 'Thông tin mô tả đang được cập nhật.'}</p>
          <div className="detail-quick-facts">{[car.bodyType && carLabel(car.bodyType), car.seats && `${car.seats} chỗ`, car.fuelType && carLabel(car.fuelType), car.transmission && carLabel(car.transmission)].filter(Boolean).map((fact, index) => <span key={index}>{fact}</span>)}</div>
          <div className="detail-price-box"><span>Giá tham khảo từ</span><strong className="detail-price">{formatVnd(car.priceVndFrom)}</strong><div className="detail-price-meta"><small>Cập nhật: {formatDate(car.priceAsOf)}</small>{car.priceSourceId ? <Link to={`/sources/${encodeURIComponent(car.priceSourceId)}`}>Xem nguồn giá ↗</Link> : <small>Chưa có nguồn giá</small>}</div><p>Giá thực tế tùy phiên bản và đại lý. Xác nhận trước khi đặt mua.</p></div>
          <div className="detail-actions">
            <Link
              className="button"
              to={`/account/purchase-requests/new?carId=${encodeURIComponent(car.carId)}`}
            >
              Yêu cầu mua xe
            </Link>
            <Link className="button secondary" to={`/chat?car=${encodeURIComponent(car.carId)}&carName=${encodeURIComponent(car.displayName)}`}>
              Hỏi về xe này
            </Link>
          </div>
          <div className="detail-secondary-actions"><button disabled={saving} onClick={() => void favorite()}>{saving ? 'Đang lưu…' : '♡ Lưu yêu thích'}</button><button aria-pressed={selected.includes(car.carId)} onClick={() => { const result = toggleSelection(selected, car.carId); if (!result.message) setSelected(result.ids); setCompareMessage(result.message); }}>{selected.includes(car.carId) ? '✓ Đã chọn so sánh' : '+ So sánh xe này'}</button><a href="#detail-dealers">Tìm đại lý ↗</a></div>
          {favoriteMessage && <p className="detail-action-feedback" role="status">{favoriteMessage}</p>}
          {compareMessage && <p className="detail-action-feedback" role="status">{compareMessage}</p>}
          {selected.length > 0 && <div className="detail-comparison-note"><span>Đã chọn {selected.length}/3 xe để so sánh</span><Link to={`/compare?ids=${encodeURIComponent(selected.join(','))}`}>Mở bảng so sánh →</Link></div>}
        </div>
      </section>
      <nav className="detail-section-nav" aria-label="Nội dung chi tiết xe"><a href="#detail-specs">Thông số kỹ thuật</a><a href="#detail-warranty">Chính sách bảo hành</a><a href="#detail-dealers">Đại lý hỗ trợ</a>{car.presenceSourceId && <Link to={`/sources/${encodeURIComponent(car.presenceSourceId)}`}>Nguồn thông tin xe ↗</Link>}</nav>
      <div className="detail-grid" id="detail-specs">
        <section className="content-panel">
          <span className="section-kicker">Thông số</span>
          <h2>Thông số kỹ thuật</h2>
          <dl className="spec-grid">
            {specs.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd className={!value ? 'detail-missing' : undefined}>{value || "Chưa có dữ liệu"}</dd>
              </div>
            ))}
          </dl>
        </section>
        <div id="detail-warranty"><CarWarranty key={car.carId} car={car} /></div>
      </div>
      <div id="detail-dealers"><CarDealers key={car.carId} car={car} /></div>
    </div>
  );
}
