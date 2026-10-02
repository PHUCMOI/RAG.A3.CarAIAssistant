export const root = "/api/orders-service";
export type User = {
  id: string;
  email?: string;
  displayName: string;
  role: "Admin" | "Customer";
};
export type Payment = {
  id: string;
  type: string;
  status: string;
  amountVnd: number;
  reference: string;
  originalReceiptId: string | null;
  confirmedAt: string | null;
};
export type Order = {
  id: string;
  code: string;
  customerId: string;
  customerName: string;
  carId: string;
  carName: string;
  brand: string;
  dealerName: string;
  variant: string | null;
  totalVnd: number;
  depositRequiredVnd: number;
  status: string;
  version: number;
  createdAt: string;
  netReceived: number;
  remainingVnd: number;
  plannedDate: string | null;
  actualHandoverAt: string | null;
  deliveryLocation: string | null;
  payments: Payment[];
  history: { at: string; action: string; detail: string; actor: string }[];
};
export type Page = {
  items: Order[];
  pageNumber: number;
  pageSize: number;
  totalCount: number;
};
export const statuses: Record<string, string> = {
  pending_confirmation: "Chờ xác nhận",
  confirmed: "Đã xác nhận",
  preparing_vehicle: "Đang chuẩn bị xe",
  ready_for_handover: "Chờ bàn giao",
  completed: "Hoàn thành",
  cancelled: "Đã hủy",
};
export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}
const pendingKeys = new Map<string, string>();
export async function request<T>(
  path: string,
  method = "GET",
  body?: unknown,
): Promise<T> {
  const headers: Record<string, string> = {};
  const operation = method + path + JSON.stringify(body);
  if (method !== "GET") {
    const csrf = await fetch(root + "/auth/csrf", {
      credentials: "same-origin",
    });
    if (!csrf.ok) throw new Error("Không thể tạo phiên form. Hãy thử lại.");
    headers["X-CSRF-TOKEN"] = (await csrf.json()).token;
    headers["Content-Type"] = "application/json";
    if (!pendingKeys.has(operation))
      pendingKeys.set(operation, crypto.randomUUID());
    headers["Idempotency-Key"] = pendingKeys.get(operation)!;
  }
  const response = await fetch(root + path, {
    method,
    credentials: "same-origin",
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) {
    let detail =
      response.status === 401
        ? "Vui lòng đăng nhập."
        : response.status === 403
          ? "Bạn không có quyền truy cập."
          : "Không thể xử lý yêu cầu.";
    try {
      const result = await response.json();
      detail = result.detail || detail;
    } catch {
      /* plain HTTP error */
    }
    if (response.status < 500) pendingKeys.delete(operation);
    throw new ApiError(response.status, detail);
  }
  pendingKeys.delete(operation);
  return response.status === 204
    ? (undefined as T)
    : (response.json() as Promise<T>);
}
