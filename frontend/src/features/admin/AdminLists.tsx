import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { normalizeText } from "../car-search/catalog";
import { request, type User } from "../orders/api";
import { useData, Load, labels, time, type Page } from "../account/shared";
import type { Purchase } from "../account/PurchasePages";
import {
  AdminHeading,
  AdminTable,
  AdminBadge,
  AdminPager,
  AdminEmpty,
  AdminFeedback,
  useAdminListQuery,
} from "./ui";
import { useAdminWrite } from "./useAdminWrite";

export function AdminCustomers() {
  const state = useData<User[]>("/admin/customers");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const write = useAdminWrite();
  const items =
    state.data?.filter((u) =>
      normalizeText(`${u.displayName} ${u.email}`).includes(
        normalizeText(query),
      ),
    ) || [];
  async function create(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const f = new FormData(form);
    await write.run(async () => {
      const user = await request<User>("/admin/customers", "POST", {
        displayName: f.get("name"),
        email: f.get("email"),
        password: f.get("password"),
      });
      state.setData((old) => (old ? [...old, user] : [user]));
      form.reset();
    }, "Đã tạo tài khoản khách hàng.");
  }
  return (
    <div className="page">
      <AdminHeading
        title="Khách hàng"
        description="Tìm kiếm trong danh sách tài khoản đã tải."
        actions={
          <button
            className="button"
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            {open ? "Đóng form" : "+ Tạo khách hàng"}
          </button>
        }
      />
      <section hidden={!open} className="content-panel admin-create-customer">
        <h2>Tạo tài khoản khách hàng</h2>
        <form className="orders-form" onSubmit={create}>
          <label>
            Họ tên
            <input name="name" maxLength={100} required />
          </label>
          <label>
            Email
            <input name="email" type="email" required />
          </label>
          <label>
            Mật khẩu demo (ít nhất 12 ký tự)
            <input
              name="password"
              type="password"
              minLength={12}
              maxLength={128}
              autoComplete="new-password"
              required
            />
          </label>
          <button className="button" disabled={write.disabled}>
            Tạo khách hàng
          </button>
          <AdminFeedback error={write.error} success={write.success} />
          {write.conflict && (
            <button
              type="button"
              className="mini-button"
              disabled={write.busy}
              onClick={() =>
                void write.refresh(async () =>
                  state.setData(await request<User[]>("/admin/customers")),
                )
              }
            >
              Tải phiên bản mới
            </button>
          )}
        </form>
      </section>
      <div className="admin-filters">
        <label>
          Tìm khách hàng
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tên hoặc email"
          />
        </label>
        <button className="mini-button" onClick={state.reload}>
          Tải lại danh sách
        </button>
      </div>
      {!state.data ? (
        <Load error={state.error} retry={state.reload} />
      ) : (
        <>
          <p>
            {items.length} / {state.data.length} tài khoản đã tải
          </p>
          {!items.length ? (
            <AdminEmpty
              text="Không có khách hàng phù hợp."
              clear={() => setQuery("")}
            />
          ) : (
            <AdminTable
              caption="Danh sách khách hàng"
              headers={["Khách hàng", "Email", "Thao tác"]}
            >
              {items.map((u) => (
                <tr key={u.id}>
                  <td>
                    <strong>{u.displayName}</strong>
                  </td>
                  <td>{u.email}</td>
                  <td>
                    <Link className="text-link" to="/admin/orders/new">
                      Tạo đơn
                    </Link>
                  </td>
                </tr>
              ))}
            </AdminTable>
          )}
        </>
      )}
    </div>
  );
}
const purchaseStatuses = [
  "submitted",
  "in_consultation",
  "converted",
  "rejected",
  "withdrawn",
];
export function AdminPurchaseList() {
  const filter = useAdminListQuery(purchaseStatuses);
  const query = new URLSearchParams({
    page: String(filter.page),
    status: filter.status,
    query: filter.query,
  });
  const state = useData<Page<Purchase>>("/admin/purchase-requests?" + query);
  return (
    <div className="page">
      <AdminHeading
        title="Yêu cầu mua xe"
        description="Tiếp nhận nhu cầu tư vấn và chuyển thành đơn khi đã thống nhất."
      />
      <form
        className="admin-filters"
        onSubmit={(e) => {
          e.preventDefault();
          filter.apply();
        }}
      >
        <label>
          Tìm mã yêu cầu
          <input
            type="search"
            value={filter.draft}
            onChange={(e) => filter.input(e.target.value)}
          />
        </label>
        <label>
          Trạng thái
          <select
            value={filter.status}
            onChange={(e) => filter.update("status", e.target.value)}
          >
            <option value="">Tất cả</option>
            {purchaseStatuses.map((s) => (
              <option key={s} value={s}>
                {labels[s]}
              </option>
            ))}
          </select>
        </label>
        <button className="mini-button" type="button" onClick={filter.clear}>
          Xóa bộ lọc
        </button>
      </form>
      {!state.data ? (
        <Load error={state.error} retry={state.reload} />
      ) : (
        <>
          {!state.data.items.length ? (
            <AdminEmpty text="Chưa có yêu cầu phù hợp." clear={filter.clear} />
          ) : (
            <AdminTable
              caption="Yêu cầu mua xe"
              headers={[
                "Mã yêu cầu",
                "Khách hàng",
                "Xe / đại lý",
                "Trạng thái",
                "Ngày tạo",
                "Thao tác",
              ]}
            >
              {state.data.items.map((r) => (
                <tr key={r.id}>
                  <td>
                    <strong>{r.code}</strong>
                  </td>
                  <td>{r.details.customerName}</td>
                  <td>
                    <strong>{r.details.carName}</strong>
                    <small>{r.details.dealerName}</small>
                  </td>
                  <td>
                    <AdminBadge value={r.status}>{labels[r.status]}</AdminBadge>
                  </td>
                  <td>{time(r.createdAt)}</td>
                  <td>
                    <Link
                      className="text-link"
                      to={"/admin/purchase-requests/" + r.id}
                    >
                      Chi tiết →
                    </Link>
                  </td>
                </tr>
              ))}
            </AdminTable>
          )}
          <AdminPager
            page={filter.page}
            size={state.data.pageSize || 20}
            total={state.data.totalCount}
            change={(p) => filter.update("page", String(p))}
          />
        </>
      )}
    </div>
  );
}
type TicketItem = {
  id: string;
  code: string;
  subject: string;
  status: string;
  updatedAt: string;
};
const supportLabels: Record<string, string> = {
  new: "Đã tiếp nhận",
  in_progress: "Đang xử lý",
  resolved: "Đã giải quyết",
  closed: "Đã đóng",
};
export function AdminSupportList() {
  const filter = useAdminListQuery();
  const state = useData<Page<TicketItem>>(
    "/admin/support-tickets?page=" + filter.page,
  );
  return (
    <div className="page">
      <AdminHeading
        title="Phiếu hỗ trợ"
        description="Tiếp nhận, phản hồi và ghi chú nội bộ theo từng phiếu."
      />
      {!state.data ? (
        <Load error={state.error} retry={state.reload} />
      ) : (
        <>
          {!state.data.items.length ? (
            <AdminEmpty text="Chưa có phiếu hỗ trợ." />
          ) : (
            <AdminTable
              caption="Danh sách phiếu hỗ trợ"
              headers={[
                "Mã phiếu",
                "Chủ đề",
                "Trạng thái",
                "Cập nhật",
                "Thao tác",
              ]}
            >
              {state.data.items.map((t) => (
                <tr key={t.id}>
                  <td>
                    <strong>{t.code}</strong>
                  </td>
                  <td>{t.subject}</td>
                  <td>
                    <AdminBadge value={t.status}>
                      {supportLabels[t.status]}
                    </AdminBadge>
                  </td>
                  <td>{time(t.updatedAt)}</td>
                  <td>
                    <Link
                      className="text-link"
                      to={"/admin/support-tickets/" + t.id}
                    >
                      Mở phiếu →
                    </Link>
                  </td>
                </tr>
              ))}
            </AdminTable>
          )}
          <AdminPager
            page={filter.page}
            size={state.data.pageSize || 20}
            total={state.data.totalCount}
            change={(p) => filter.update("page", String(p))}
          />
        </>
      )}
    </div>
  );
}
