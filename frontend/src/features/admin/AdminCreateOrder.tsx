import { useEffect, useState, useRef, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import type { CarListResponse, Car } from "../../entities/car/model";
import { apiGet } from "../../shared/api/client";
import { request, type User, type Order } from "../orders/api";
import { formatVnd } from "../../shared/formatting/currency";
import { normalizeText } from "../car-search/catalog";
import { Load } from "../account/shared";
import { AdminHeading, AdminFeedback } from "./ui";
import { useAdminWrite } from "./useAdminWrite";

export function AdminCreateOrder() {
  const navigate = useNavigate();
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const [data, setData] = useState<{
    cars: Car[];
    customers: User[];
    dealers: { dealerId: number; name: string }[];
  } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [retry, setRetry] = useState(0);
  const [customerSearch, setCustomerSearch] = useState("");
  const [carSearch, setCarSearch] = useState("");
  const [dealerSearch, setDealerSearch] = useState("");
  const [customerId, setCustomerId] = useState("");
  const [carId, setCarId] = useState("");
  const [dealerId, setDealerId] = useState("");
  const [total, setTotal] = useState("");
  const [deposit, setDeposit] = useState("50000000");
  const [variant, setVariant] = useState("");
  const [review, setReview] = useState(false);
  const write = useAdminWrite();
  const [validation, setValidation] = useState("");
  useEffect(() => {
    let active = true;
    setLoadError("");
    Promise.all([
      apiGet<CarListResponse>("/api/cars?limit=100"),
      apiGet<{ items: { dealerId: number; name: string }[] }>("/api/dealers"),
      request<User[]>("/admin/customers"),
    ])
      .then(([cars, dealers, customers]) => {
        if (active)
          setData({ cars: cars.items, dealers: dealers.items, customers });
      })
      .catch((err) => {
        if (active) setLoadError(err.message);
      });
    return () => {
      active = false;
    };
  }, [retry]);
  function validMoney(value: string, min: number) {
    return (
      value !== "" &&
      Number.isSafeInteger(Number(value)) &&
      Number(value) >= min
    );
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    setValidation("");
    if (
      !validMoney(total, 1) ||
      Number(total) > 100000000000 ||
      !validMoney(deposit, 0) ||
      Number(deposit) > Number(total)
    ) {
      setValidation(
        "Giá và cọc phải là số nguyên VND; cọc không được vượt giá chốt.",
      );
      return;
    }
    if (!review) {
      setReview(true);
      return;
    }
    await write.run(async () => {
      const order = await request<Order>("/admin/orders", "POST", {
        customerId,
        carId,
        dealerId: Number(dealerId),
        totalVnd: Number(total),
        depositRequiredVnd: Number(deposit),
        variant: variant || null,
      });
      if (mounted.current) navigate(`/admin/orders/${order.id}`);
    });
  }
  const customer = data?.customers.find((item) => item.id === customerId);
  const car = data?.cars.find((item) => item.carId === carId);
  const dealer = data?.dealers.find(
    (item) => String(item.dealerId) === dealerId,
  );
  return (
    <div className="page admin-page">
      <Link className="back-link" to="/admin/orders">
        ← Danh sách đơn
      </Link>
      <AdminHeading
        title="Tạo đơn mua xe"
        description="Giá chốt do quản trị viên xác nhận, độc lập với giá catalogue."
      />
      {!data ? (
        <Load error={loadError} retry={() => setRetry((value) => value + 1)} />
      ) : (
        <div className="admin-create-grid">
          <form
            className="orders-form"
            onSubmit={(event) => void submit(event)}
          >
            <fieldset disabled={write.busy || review}>
              <legend>1. Khách hàng</legend>
              <label>
                Tìm khách hàng
                <input
                  value={customerSearch}
                  onChange={(event) => setCustomerSearch(event.target.value)}
                  placeholder="Họ tên hoặc email"
                />
              </label>
              <label>
                Khách hàng
                <select
                  value={customerId}
                  onChange={(event) => setCustomerId(event.target.value)}
                  required
                >
                  <option value="">Chọn khách hàng</option>
                  {data.customers
                    .filter(
                      (item) =>
                        item.id === customerId ||
                        normalizeText(
                          `${item.displayName} ${item.email || ""}`,
                        ).includes(normalizeText(customerSearch)),
                    )
                    .map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.displayName} · {item.email}
                      </option>
                    ))}
                </select>
              </label>
            </fieldset>
            <fieldset disabled={write.busy || review}>
              <legend>2. Xe và đại lý</legend>
              <label>
                Tìm xe
                <input
                  value={carSearch}
                  onChange={(event) => setCarSearch(event.target.value)}
                />
              </label>
              <label>
                Xe
                <select
                  value={carId}
                  onChange={(event) => setCarId(event.target.value)}
                  required
                >
                  <option value="">Chọn xe</option>
                  {data.cars
                    .filter(
                      (item) =>
                        item.carId === carId ||
                        normalizeText(
                          `${item.displayName} ${item.brand}`,
                        ).includes(normalizeText(carSearch)),
                    )
                    .map((item) => (
                      <option key={item.carId} value={item.carId}>
                        {item.displayName}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Tìm đại lý
                <input
                  value={dealerSearch}
                  onChange={(event) => setDealerSearch(event.target.value)}
                />
              </label>
              <label>
                Đại lý
                <select
                  value={dealerId}
                  onChange={(event) => setDealerId(event.target.value)}
                  required
                >
                  <option value="">Chọn đại lý</option>
                  {data.dealers
                    .filter(
                      (item) =>
                        String(item.dealerId) === dealerId ||
                        normalizeText(item.name).includes(
                          normalizeText(dealerSearch),
                        ),
                    )
                    .map((item) => (
                      <option key={item.dealerId} value={item.dealerId}>
                        {item.name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Phiên bản đã xác nhận
                <input
                  value={variant}
                  onChange={(event) => setVariant(event.target.value)}
                  maxLength={150}
                />
              </label>
            </fieldset>
            <fieldset disabled={write.busy || review}>
              <legend>3. Giá và cọc</legend>
              <label>
                Giá chốt (VND)
                <input
                  type="number"
                  value={total}
                  onChange={(event) => setTotal(event.target.value)}
                  min={1}
                  max={100000000000}
                  step={1}
                  required
                />
              </label>
              <label>
                Cọc yêu cầu (VND)
                <input
                  type="number"
                  value={deposit}
                  onChange={(event) => setDeposit(event.target.value)}
                  min={0}
                  step={1}
                  required
                />
              </label>
              <p className="orders-help">
                Cọc nằm trong giá chốt, không cộng thêm vào tổng giá trị đơn.
              </p>
            </fieldset>
            <AdminFeedback error={validation || write.error} />
            {write.conflict && (
              <button
                type="button"
                className="mini-button"
                disabled={write.busy}
                onClick={() =>
                  void write.refresh(async () => {
                    const customers = await request<User[]>("/admin/customers");
                    setData((old) => (old ? { ...old, customers } : old));
                    setReview(false);
                  })
                }
              >
                Tải lại dữ liệu để kiểm tra
              </button>
            )}
            {review && (
              <p className="admin-note" role="status">
                Kiểm tra phần tóm tắt trước khi xác nhận tạo đơn.
              </p>
            )}
            <div className="admin-toolbar">
              {review && (
                <button
                  className="button secondary"
                  type="button"
                  disabled={write.busy}
                  onClick={() => setReview(false)}
                >
                  Chỉnh sửa
                </button>
              )}
              <button className="button" disabled={write.disabled}>
                {write.busy
                  ? "Đang tạo…"
                  : review
                    ? "Xác nhận tạo đơn"
                    : "Kiểm tra đơn"}
              </button>
            </div>
          </form>
          <aside className="content-panel admin-create-summary">
            <h2>Tóm tắt đơn</h2>
            <dl>
              <dt>Khách hàng</dt>
              <dd>{customer?.displayName || "Chưa chọn"}</dd>
              <dt>Xe / phiên bản</dt>
              <dd>
                {car?.displayName || "Chưa chọn"}
                {variant && ` · ${variant}`}
              </dd>
              <dt>Đại lý</dt>
              <dd>{dealer?.name || "Chưa chọn"}</dd>
              <dt>Giá chốt</dt>
              <dd>
                {validMoney(total, 1)
                  ? formatVnd(Number(total))
                  : "Chưa nhập giá hợp lệ"}
              </dd>
              <dt>Cọc yêu cầu</dt>
              <dd>
                {validMoney(deposit, 0)
                  ? formatVnd(Number(deposit))
                  : "Chưa nhập cọc hợp lệ"}
              </dd>
            </dl>
            <p className="orders-help">
              Đơn chỉ được tạo khi bạn bấm xác nhận.
            </p>
          </aside>
        </div>
      )}
    </div>
  );
}
