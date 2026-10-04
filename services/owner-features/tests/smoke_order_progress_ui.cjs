// Local Docker smoke: creates an isolated demo order for customer2, never edits existing orders.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const base = process.env.ORDERS_URL || 'http://localhost:5173';
const root = base + '/api/orders-service';

(async () => {
  const browser = await chromium.launch({ channel: process.env.UI_BROWSER_CHANNEL || 'msedge', headless: true });
  let page;
  try {
    const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const customer = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    async function api(context, method, route, data, expected = 200) {
      const headers = {};
      if (method !== 'GET') {
        const csrf = await context.request.get(root + '/auth/csrf');
        headers['X-CSRF-TOKEN'] = (await csrf.json()).token;
        headers['Idempotency-Key'] = crypto.randomUUID();
      }
      const response = await context.request.fetch(root + route, { method, data, headers });
      assert.equal(response.status(), expected, `${route}: ${await response.text()}`);
      const body = await response.text();
      return body ? JSON.parse(body) : null;
    }
    await api(admin, 'POST', '/auth/login', { email: 'admin@autowise.test', password: 'DemoAdmin!2026' });
    await api(customer, 'POST', '/auth/login', { email: 'customer2@autowise.test', password: 'DemoCustomer!2026' });
    const user = await api(customer, 'GET', '/me');
    let order = await api(admin, 'POST', '/admin/orders', { customerId: user.id, carId: 'car_34_3', dealerId: 4, totalVnd: 1000000, depositRequiredVnd: 0, variant: 'US-02 UI smoke' });
    const orderRoute = '/admin/orders/' + order.id;
    for (const status of ['confirmed', 'preparing_vehicle']) {
      order = await api(admin, 'POST', orderRoute + '/transitions', { version: order.version, status, reason: 'INTERNAL_US02_STATUS' });
    }
    const adminPage = await admin.newPage();
    adminPage.on('pageerror', error => errors.push(error.message));
    await adminPage.goto(base + '/admin/orders/' + order.id);
    await adminPage.getByLabel('Thông tin chờ hiển thị cho khách (tùy chọn)').fill('Chờ đại lý kiểm tra xe trước bàn giao.');
    await adminPage.getByLabel('Lý do cập nhật thông tin chờ (ghi nhận nội bộ)').fill('INTERNAL_US02_NOTE');
    let saved = adminPage.waitForResponse(r => r.url().endsWith('/progress-note') && r.request().method() === 'PUT');
    await adminPage.getByRole('button', { name: 'Lưu thông tin chờ', exact: true }).click();
    order = await (await saved).json();
    assert.equal(order.customerWaitingReason, 'Chờ đại lý kiểm tra xe trước bàn giao.');
    const form = () => adminPage.locator('form').filter({ has: adminPage.getByRole('button', { name: 'Lưu lịch bàn giao', exact: true }) });
    await form().getByLabel('Ngày dự kiến', { exact: true }).fill('2026-10-15');
    await form().getByLabel('Lý do cập nhật', { exact: true }).fill('INTERNAL_US02_SCHEDULE');
    await form().getByRole('checkbox', { name: 'Đại lý xác nhận lịch bàn giao này' }).check();
    saved = adminPage.waitForResponse(r => r.url().endsWith('/delivery') && r.request().method() === 'PUT');
    await form().getByRole('button', { name: 'Lưu lịch bàn giao', exact: true }).click();
    order = await (await saved).json();
    assert.equal(order.deliveryScheduleConfirmed, true);
    const customerOrder = await api(customer, 'GET', '/my/orders/' + order.id);
    assert.ok(!JSON.stringify(customerOrder).includes('INTERNAL_US02_NOTE'));
    await api(customer, 'PUT', orderRoute + '/progress-note', { version: order.version, customerWaitingReason: 'forbidden', reason: 'test' }, 403);

    page = await customer.newPage();
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/account/assistant');
    const created = page.waitForResponse(r => r.url().endsWith('/assistant/sessions') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '+ Hội thoại mới', exact: true }).click();
    const sessionId = (await (await created).json()).id;
    await page.getByLabel('Đơn cần tra cứu').selectOption(order.id);
    async function send(text) {
      await page.getByLabel('Câu hỏi', { exact: true }).fill(text);
      const response = page.waitForResponse(r => r.url().endsWith('/messages') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Gửi câu hỏi', exact: true }).click();
      const result = await (await response).json();
      await page.waitForFunction(() => document.querySelector('textarea')?.value === '', null, { timeout: 60000 });
      return result.messages.at(-1);
    }
    let reply = await send('Tiến độ và còn phải trả bao nhiêu?');
    assert.deepEqual(reply.sections.map(s => s.topic), ['status', 'payment']);
    assert.equal(reply.sections[0].progress.schedule.state, 'confirmed');
    assert.equal(reply.sections[0].progress.timeline.length, 4);
    assert.ok(!JSON.stringify(reply).includes('INTERNAL_US02'));
    const latest = () => page.locator('.order-chat-message.assistant').last();
    await latest().locator('.order-progress').waitFor();
    assert.ok((await latest().innerText()).includes('Chờ đại lý kiểm tra xe trước bàn giao.'));
    assert.ok((await latest().innerText()).includes('1.000.000'));
    assert.equal(await latest().locator('.order-progress-timeline li').count(), 4);
    assert.equal(await latest().locator('.order-progress-action').count(), 2);
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.order-chat-messages').scrollTop = 0; });
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-02/ui-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-02/ui-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });

    // Changing the date without explicitly confirming again must return to planned.
    await form().getByLabel('Ngày dự kiến', { exact: true }).fill('2026-10-16');
    await form().getByLabel('Lý do cập nhật', { exact: true }).fill('INTERNAL_US02_RESCHEDULE');
    assert.equal(await form().getByRole('checkbox').isChecked(), false);
    saved = adminPage.waitForResponse(r => r.url().endsWith('/delivery') && r.request().method() === 'PUT');
    await form().getByRole('button', { name: 'Lưu lịch bàn giao', exact: true }).click();
    order = await (await saved).json();
    reply = await send('Tiến độ và lịch giao?');
    assert.equal(reply.sections[0].progress.schedule.state, 'planned');
    assert.equal(reply.sections[0].progress.schedule.plannedDate, '2026-10-16');
    assert.ok(reply.sections[1].content.includes('Chưa được đại lý xác nhận'));
    order = await api(admin, 'POST', orderRoute + '/transitions', { version: order.version, status: 'ready_for_handover', reason: 'INTERNAL_US02_READY' });
    reply = await send('Tôi cần làm gì tiếp?');
    assert.equal(reply.tool, 'GetMyOrderProgress');
    assert.equal(reply.sections[0].progress.status, 'ready_for_handover');
    assert.equal(reply.sections[0].progress.waitingReason, null);
    assert.ok(reply.sections[0].progress.nextActions.some(a => a.actor === 'customer' && a.content.includes('còn phải trả')));
    await page.reload();
    await page.locator(`[data-session-id="${sessionId}"]`).click();
    await latest().locator('.order-progress').waitFor();
    assert.ok((await latest().innerText()).includes('Chờ bàn giao'));
    assert.deepEqual(errors, []);
    console.log('PASS US-02 UI/API: public note, confirmed/revised schedule, private audit, roles, timeline, next actions, payment, fresh data, reopen, mobile.');
    console.log('Test order:', order.code);
  } catch (error) {
    if (page) await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-02/ui-failure.png'), fullPage: true });
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
