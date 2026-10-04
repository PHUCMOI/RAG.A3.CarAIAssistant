const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const base = process.env.ORDERS_URL || 'http://localhost:5173';
const root = base + '/api/orders-service';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const admin = await browser.newContext();
    const customer = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const other = await browser.newContext();
    async function api(ctx, method, route, data, expected = 200) {
      const headers = {};
      if (method !== 'GET') {
        headers['X-CSRF-TOKEN'] = (await (await ctx.request.get(root + '/auth/csrf')).json()).token;
        headers['Idempotency-Key'] = crypto.randomUUID();
      }
      const response = await ctx.request.fetch(root + route, { method, data, headers });
      const text = await response.text();
      assert.equal(response.status(), expected, `${route}: ${text}`);
      return text ? JSON.parse(text) : null;
    }
    await api(admin, 'POST', '/auth/login', { email: 'admin@autowise.test', password: 'DemoAdmin!2026' });
    await api(customer, 'POST', '/auth/login', { email: 'customer3@autowise.test', password: 'DemoCustomer!2026' });
    await api(other, 'POST', '/auth/login', { email: 'customer4@autowise.test', password: 'DemoCustomer!2026' });
    const user = await api(customer, 'GET', '/me');
    const order = await api(admin, 'POST', '/admin/orders', { customerId: user.id, carId: 'car_34_3', dealerId: 4, totalVnd: 1000000, depositRequiredVnd: 0, variant: 'US-03 UI smoke' });
    const page = await customer.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/account/assistant');
    let response = page.waitForResponse(r => r.url().endsWith('/assistant/sessions') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '+ Hội thoại mới', exact: true }).click();
    let session = await (await response).json();
    await page.getByLabel('Đơn cần tra cứu').selectOption(order.id);
    async function send(text) {
      await page.getByLabel('Câu hỏi', { exact: true }).fill(text);
      const response = page.waitForResponse(r => r.url().endsWith('/messages') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Gửi câu hỏi', exact: true }).click();
      session = await (await response).json();
      await page.getByRole('button', { name: 'Gửi câu hỏi', exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('textarea[aria-label="Câu hỏi"]')?.value === '');
    }
    await send('Tôi muốn đổi lịch ngày mai');
    assert.equal(session.draft.ready, false);
    const card = page.getByRole('region', { name: 'Bản nháp yêu cầu' });
    assert.equal(await card.getByRole('button', { name: 'Xác nhận gửi yêu cầu' }).isDisabled(), true);
    await send('đồng ý');
    assert.equal((await api(customer, 'GET', '/my/change-requests?pageSize=100')).items.filter(x => x.orderId === order.id).length, 0);
    await page.getByLabel('Ngày mong muốn', { exact: true }).fill('2027-10-15');
    await page.getByLabel('Giờ mong muốn', { exact: true }).fill('09:30');
    await page.getByLabel('Lý do yêu cầu').fill('Bận công việc, mong đổi lịch nhận xe.');
    response = page.waitForResponse(r => r.url().endsWith('/draft-actions'));
    await card.getByRole('button', { name: 'Lưu bản nháp' }).click();
    session = await (await response).json();
    await card.getByRole('button', { name: 'Xác nhận gửi yêu cầu' }).waitFor();
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-03/ui-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-03/ui-mobile.png'), fullPage: true });
    const body = { requestId: crypto.randomUUID(), version: session.version, draftId: session.draft.id, draftVersion: session.draft.version, action: 'confirm' };
    await api(other, 'POST', `/assistant/sessions/${session.id}/draft-actions`, body, 404);
    response = page.waitForResponse(r => r.url().endsWith('/draft-actions'));
    await card.getByRole('button', { name: 'Xác nhận gửi yêu cầu' }).click();
    session = await (await response).json();
    assert.equal(session.draft.status, 'submitted');
    const submitted = session;
    // Two requests with distinct transport keys but the same draft version return one request.
    const replay = await Promise.all([api(customer, 'POST', `/assistant/sessions/${session.id}/draft-actions`, body), api(customer, 'POST', `/assistant/sessions/${session.id}/draft-actions`, { ...body, requestId: crypto.randomUUID() })]);
    assert.ok(replay.every(x => x.draft.requestId === submitted.draft.requestId));
    const mine = await api(customer, 'GET', '/my/change-requests?requestId=' + session.draft.requestId);
    assert.equal(mine.items.length, 1); assert.equal(mine.items[0].status, 'pending');
    assert.ok(mine.items[0].reason.includes('15/10/2027')); assert.ok(mine.items[0].reason.includes('09:30'));
    assert.equal((await api(other, 'GET', '/my/change-requests?requestId=' + session.draft.requestId)).items.length, 0);
    const all = await api(admin, 'GET', '/admin/change-requests?pageSize=100');
    assert.ok(all.items.some(x => x.id === session.draft.requestId));
    const unchanged = await api(customer, 'GET', '/my/orders/' + order.id);
    assert.equal(unchanged.version, order.version); assert.equal(unchanged.status, order.status); assert.equal(unchanged.plannedDate, null);
    await card.getByRole('link', { name: 'Xem yêu cầu →' }).click();
    await page.getByText(session.draft.requestCode, { exact: false }).waitFor();
    await page.goto(base + '/account/assistant');
    await page.locator(`[data-session-id="${session.id}"]`).click();
    await page.getByRole('region', { name: 'Bản nháp yêu cầu' }).getByText(session.draft.requestCode, { exact: false }).waitFor();
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, order: order.code, sessionId: session.id, requestCode: session.draft.requestCode, checks: ['missing fields', 'explicit confirmation', 'edit', 'replay/race', 'owner isolation', 'admin queue', 'unchanged order', 'request link', 'reopen', 'desktop/mobile'] }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
