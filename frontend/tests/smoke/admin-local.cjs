// Run only against local demo services: node tests/smoke/admin-local.cjs --write-demo
const { chromium, expect } = require("@playwright/test");
const { randomUUID } = require("node:crypto");
const fs = require("node:fs");
const origin = process.env.AUTOWISE_LOCAL_URL || "http://127.0.0.1:5173";
if (
  !["127.0.0.1", "localhost"].includes(new URL(origin).hostname) ||
  !process.argv.includes("--write-demo")
)
  throw new Error(
    "Requires a local URL and --write-demo. Creates dedicated demo records; never retries writes automatically.",
  );
const report = process.argv.includes("--resume-report")
  ? JSON.parse(fs.readFileSync("test-results/admin-local-report.json", "utf8"))
  : {
      startedAt: new Date().toISOString(),
      origin,
      checks: [],
      records: {},
      errors: [],
    };
async function api(context, path, method = "GET", data, expected) {
  const headers = {};
  if (method !== "GET") {
    const csrf = await context.request.get(
      origin + "/api/orders-service/auth/csrf",
    );
    headers["X-CSRF-TOKEN"] = (await csrf.json()).token;
    headers["Idempotency-Key"] = randomUUID();
  }
  const response = await context.request.fetch(
    origin + "/api/orders-service" + path,
    { method, data, headers },
  );
  if (expected) {
    expect(response.status()).toBe(expected);
    return null;
  }
  if (!response.ok())
    throw new Error(
      `${method} ${path}: ${response.status()} ${await response.text()}`,
    );
  return response.status() === 204 ? null : response.json();
}
async function check(label, operation) {
  if (report.checks.includes(label)) {
    console.log("SKIP already passed", label);
    return;
  }
  await operation();
  report.checks.push(label);
  console.log("PASS", label);
}
(async () => {
  const browser = await chromium.launch({ channel: "msedge" });
  const admin = await browser.newContext({
    viewport: { width: 1440, height: 900 },
  });
  const customer = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });
  const p = await admin.newPage();
  p.on("pageerror", (e) => report.errors.push(e.message));
  try {
    await api(admin, "/auth/login", "POST", {
      email: process.env.AUTOWISE_ADMIN_EMAIL || "admin@autowise.test",
      password: process.env.AUTOWISE_ADMIN_PASSWORD || "DemoAdmin!2026",
    });
    const stamp = report.records.email
      ? Number(report.records.email.match(/fe-admin-(\d+)/)[1])
      : Date.now();
    const email = `fe-admin-${stamp}@autowise.test`;
    const password = "DemoFrontend!2026";
    await check("Create dedicated demo customer through FE", async () => {
      await p.goto(origin + "/admin/customers");
      await p.getByRole("button", { name: "+ Tạo khách hàng" }).click();
      await p
        .getByRole("textbox", { name: "Họ tên" })
        .fill("FE admin smoke " + stamp);
      await p.getByRole("textbox", { name: "Email", exact: true }).fill(email);
      await p.locator("input[name=password]").fill(password);
      await p
        .getByRole("button", { name: "Tạo khách hàng", exact: true })
        .click();
      await expect(p.getByRole("status")).toContainText("Đã tạo");
    });
    const users = await api(admin, "/admin/customers");
    const user = users.find((u) => u.email === email);
    expect(user).toBeTruthy();
    report.records.customerId = user.id;
    report.records.email = email;
    const cars = (
      await (await admin.request.get(origin + "/api/cars?limit=100")).json()
    ).items;
    const dealers = (
      await (await admin.request.get(origin + "/api/dealers")).json()
    ).items;
    const car = cars.find((c) =>
      dealers.some((d) => d.supportedBrands.includes(c.brand)),
    );
    const dealer = dealers.find((d) => d.supportedBrands.includes(car.brand));
    let order = report.records.orderId
      ? await api(admin, "/admin/orders/" + report.records.orderId)
      : undefined;
    await check("Review and create demo order through FE", async () => {
      await p.goto(origin + "/admin/orders/new");
      await p
        .getByRole("combobox", { name: "Khách hàng", exact: true })
        .selectOption(user.id);
      await p
        .getByRole("combobox", { name: "Xe", exact: true })
        .selectOption(car.carId);
      await p
        .getByRole("combobox", { name: "Đại lý", exact: true })
        .selectOption(String(dealer.dealerId));
      await p
        .getByRole("spinbutton", { name: "Giá chốt (VND)" })
        .fill("500000000");
      await p.getByRole("button", { name: "Kiểm tra đơn" }).click();
      await p.getByRole("button", { name: "Xác nhận tạo đơn" }).click();
      await p.waitForURL(/\/admin\/orders\/[0-9a-f-]+$/);
      order = await api(admin, "/admin/orders/" + p.url().split("/").at(-1));
      report.records.orderId = order.id;
    });
    await check("Record pending payment and confirm through FE", async () => {
      await p.getByRole("tab", { name: "Thanh toán", exact: true }).click();
      await p.locator("input[name=amount]").fill("10000000");
      await p.locator("input[name=reference]").fill("FE-SMOKE-" + stamp);
      await p.getByRole("button", { name: "Ghi giao dịch pending" }).click();
      await expect(p.getByRole("status")).toContainText("Đã lưu");
      await p.getByRole("button", { name: "Xác nhận", exact: true }).click();
      await expect(
        p.getByRole("cell", { name: "Đã xác nhận", exact: true }),
      ).toBeVisible();
    });
    await check("Save checklist through FE", async () => {
      await p.getByRole("tab", { name: "Hồ sơ", exact: true }).click();
      await p.getByText("Thêm giấy tờ cho đơn này", { exact: true }).click();
      await p
        .getByRole("textbox", { name: "Loại giấy tờ" })
        .fill("FE smoke CCCD");
      await p.getByRole("button", { name: "Thêm mục hồ sơ" }).click();
      await expect(p.getByText("FE smoke CCCD · Tùy chọn")).toBeVisible();
    });
    await check(
      "Save delivery and preserve business version checks",
      async () => {
        await p.getByRole("tab", { name: "Bàn giao", exact: true }).click();
        const form = p
          .locator("form")
          .filter({
            has: p.getByRole("button", { name: "Lưu lịch bàn giao" }),
          });
        await form.locator("input[name=planned]").fill("2027-01-15");
        await form.locator("input[name=reason]").fill("FE demo schedule");
        await form.getByRole("button").click();
        await expect(p.getByRole("status")).toContainText("Đã lưu");
        order = await api(admin, "/admin/orders/" + order.id);
        await api(
          admin,
          "/admin/orders/" + order.id,
          "PATCH",
          {
            version: -1,
            totalVnd: 500000000,
            depositRequiredVnd: 50000000,
            reason: "FE conflict verification",
          },
          409,
        );
      },
    );
    await api(customer, "/auth/login", "POST", { email, password });
    await check(
      "Purchase accept/respond/convert on new demo record",
      async () => {
        let item = await api(customer, "/my/purchase-requests", "POST", {
          carId: car.carId,
          dealerId: dealer.dealerId,
          phone: "0900000000",
          contactMethod: "email",
          notes: "FE smoke " + stamp,
        });
        report.records.purchaseId = item.id;
        await p.goto(origin + "/admin/purchase-requests/" + item.id);
        await p.getByRole("button", { name: "Tiếp nhận tư vấn" }).click();
        await expect(
          p.getByRole("button", { name: "Gửi phản hồi" }),
        ).toBeVisible();
        const form = p
          .locator("form")
          .filter({ has: p.getByRole("button", { name: "Gửi phản hồi" }) });
        await form.locator("textarea").fill("FE demo response");
        await form.getByRole("button").click();
        await expect(p.getByRole("status")).toContainText("Đã lưu");
        await p
          .getByText("Chuyển thành đơn chính thức", { exact: true })
          .click();
        await p.locator("input[name=total]").fill("500000000");
        await p.locator("input[name=deposit]").fill("50000000");
        await p.locator("input[name=reason]").fill("FE demo conversion");
        await p.getByRole("button", { name: "Tạo đơn chính thức" }).click();
        await expect(
          p.getByRole("link", { name: "Mở đơn chính thức" }),
        ).toBeVisible();
      },
    );
    await check(
      "Approve demo change without cancelling or refunding order",
      async () => {
        const change = await api(customer, "/my/change-requests", "POST", {
          orderId: order.id,
          type: "cancel",
          reason: "FE smoke cancellation inquiry " + stamp,
        });
        report.records.changeId = change.id;
        await p.goto(origin + "/admin/change-requests");
        const card = p
          .locator(".admin-record")
          .filter({ hasText: change.code });
        await card
          .locator("textarea")
          .fill("FE demo approval; order unchanged");
        await card.getByRole("button", { name: "Lưu phản hồi" }).click();
        await expect(card).toContainText("Đã duyệt");
        const after = await api(admin, "/admin/orders/" + order.id);
        expect(after.status).toBe(order.status);
        expect(after.netReceived).toBe(order.netReceived);
      },
    );
    await check(
      "Create slot through FE and confirm a dedicated appointment",
      async () => {
        await p.goto(origin + "/admin/appointments");
        if (!report.records.appointmentId) {
          await p.getByText("Mở khung giờ mới", { exact: true }).click();
          await p
            .locator("select[name=dealer]")
            .selectOption(String(dealer.dealerId));
          await p.locator("input[name=staff]").fill("FE smoke " + stamp);
          const start = new Date(
            Date.now() + 80 * 86400000 + (stamp % 1000000),
          );
          const end = new Date(start.getTime() + 3600000);
          const local = (d) =>
            new Date(d.getTime() - d.getTimezoneOffset() * 60000)
              .toISOString()
              .slice(0, 16);
          await p.locator("input[name=start]").fill(local(start));
          await p.locator("input[name=end]").fill(local(end));
          await p
            .getByRole("button", { name: "Mở khung giờ", exact: true })
            .click();
          await expect(p.getByRole("status")).toContainText("Đã lưu");
          const slots = await api(admin, "/admin/appointment-slots");
          const slot = slots.find((s) => s.staffName === "FE smoke " + stamp);
          report.records.slotId = slot.id;
          const appointment = await api(customer, "/my/appointments", "POST", {
            carId: car.carId,
            slotId: slot.id,
            kind: "consultation",
            phone: "0900000000",
            notes: "FE smoke " + stamp,
          });
          report.records.appointmentId = appointment.id;
        }
        await p.reload();
        const card = p
          .locator(".admin-record")
          .filter({ hasText: "FE smoke " + stamp });
        await card.getByText("Xử lý lịch hẹn", { exact: true }).click();
        await card
          .getByRole("textbox", { name: "Phản hồi", exact: true })
          .fill("FE smoke confirmation");
        await card.getByRole("button", { name: "Lưu xử lý" }).click();
        await expect(card.locator(".admin-badge")).toHaveText("Đã xác nhận");
      },
    );
    await check(
      "Create support via assistant draft; FE accepts and sends an internal reply",
      async () => {
        let session = await api(customer, "/assistant/sessions", "POST", {
          id: randomUUID(),
        });
        report.records.sessionId = session.id;
        session = await api(
          customer,
          `/assistant/sessions/${session.id}/messages`,
          "POST",
          {
            requestId: randomUUID(),
            version: session.version,
            content: "Tạo phiếu hỗ trợ vì lỗi kiểm thử FE demo " + stamp,
            orderId: order.id,
          },
        );
        expect(session.draft?.type).toBe("support");
        session = await api(
          customer,
          `/assistant/sessions/${session.id}/draft-actions`,
          "POST",
          {
            requestId: randomUUID(),
            version: session.version,
            draftId: session.draft.id,
            draftVersion: session.draft.version,
            action: "confirm",
          },
        );
        const id = session.draft.requestId;
        report.records.ticketId = id;
        await p.goto(origin + "/admin/support-tickets/" + id);
        await p.getByRole("button", { name: "Tiếp nhận phiếu" }).click();
        await expect(p.getByRole("status")).toContainText("Đã lưu");
        await p
          .getByRole("textbox", { name: "Nội dung phản hồi" })
          .fill("FE demo internal note");
        await p
          .getByRole("checkbox", { name: "Ghi chú nội bộ (khách không thấy)" })
          .check();
        await p.getByRole("button", { name: "Gửi phản hồi" }).click();
        await expect(
          p.locator(".admin-conversation-message.internal"),
        ).toContainText("FE demo internal note");
        const view = await api(customer, "/my/support-tickets/" + id);
        expect(view.replies.items.some((r) => r.internal)).toBe(false);
      },
    );
    for (const width of [1280, 1440]) {
      await p.setViewportSize({ width, height: 900 });
      for (const route of [
        "/admin/orders",
        "/admin/orders/" + order.id,
        "/admin/orders/new",
        "/admin/customers",
        "/admin/purchase-requests",
        "/admin/purchase-requests/" + report.records.purchaseId,
        "/admin/change-requests",
        "/admin/appointments",
        "/admin/support-tickets",
        "/admin/support-tickets/" + report.records.ticketId,
      ]) {
        await p.goto(origin + route);
        await expect(p.locator("main h1")).toBeVisible();
        await p.waitForTimeout(200);
        expect(
          await p.evaluate(
            () => document.documentElement.scrollWidth <= innerWidth + 1,
          ),
        ).toBe(true);
        await p.screenshot({
          path: `test-results/admin-live-${width}-${route.replaceAll("/", "-")}.png`,
          fullPage: true,
        });
      }
    }
    await check("Customer layout and order remain usable", async () => {
      const c = await customer.newPage();
      c.on("pageerror", (e) => report.errors.push(e.message));
      await c.goto(origin + "/account/orders/" + order.id);
      await expect(c.locator(".website-shell")).not.toHaveClass(/admin-shell/);
      await expect(
        c.getByRole("heading", { name: car.displayName, exact: true }),
      ).toBeVisible();
      await expect(c.getByRole("tab")).toHaveCount(0);
    });
    expect(report.errors).toEqual([]);
    report.result = "passed";
    delete report.failure;
  } catch (error) {
    report.result = "failed";
    report.failure = error.message;
    process.exitCode = 1;
    console.error(error.message);
  } finally {
    report.finishedAt = new Date().toISOString();
    fs.mkdirSync("test-results", { recursive: true });
    fs.writeFileSync(
      "test-results/admin-local-report.json",
      JSON.stringify(report, null, 2),
    );
    await browser.close();
    console.log("REPORT test-results/admin-local-report.json");
  }
})();
