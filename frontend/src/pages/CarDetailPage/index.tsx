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

export default function CarDetailPage() {
  const { user } = useOrdersSession();
  const navigate = useNavigate();
  const [favoriteMessage, setFavoriteMessage] = useState("");
  const [saving, setSaving] = useState(false);
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
    setCar(null); setError(""); setFavoriteMessage("");
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
    ["Kiểu thân xe", car.bodyType],
    ["Nhiên liệu", car.fuelType],
    ["Hộp số", car.transmission],
    ["Số ghế", car.seats ? `${car.seats}` : null],
    ["Động cơ", car.engine],
    ["Công suất", car.enginePowerHp != null ? `${car.enginePowerHp} mã lực` : null],
    ["Dài × rộng × cao", [car.lengthMm, car.widthMm, car.heightMm].every(x => x != null) ? `${car.lengthMm} × ${car.widthMm} × ${car.heightMm} mm` : null],
    ["Chiều dài cơ sở", car.wheelbaseMm != null ? `${car.wheelbaseMm} mm` : null],
  ];
  return (
    <div className="page">
      <Link className="back-link" to="/cars">
        ← Quay lại danh sách
      </Link>
      <section className="detail-hero">
        <div className="detail-visual">
          <span>{car.brand.slice(0, 1)}</span>
          <small>{car.bodyType || "Vehicle profile"}</small>
        </div>
        <div className="detail-summary">
          <div className="eyebrow">
            <span>{car.brand}</span>
            <span>{car.marketStatusVn.replaceAll("_", " ")}</span>
          </div>
          <h1>{car.displayName}</h1>
          <p>{car.description}</p>
          <strong className="detail-price">
            {car.priceVndFrom != null ? `Giá tham khảo từ ${formatVnd(car.priceVndFrom)}` : "Chưa có giá tham khảo"}
          </strong>
          <small>
            Cập nhật: {formatDate(car.priceAsOf)} · Nguồn:{" "}
            {car.priceSourceId ? <Link className="text-link" to={`/sources/${encodeURIComponent(car.priceSourceId)}`}>{car.priceSourceId}</Link> : "Chưa có nguồn giá"}
          </small>
          <div className="detail-actions">
            <Link
              className="button"
              to={`/account/purchase-requests/new?carId=${encodeURIComponent(car.carId)}`}
            >
              Yêu cầu mua xe
            </Link>
            <button
              className="button secondary"
              disabled={saving}
              onClick={() => void favorite()}
            >
              Lưu yêu thích
            </button>
            {favoriteMessage && <p role="status">{favoriteMessage}</p>}
            <Link
              className="button secondary"
              to={`/compare?ids=${encodeURIComponent(car.carId)}`}
            >
              So sánh xe này
            </Link>
            <Link className="button" to={`/chat?car=${encodeURIComponent(car.carId)}&carName=${encodeURIComponent(car.displayName)}`}>
              Hỏi về xe này
            </Link>
            <Link
              className="button secondary"
              to={`/dealers?brand=${encodeURIComponent(car.brand)}`}
            >
              Tìm đại lý
            </Link>
          </div>
        </div>
      </section>
      <div className="detail-grid">
        <section className="content-panel">
          <span className="section-kicker">Thông số</span>
          <h2>Thông tin tổng quan</h2>
          <div className="spec-grid">
            {specs.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value || "Chưa có dữ liệu"}</strong>
              </div>
            ))}
          </div>
        </section>
        <CarWarranty key={car.carId} car={car} />
      </div>
      <CarDealers key={car.carId} car={car} />
    </div>
  );
}
