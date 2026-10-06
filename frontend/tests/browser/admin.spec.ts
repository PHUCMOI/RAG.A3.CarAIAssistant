import { test, expect, type Page } from "@playwright/test";
import { car } from "../fixtures";
const order = (id = "one", version = 0) => ({
  id,
  code: "AW-" + id,
  customerId: "customer",
  customerName: "Khách demo",
  carId: "1",
  carName: "Toyota Vios",
  brand: "Toyota",
  dealerName: "Toyota Demo",
  variant: null,
  status: "pending_confirmation",
  version,
  totalVnd: 500000000,
  depositRequiredVnd: 50000000,
  netReceived: 0,
  remainingVnd: 500000000,
  plannedDate: "2026-12-01",
  deliveryLocation: "Toyota Demo",
  actualHandoverAt: null,
  createdAt: "2026-10-01",
  payments: [],
  history: [],
});
const purchase = {
  id: "p1",
  code: "PR-001",
  customerId: "customer",
  status: "in_consultation",
  version: 0,
  createdAt: "2026-10-01",
  updatedAt: "2026-10-01",
  orderId: null,
  details: {
    carId: "1",
    carName: "Toyota Vios",
    brand: "Toyota",
    dealerId: 1,
    dealerName: "Toyota Demo",
    variant: null,
    customerName: "Khách demo",
    email: "demo@test.local",
    phone: "0900000000",
    contactMethod: "phone",
    notes: "Tư vấn",
    history: [],
  },
};
const ticket = (id = "t1") => ({
  id,
  code: "ST-" + id,
  subject: "Hỗ trợ " + id,
  summary: "Thông tin phiếu " + id,
  status: "in_progress",
  version: 0,
  updatedAt: "2026-10-01",
  orderId: null,
  paymentId: null,
  changeRequestId: null,
  assignedTo: null,
  snapshot: [],
  replies: {
    items: [
      {
        id: "r1",
        authorRole: "Admin",
        content: "Thông tin nội bộ",
        internal: true,
        at: "2026-10-01",
      },
    ],
    pageNumber: 1,
    pageSize: 20,
    totalCount: 1,
  },
});
const paged = (
  items: unknown[],
  size = 20,
  total = items.length,
  page = 1,
) => ({ items, pageNumber: page, pageSize: size, totalCount: total });
async function mock(page: Page) {
  await page.route("**/api/**", (route) => {
    const url = new URL(route.request().url());
    if (!url.pathname.startsWith("/api/")) return route.continue();
    const p = url.pathname.replace("/api/orders-service", "");
    let data: unknown = paged([]);
    if (p === "/me")
      data = { id: "admin", displayName: "Admin demo", role: "Admin" };
    else if (p === "/auth/csrf") data = { token: "test" };
    else if (p === "/admin/customers")
      data = [
        {
          id: "customer",
          displayName: "Khách demo",
          email: "demo@test.local",
          role: "Customer",
        },
      ];
    else if (url.pathname === "/api/cars")
      data = { items: [car("1")], count: 1 };
    else if (url.pathname === "/api/dealers")
      data = {
        items: [
          { dealerId: 1, name: "Toyota Demo", supportedBrands: ["Toyota"] },
        ],
      };
    else if (p === "/admin/orders")
      data = paged(
        [order()],
        12,
        25,
        Number(url.searchParams.get("page") || 1),
      );
    else if (/\/orders\/[^/]+$/.test(p)) data = order(p.split("/").at(-1));
    else if (p.endsWith("/payment-details"))
      data = { depositRequiredVnd: 50000000, receivedVnd: 0, refundedVnd: 0 };
    else if (p.endsWith("/documents"))
      data = {
        orderId: "one",
        checklist: paged([]),
        requiredOutstanding: 0,
        retrievedAt: "2026-10-01",
      };
    else if (p === "/admin/purchase-requests") data = paged([purchase]);
    else if (p === "/admin/purchase-requests/p1") data = purchase;
    else if (p === "/admin/support-tickets") data = paged([ticket()]);
    else if (/\/support-tickets\/[^/]+$/.test(p))
      data = ticket(p.split("/").at(-1));
    else if (p === "/admin/appointment-slots") data = [];
    return route.fulfill({ json: data });
  });
}
async function fits(page: Page) {
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth + 1,
    ),
  ).toBe(true);
}
test.beforeEach(async ({ page }) => {
  test.skip(page.viewportSize()!.width < 1000, "Desktop admin scope");
  await mock(page);
});

test("admin orders URL, debounce, Enter, pagination, history and retry", async ({
  page,
}, info) => {
  const requests: string[] = [];
  let fail = false;
  await page.route("**/api/orders-service/admin/orders?*", (route) => {
    requests.push(route.request().url());
    return fail
      ? route.fulfill({ status: 503, json: { detail: "Service unavailable" } })
      : route.fulfill({ json: paged([order()], 12, 25) });
  });
  await page.goto(
    "/admin/orders?status=confirmed&delayed=true&page=2&query=AW",
  );
  const input = page.getByRole("textbox", { name: "Tìm mã đơn" });
  await expect(input).toHaveValue("AW");
  await expect(page.getByRole("checkbox")).toBeChecked();
  await page.getByRole("button", { name: "Trang sau" }).click();
  await expect(page).toHaveURL(/page=3/);
  await page.goBack();
  await expect(page).toHaveURL(/page=2/);
  await input.fill("DEMO");
  await page.waitForTimeout(150);
  expect(requests.at(-1)).not.toContain("query=DEMO");
  await expect(page).toHaveURL(/query=DEMO/);
  await expect(page).toHaveURL(/page=1/);
  await input.fill("ENTER");
  await input.press("Enter");
  await expect(page).toHaveURL(/query=ENTER/);
  await page.reload();
  await expect(input).toHaveValue("ENTER");
  fail = true;
  await page
    .getByRole("combobox", { name: "Trạng thái" })
    .selectOption("completed");
  await expect(page.getByText("Service unavailable")).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Thử lại" }).click();
  await expect(page.getByRole("table")).toBeVisible();
  await expect(input).toHaveValue("ENTER");
  await fits(page);
  await page.screenshot({
    path: info.outputPath("orders.png"),
    fullPage: true,
  });
});
test("admin order URL tabs, keyboard, conflict keeps draft and explicit reload", async ({
  page,
}, info) => {
  let version = 0;
  let writes = 0;
  await page.route("**/api/orders-service/admin/orders/one", (route) =>
    route.request().method() === "GET"
      ? route.fulfill({ json: order("one", version) })
      : (++writes,
        route.fulfill({ status: 409, json: { detail: "Conflict" } })),
  );
  await page.goto("/admin/orders/one?tab=invalid");
  await expect(page.getByRole("tab", { name: "Tổng quan" })).toHaveAttribute(
    "aria-selected",
    "true",
  );
  const draft = page
    .getByRole("heading", { name: "Sửa giá chốt draft" })
    .locator("..");
  const reason = draft.locator("input[name=reason]");
  await reason.fill("Bản nhập cần giữ");
  await draft.getByRole("button", { name: "Lưu draft" }).click();
  await expect(page.getByRole("alert")).toContainText("Dữ liệu đã thay đổi");
  await expect(reason).toHaveValue("Bản nhập cần giữ");
  await expect(draft.getByRole("button")).toBeDisabled();
  expect(writes).toBe(1);
  version = 2;
  await page.getByRole("button", { name: "Tải lại", exact: true }).click();
  await expect(page.getByText("Phiên bản 2")).toBeVisible();
  await expect(reason).toHaveValue("Bản nhập cần giữ");
  await expect(draft.getByRole("button")).toBeEnabled();
  await page.getByRole("tab", { name: "Thanh toán", exact: true }).click();
  await expect(page).toHaveURL(/tab=payments/);
  await expect(
    page.getByRole("heading", { name: "Giao dịch thanh toán" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Sửa giá chốt draft" }),
  ).toBeHidden();
  await page
    .getByRole("tab", { name: "Thanh toán", exact: true })
    .press("ArrowRight");
  await expect(
    page.getByRole("tab", { name: "Bàn giao", exact: true }),
  ).toBeFocused();
  await expect(page).toHaveURL(/tab=delivery/);
  await page.goBack();
  await expect(page).toHaveURL(/tab=payments/);
  await page.reload();
  await expect(
    page.getByRole("tab", { name: "Thanh toán", exact: true }),
  ).toHaveAttribute("aria-selected", "true");
  await fits(page);
  await page.screenshot({
    path: info.outputPath("order-detail.png"),
    fullPage: true,
  });
});
test("admin order ID change ignores a late response", async ({ page }) => {
  let release!: () => void;
  let started = false;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route("**/api/orders-service/admin/orders/slow", async (route) => {
    started = true;
    await pending;
    await route.fulfill({ json: order("slow") }).catch(() => {});
  });
  await page.goto("/admin/orders/slow");
  await expect.poll(() => started).toBe(true);
  await page.evaluate(() => {
    history.pushState(null, "", "/admin/orders/fast");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(
    page.getByText("AW-fast", { exact: true }).first(),
  ).toBeVisible();
  release();
  await page.waitForTimeout(200);
  await expect(page.getByText("AW-slow", { exact: true })).toHaveCount(0);
});
test("admin create order reviews before POST, keeps input after failure", async ({
  page,
}, info) => {
  let writes = 0;
  await page.route("**/api/orders-service/admin/orders", (route) => {
    writes++;
    return route.fulfill({ status: 503, json: { detail: "Create failed" } });
  });
  await page.goto("/admin/orders/new");
  await page
    .getByRole("combobox", { name: "Khách hàng", exact: true })
    .selectOption("customer");
  await page
    .getByRole("combobox", { name: "Xe", exact: true })
    .selectOption("1");
  await page
    .getByRole("combobox", { name: "Đại lý", exact: true })
    .selectOption("1");
  await page
    .getByRole("spinbutton", { name: "Giá chốt (VND)" })
    .fill("500000000");
  await page.getByRole("button", { name: "Kiểm tra đơn" }).click();
  expect(writes).toBe(0);
  await expect(page.locator(".admin-create-summary")).toContainText(
    "500.000.000",
  );
  await page.getByRole("button", { name: "Xác nhận tạo đơn" }).click();
  await expect(page.getByRole("alert")).toHaveText("Create failed");
  expect(writes).toBe(1);
  await page.getByRole("button", { name: "Chỉnh sửa" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Giá chốt (VND)" }),
  ).toHaveValue("500000000");
  await fits(page);
  await page.screenshot({
    path: info.outputPath("create-order.png"),
    fullPage: true,
  });
});
test("admin purchase URL and conversion opens explicitly, retains failed form", async ({
  page,
}) => {
  await page.goto("/admin/purchase-requests?status=in_consultation&query=PR");
  await expect(page.getByRole("searchbox")).toHaveValue("PR");
  await expect(page.getByRole("table")).toContainText("Khách demo");
  await page.getByRole("link", { name: "Chi tiết →" }).click();
  await expect(
    page.getByRole("spinbutton", { name: "Giá chốt VND", exact: true }),
  ).toBeHidden();
  await page.getByText("Chuyển thành đơn chính thức", { exact: true }).click();
  await page
    .getByRole("spinbutton", { name: "Giá chốt VND", exact: true })
    .fill("500000000");
  await page
    .getByRole("spinbutton", { name: "Cọc yêu cầu VND" })
    .fill("10000000");
  await page
    .getByRole("textbox", { name: "Nội dung đã thống nhất với khách" })
    .fill("Demo");
  await page.route(
    "**/api/orders-service/admin/purchase-requests/p1/convert",
    (route) =>
      route.fulfill({ status: 503, json: { detail: "Conversion failed" } }),
  );
  await page.getByRole("button", { name: "Tạo đơn chính thức" }).click();
  await expect(page.getByRole("alert")).toHaveText("Conversion failed");
  await expect(
    page.getByRole("spinbutton", { name: "Giá chốt VND", exact: true }),
  ).toHaveValue("500000000");
});
test("admin support retry retains content and idempotency, ID navigation resets draft", async ({
  page,
}, info) => {
  const keys: string[] = [];
  let writes = 0;
  await page.route(
    "**/api/orders-service/admin/support-tickets/t1/replies",
    async (route) => {
      writes++;
      keys.push(route.request().headers()["idempotency-key"]);
      await page.waitForTimeout(200);
      return writes === 1
        ? route.fulfill({ status: 503, json: { detail: "Reply failed" } })
        : route.fulfill({ json: ticket() });
    },
  );
  await page.goto("/admin/support-tickets/t1");
  await expect(
    page.locator(".admin-conversation-message.internal"),
  ).toContainText("Ghi chú nội bộ");
  const input = page.getByRole("textbox", { name: "Nội dung phản hồi" });
  await input.fill("Bản soạn demo");
  await page.getByRole("button", { name: "Gửi phản hồi" }).click();
  await expect(
    page.getByRole("button", { name: "Gửi phản hồi" }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toHaveText("Reply failed");
  await expect(input).toHaveValue("Bản soạn demo");
  await page.getByRole("button", { name: "Gửi phản hồi" }).click();
  await expect(input).toHaveValue("");
  expect(writes).toBe(2);
  expect(keys[0]).toBe(keys[1]);
  await input.fill("Nội dung riêng t1");
  await page.goto("/admin/support-tickets/t2");
  await expect(input).toHaveValue("");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ST-t2");
  await fits(page);
  await page.screenshot({
    path: info.outputPath("support.png"),
    fullPage: true,
  });
});
test("admin customers separate load/create errors and search loaded data", async ({
  page,
}, info) => {
  await page.goto("/admin/customers");
  await expect(page.getByRole("table")).toContainText("Khách demo");
  await page.getByRole("searchbox").fill("khach demo");
  await expect(page.getByRole("table")).toBeVisible();
  await page.getByRole("searchbox").fill("missing");
  await expect(page.getByText("Không có khách hàng phù hợp.")).toBeVisible();
  await page.getByRole("button", { name: "Xóa bộ lọc" }).click();
  await page.getByRole("button", { name: "+ Tạo khách hàng" }).click();
  await page.getByRole("textbox", { name: "Họ tên" }).fill("Khách mới");
  await page
    .getByRole("textbox", { name: "Email", exact: true })
    .fill("new@test.local");
  await page.locator("input[name=password]").fill("DemoPassword!2026");
  await page.route("**/api/orders-service/admin/customers", (route) =>
    route.fulfill({ status: 400, json: { detail: "Email đã tồn tại" } }),
  );
  await page
    .getByRole("button", { name: "Tạo khách hàng", exact: true })
    .click();
  await expect(page.getByRole("alert")).toHaveText("Email đã tồn tại");
  await expect(page.getByRole("table")).toContainText("Khách demo");
  await expect(page.getByRole("textbox", { name: "Họ tên" })).toHaveValue(
    "Khách mới",
  );
  await fits(page);
  await page.screenshot({
    path: info.outputPath("customers.png"),
    fullPage: true,
  });
});
test("admin appointment list precedes collapsed slot form, changes explanation remains", async ({
  page,
}) => {
  await page.goto("/admin/appointments");
  await expect(page.getByRole("textbox", { name: "Nhân viên" })).toBeHidden();
  await page.getByText("Mở khung giờ mới", { exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Nhân viên" })).toBeVisible();
  await fits(page);
  await page.goto("/admin/change-requests");
  await expect(
    page.getByText(/quyết định duyệt chưa tự sửa trạng thái/),
  ).toBeVisible();
  await fits(page);
});
test("admin expired session routes back to login", async ({ page }) => {
  await page.route("**/api/orders-service/admin/orders?*", (route) =>
    route.fulfill({ status: 401, json: {} }),
  );
  await page.goto("/admin/orders");
  await expect(page).toHaveURL(/\/admin\/login/);
});
test("admin documents preserve draft through 409 and refresh the item version", async ({
  page,
}) => {
  let version = 0;
  const bodies: unknown[] = [];
  const documentData = () => ({
    orderId: "one",
    checklist: paged([
      {
        id: "doc",
        name: "CCCD",
        required: true,
        status: "missing",
        customerNote: null,
        updatedAt: "2026-10-01",
        version,
      },
    ]),
    requiredOutstanding: 1,
    retrievedAt: "2026-10-01",
  });
  await page.route(
    "**/api/orders-service/admin/orders/one/documents*",
    (route) => route.fulfill({ json: documentData() }),
  );
  await page.route(
    "**/api/orders-service/admin/orders/one/documents/doc",
    (route) => {
      bodies.push(route.request().postDataJSON());
      return bodies.length === 1
        ? route.fulfill({ status: 409, json: {} })
        : route.fulfill({ json: {} });
    },
  );
  await page.goto("/admin/orders/one?tab=documents");
  await page.getByText("Sửa mục hồ sơ", { exact: true }).click();
  const input = page
    .getByRole("textbox", { name: "Ghi chú dành cho khách" })
    .first();
  await input.fill("Giữ ghi chú");
  await page.getByRole("button", { name: "Lưu mục hồ sơ" }).click();
  await expect(page.getByRole("alert")).toContainText("Dữ liệu đã thay đổi");
  await expect(input).toHaveValue("Giữ ghi chú");
  version = 2;
  await page.getByRole("button", { name: "Tải phiên bản mới" }).click();
  await expect(
    page.getByRole("button", { name: "Lưu mục hồ sơ" }),
  ).toBeEnabled();
  await expect(input).toHaveValue("Giữ ghi chú");
  await page.getByRole("button", { name: "Lưu mục hồ sơ" }).click();
  await expect(page.getByRole("status")).toContainText("Đã lưu");
  expect(bodies[1]).toMatchObject({ version: 2, customerNote: "Giữ ghi chú" });
});
test("admin support late ID response is ignored during client navigation", async ({
  page,
}) => {
  let release!: () => void;
  let started = false;
  const wait = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    "**/api/orders-service/admin/support-tickets/slow*",
    async (route) => {
      started = true;
      await wait;
      await route.fulfill({ json: ticket("slow") }).catch(() => {});
    },
  );
  await page.goto("/admin/support-tickets/slow");
  await expect.poll(() => started).toBe(true);
  await page.evaluate(() => {
    history.pushState(null, "", "/admin/support-tickets/t2");
    dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ST-t2");
  release();
  await page.waitForTimeout(100);
  await expect(page.getByRole("heading", { level: 1 })).toContainText("ST-t2");
  await expect(
    page.getByRole("textbox", { name: "Nội dung phản hồi" }),
  ).toHaveValue("");
});
test("admin appointments distinguish a saved write from a failed refresh", async ({
  page,
}) => {
  let writes = 0;
  let failed = false;
  await page.route("**/api/orders-service/admin/appointments?*", (route) =>
    failed
      ? route.fulfill({ status: 503, json: { detail: "Load failed" } })
      : route.fulfill({ json: paged([]) }),
  );
  await page.route("**/api/orders-service/admin/appointment-slots", (route) => {
    if (route.request().method() === "POST") {
      writes++;
      failed = true;
      return route.fulfill({ json: { id: "slot-demo" } });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/admin/appointments");
  await page.getByText("Mở khung giờ mới", { exact: true }).click();
  await page.getByRole("textbox", { name: "Nhân viên" }).fill("Demo staff");
  await page.locator("input[name=start]").fill("2027-01-01T09:00");
  await page.locator("input[name=end]").fill("2027-01-01T10:00");
  await page.getByRole("button", { name: "Mở khung giờ", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Đã lưu thao tác");
  await expect(
    page.getByRole("button", { name: "Mở khung giờ", exact: true }),
  ).toBeDisabled();
  expect(writes).toBe(1);
  failed = false;
  await page.getByRole("button", { name: "Tải phiên bản mới" }).click();
  await expect(
    page.getByRole("button", { name: "Mở khung giờ", exact: true }),
  ).toBeEnabled();
  expect(writes).toBe(1);
});
test("admin change decision retains the entered response after conflict", async ({
  page,
}) => {
  const item = {
    id: "change1",
    code: "CR-DEMO",
    orderId: "one",
    type: "cancel",
    reason: "Demo reason",
    response: null,
    status: "pending",
    version: 0,
    createdAt: "2026-10-01",
  };
  let version = 0;
  await page.route("**/api/orders-service/admin/change-requests?*", (route) =>
    route.fulfill({ json: paged([{ ...item, version }]) }),
  );
  await page.route(
    "**/api/orders-service/admin/change-requests/change1/decision",
    (route) => route.fulfill({ status: 409, json: {} }),
  );
  await page.goto("/admin/change-requests");
  const input = page.locator("textarea[name=reason]");
  await input.fill("Phản hồi demo");
  await page.getByRole("button", { name: "Lưu phản hồi" }).click();
  await expect(page.getByRole("alert")).toContainText("Dữ liệu đã thay đổi");
  await expect(input).toHaveValue("Phản hồi demo");
  version = 1;
  await page.getByRole("button", { name: "Tải phiên bản mới" }).click();
  await expect(input).toHaveValue("Phản hồi demo");
  await expect(
    page.getByRole("button", { name: "Lưu phản hồi" }),
  ).toBeEnabled();
  await expect(
    page.getByRole("link", { name: "Mở đơn liên quan →" }),
  ).toHaveAttribute("href", "/admin/orders/one");
});
test("admin dropdown stays above content, Escape restores focus and empty filters reset URL", async ({
  page,
}) => {
  await page.route("**/api/orders-service/admin/orders?*", (route) =>
    route.fulfill({ json: paged([], 12) }),
  );
  await page.goto("/admin/orders?query=NONE&status=completed&page=2");
  await expect(page.getByText("Không có đơn phù hợp.")).toBeVisible();
  const header = page.locator(".app-header");
  const trigger = header.getByRole("button", { name: "Yêu cầu", exact: true });
  await trigger.click();
  const link = header.getByRole("link", {
    name: "Yêu cầu mua xe",
    exact: true,
  });
  await expect(link).toBeVisible();
  expect(
    await link.evaluate((element) => {
      const box = element.getBoundingClientRect();
      return element.contains(
        document.elementFromPoint(
          box.left + box.width / 2,
          box.top + box.height / 2,
        ),
      );
    }),
  ).toBe(true);
  await page.keyboard.press("Tab");
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page
    .locator(".admin-empty")
    .getByRole("button", { name: "Xóa bộ lọc" })
    .click();
  await expect(page.getByRole("textbox", { name: "Tìm mã đơn" })).toHaveValue(
    "",
  );
  await expect(page).toHaveURL("/admin/orders");
});
test("admin support paging blocks writes until the requested version arrives and preserves draft", async ({
  page,
}) => {
  let release!: () => void;
  let started = false;
  let version = 0;
  let sent: unknown;
  const pending = new Promise<void>((resolve) => (release = resolve));
  await page.route(
    "**/api/orders-service/admin/support-tickets/t1?*",
    async (route) => {
      const pageNumber = Number(
        new URL(route.request().url()).searchParams.get("page") || 1,
      );
      if (pageNumber === 2) {
        started = true;
        await pending;
        version = 2;
      }
      return route.fulfill({
        json: {
          ...ticket(),
          version,
          replies: paged(
            [
              {
                id: "reply-" + pageNumber,
                authorRole: "Customer",
                content: "Nội dung trang " + pageNumber,
                at: "2026-10-01",
                internal: false,
              },
            ],
            20,
            21,
            pageNumber,
          ),
        },
      });
    },
  );
  await page.route(
    "**/api/orders-service/admin/support-tickets/t1/replies",
    (route) => {
      sent = route.request().postDataJSON();
      version = 3;
      return route.fulfill({ json: { ...ticket(), version } });
    },
  );
  await page.goto("/admin/support-tickets/t1");
  const input = page.getByRole("textbox", { name: "Nội dung phản hồi" });
  await input.fill("Bản nhập giữa hai trang");
  await page.getByRole("button", { name: "Trang sau" }).click();
  await expect.poll(() => started).toBe(true);
  await expect(
    page.getByRole("button", { name: "Gửi phản hồi" }),
  ).toBeDisabled();
  await expect(page.getByRole("button", { name: "Trang sau" })).toBeDisabled();
  release();
  await expect(page.getByText("Nội dung trang 2")).toBeVisible();
  await expect(input).toHaveValue("Bản nhập giữa hai trang");
  await page.getByRole("button", { name: "Gửi phản hồi" }).click();
  await expect(input).toHaveValue("");
  expect(sent).toMatchObject({
    version: 2,
    content: "Bản nhập giữa hai trang",
  });
});
test("admin appointment write locks pagination until refreshed results arrive", async ({
  page,
}) => {
  let release!: () => void;
  let started = false;
  let saved = false;
  const pending = new Promise<void>((resolve) => (release = resolve));
  const appointment = {
    id: "a1",
    status: "requested",
    version: 0,
    slot: {
      id: "slot1",
      dealerId: 1,
      dealerName: "Toyota Demo",
      staffName: "Nhân viên demo",
      startsAt: "2027-01-01T09:00:00Z",
      endsAt: "2027-01-01T10:00:00Z",
    },
    details: {
      carName: "Toyota Vios",
      dealerId: 1,
      phone: "0900000000",
      notes: "",
      kind: "consultation",
      history: [],
    },
  };
  await page.route("**/api/orders-service/admin/appointments?*", (route) =>
    route.fulfill({
      json: paged(
        [
          {
            ...appointment,
            status: saved ? "confirmed" : "requested",
            version: saved ? 1 : 0,
          },
        ],
        20,
        21,
      ),
    }),
  );
  await page.route(
    "**/api/orders-service/admin/appointments/a1/actions",
    async (route) => {
      started = true;
      await pending;
      saved = true;
      return route.fulfill({ json: {} });
    },
  );
  await page.goto("/admin/appointments");
  await page.getByText("Xử lý lịch hẹn", { exact: true }).click();
  await page
    .getByRole("textbox", { name: "Phản hồi", exact: true })
    .fill("Xác nhận demo");
  await page.getByRole("button", { name: "Lưu xử lý" }).click();
  await expect.poll(() => started).toBe(true);
  await expect(page.getByRole("button", { name: "Trang sau" })).toBeDisabled();
  release();
  await expect(page.locator(".admin-record .admin-badge")).toHaveText(
    "Đã xác nhận",
  );
  await expect(page.getByRole("button", { name: "Trang sau" })).toBeEnabled();
});
