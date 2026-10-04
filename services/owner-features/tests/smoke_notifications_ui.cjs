// Creates isolated local demo objects; does not edit existing demo orders or tickets.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const base = process.env.ORDERS_URL || 'http://localhost:5173'; const root = base + '/api/orders-service';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  let customer, initialPreference;
  async function api(ctx, method, route, data, expected = 200, key = crypto.randomUUID()) {
    const headers = {}; if (method !== 'GET') { headers['X-CSRF-TOKEN'] = (await (await ctx.request.get(root + '/auth/csrf')).json()).token; headers['Idempotency-Key'] = key; }
    const response = await ctx.request.fetch(root + route, { method, data, headers }); const text = await response.text();
    assert.equal(response.status(), expected, route + ': ' + text); return text ? JSON.parse(text) : null;
  }
  try {
    customer = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const admin = await browser.newContext(); const other = await browser.newContext(); const errors = [];
    await api(customer, 'POST', '/auth/login', { email: 'customer3@autowise.test', password: 'DemoCustomer!2026' });
    await api(admin, 'POST', '/auth/login', { email: 'admin@autowise.test', password: 'DemoAdmin!2026' });
    await api(other, 'POST', '/auth/login', { email: 'customer4@autowise.test', password: 'DemoCustomer!2026' });
    const user = await api(customer, 'GET', '/me'); initialPreference = await api(customer, 'GET', '/my/notification-preferences');
    let order = await api(admin, 'POST', '/admin/orders', { customerId: user.id, carId: 'car_34_3', dealerId: 4, totalVnd: 1000000, depositRequiredVnd: 0, variant: 'US-06 smoke' });
    const route = '/admin/orders/' + order.id;
    order = await api(admin, 'POST', route + '/transitions', { version: order.version, status: 'confirmed', reason: 'INTERNAL_US06_STATUS' });
    const statusVersion = order.version;
    order = await api(admin, 'PUT', route + '/delivery', { version: order.version, plannedDate: '2027-10-20', location: 'Đại lý', reason: 'INTERNAL_US06_SCHEDULE', confirmed: true });
    order = await api(admin, 'POST', route + '/payments', { version: order.version, type: 'receipt', amountVnd: 1000, reference: 'US06-' + crypto.randomUUID() });
    order = await api(admin, 'POST', route + '/payments/' + order.payments[0].id + '/confirm', { version: order.version });
    const document = await api(admin, 'PUT', route + '/documents/' + crypto.randomUUID(), { version: 0, name: 'CCCD US06', required: true, status: 'needs_changes', customerNote: 'Cần ảnh rõ hơn' });
    const change = await api(customer, 'POST', '/my/change-requests', { orderId: order.id, type: 'change', reason: 'Đổi ngày giao' });
    await api(admin, 'POST', '/admin/change-requests/' + change.id + '/decision', { version: change.version, decision: 'approved', reason: 'Đã duyệt đề nghị; chưa đổi lịch' });
    let session = await api(customer, 'POST', '/assistant/sessions', { id: crypto.randomUUID() });
    session = await api(customer, 'POST', `/assistant/sessions/${session.id}/messages`, { requestId: crypto.randomUUID(), version: session.version, content: 'Tôi muốn gặp nhân viên hỗ trợ', orderId: order.id });
    async function draft(action, fields = {}) { session = await api(customer, 'POST', `/assistant/sessions/${session.id}/draft-actions`, { requestId: crypto.randomUUID(), version: session.version, draftId: session.draft.id, draftVersion: session.draft.version, action, ...fields }); }
    await draft('edit', { subject: 'US06 kiểm tra thông báo', reason: 'Nhờ nhân viên kiểm tra đơn', linkedOrderId: order.id }); await draft('confirm');
    const ticketId = session.draft.requestId; let ticket = await api(admin, 'GET', '/admin/support-tickets/' + ticketId);
    ticket = await api(admin, 'POST', `/admin/support-tickets/${ticketId}/replies`, { version: ticket.version, content: 'INTERNAL_US06_SUPPORT', internal: true });
    const replyKey = crypto.randomUUID(); const replyInput = { version: ticket.version, content: 'Đã tiếp nhận kiểm tra đơn này', internal: false };
    ticket = await api(admin, 'POST', `/admin/support-tickets/${ticketId}/replies`, replyInput, 200, replyKey);
    await api(admin, 'POST', `/admin/support-tickets/${ticketId}/replies`, replyInput, 200, replyKey);
    const belongs = n => n.detailUrl === '/account/orders/' + order.id || n.detailUrl === '/account/support-tickets/' + ticketId || n.detailUrl === '/account/change-requests?requestId=' + change.id;
    let notices = [];
    for (let i = 0; i < 30; i++) { notices = (await api(customer, 'GET', '/my/notifications')).items.filter(belongs); if (notices.length === 7) break; await new Promise(r => setTimeout(r, 1000)); }
    assert.equal(notices.length, 7); assert.equal(new Set(notices.map(n => n.type)).size, 7);
    assert.ok(!JSON.stringify(notices).includes('INTERNAL_US06')); assert.ok(!notices.some(n => n.type === 'delivery_reminder'));
    const oldStatus = notices.find(n => n.type === 'order_status'); assert.ok(oldStatus.title.includes('đã xác nhận')); assert.equal(oldStatus.eventKey, 'order:' + order.id + ':' + statusVersion);
    assert.equal(notices.find(n => n.type === 'change_decision').detailUrl, '/account/change-requests?requestId=' + change.id);
    assert.ok(!(await api(other, 'GET', '/my/notifications')).items.some(belongs));
    await api(other, 'POST', '/my/notifications/' + oldStatus.id + '/read', undefined, 404);
    await api(other, 'GET', '/my/orders/' + order.id, undefined, 404);
    await api(customer, 'GET', '/admin/notification-outbox/failures', undefined, 403);
    await api(customer, 'POST', '/admin/notification-outbox/' + crypto.randomUUID() + '/retry', undefined, 403);
    assert.ok(Array.isArray(await api(admin, 'GET', '/admin/notification-outbox/failures')));
    const page = await customer.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.goto(base + '/account/notifications');
    await page.getByRole('heading', { name: 'Thông báo', exact: true }).waitFor();
    await page.getByRole('button', { name: initialPreference.deliveryRemindersEnabled ? 'Tắt nhắc lịch' : 'Bật nhắc lịch', exact: true }).click();
    await page.getByRole('button', { name: initialPreference.deliveryRemindersEnabled ? 'Bật nhắc lịch' : 'Tắt nhắc lịch', exact: true }).waitFor();
    await page.reload(); await page.getByRole('button', { name: initialPreference.deliveryRemindersEnabled ? 'Bật nhắc lịch' : 'Tắt nhắc lịch', exact: true }).waitFor();
    const row = page.locator('section.account-list-row').filter({ hasText: oldStatus.title });
    await row.getByRole('button', { name: 'Đánh dấu đã đọc', exact: true }).click(); await row.getByText(/Đã đọc/).waitFor();
    await page.reload(); await row.getByText(/Đã đọc/).waitFor();
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-06/ui-notifications-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-06/ui-notifications-mobile.png'), fullPage: true });
    order = await api(admin, 'POST', route + '/transitions', { version: order.version, status: 'preparing_vehicle', reason: 'INTERNAL_US06_NEW_STATUS' });
    await row.getByRole('link', { name: 'Hỏi trợ lý về đơn này →', exact: true }).click();
    await page.getByRole('heading', { name: 'Trợ lý đơn hàng', exact: true }).waitFor();
    await page.getByRole('button', { name: '+ Hội thoại mới', exact: true }).click();
    await page.getByLabel('Đơn cần tra cứu').waitFor(); assert.equal(await page.getByLabel('Đơn cần tra cứu').inputValue(), order.id);
    await page.getByLabel('Câu hỏi', { exact: true }).fill('Tiến độ đơn này?');
    const response = page.waitForResponse(r => r.url().endsWith('/messages') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Gửi câu hỏi', exact: true }).click(); const fresh = await (await response).json();
    assert.equal(fresh.messages.at(-1).sections[0].progress.status, 'preparing_vehicle');
    await page.locator('.order-progress > p > strong').filter({ hasText: 'Đang chuẩn bị xe' }).waitFor();
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-06/ui-chat-fresh-mobile.png'), fullPage: true });
    const deniedPage = await other.newPage(); await deniedPage.goto(base + oldStatus.chatUrl);
    await deniedPage.getByText('Có lỗi xảy ra', { exact: true }).waitFor(); assert.ok(!(await deniedPage.locator('body').innerText()).includes(order.code));
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, order: order.code, orderId: order.id, ticketId, documentId: document.id, types: notices.map(n => n.type), checks: ['worker delivery', 'public-only content', 'retry/replay dedup', 'owner/roles', 'preferences/read persisted', 'desktop/mobile', 'chat fresh data', 'foreign chat denied'] }));
  } finally { if (customer && initialPreference) await api(customer, 'PUT', '/my/notification-preferences', initialPreference); await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
