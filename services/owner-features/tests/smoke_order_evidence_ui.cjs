const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const base = process.env.ORDERS_URL || 'http://localhost:5173';
const root = base + '/api/orders-service';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const customer = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const other = await browser.newContext(); const errors = [];
    async function api(ctx, method, route, data, expected = 200) {
      const headers = {};
      if (method !== 'GET') { headers['X-CSRF-TOKEN'] = (await (await ctx.request.get(root + '/auth/csrf')).json()).token; headers['Idempotency-Key'] = crypto.randomUUID(); }
      const response = await ctx.request.fetch(root + route, { method, data, headers }); const text = await response.text();
      assert.equal(response.status(), expected, `${route}: ${text}`); return text ? JSON.parse(text) : null;
    }
    await api(admin, 'POST', '/auth/login', { email: 'admin@autowise.test', password: 'DemoAdmin!2026' });
    await api(customer, 'POST', '/auth/login', { email: 'customer3@autowise.test', password: 'DemoCustomer!2026' });
    await api(other, 'POST', '/auth/login', { email: 'customer4@autowise.test', password: 'DemoCustomer!2026' });
    const user = await api(customer, 'GET', '/me');
    let order = await api(admin, 'POST', '/admin/orders', { customerId: user.id, carId: 'car_34_3', dealerId: 4, totalVnd: 1000000, depositRequiredVnd: 200000, variant: 'US-04 UI smoke' });
    const route = '/admin/orders/' + order.id;
    let session = await api(customer, 'POST', '/assistant/sessions', { id: crypto.randomUUID() });
    const page = await customer.newPage(); page.on('pageerror', e => errors.push(e.message));
    await page.goto(base + '/account/assistant'); await page.locator(`[data-session-id="${session.id}"]`).click();
    await page.getByLabel('Đơn cần tra cứu').selectOption(order.id);
    async function send(text) {
      await page.getByLabel('Câu hỏi', { exact: true }).fill(text); const response = page.waitForResponse(r => r.url().endsWith('/messages') && r.request().method() === 'POST');
      await page.getByRole('button', { name: 'Gửi câu hỏi', exact: true }).click(); session = await (await response).json();
      await page.waitForFunction(() => document.querySelector('textarea[aria-label="Câu hỏi"]')?.value === ''); return session.messages.at(-1);
    }
    let reply = await send('Thanh toán và giấy tờ còn thiếu?');
    assert.equal(reply.sections[0].payment.transactions.totalCount, 0); assert.equal(reply.sections[1].documents.checklist.totalCount, 0);
    assert.ok(reply.sections[1].content.includes('chưa cấu hình'));
    const adminPage = await admin.newPage(); adminPage.on('pageerror', e => errors.push(e.message));
    await adminPage.goto(base + '/admin/orders/' + order.id);
    const docs = adminPage.getByRole('region', { name: 'Checklist hồ sơ' });
    await docs.getByText('Thêm giấy tờ cho đơn này', { exact: true }).click();
    const form = docs.locator('form').last();
    await form.getByLabel('Loại giấy tờ').fill('CCCD'); await form.getByLabel('Bắt buộc cho đơn này').check();
    await form.getByLabel('Trạng thái hồ sơ').selectOption('needs_changes'); await form.getByLabel('Ghi chú dành cho khách').fill('Ảnh bị mờ, cần bản rõ hơn.');
    let response = adminPage.waitForResponse(r => r.url().includes('/documents/') && r.request().method() === 'PUT');
    await form.getByRole('button', { name: 'Thêm mục hồ sơ' }).click(); const doc = await (await response).json();
    await docs.getByText('CCCD · Bắt buộc', { exact: true }).waitFor();
    await api(customer, 'PUT', route + '/documents/' + doc.id, { version: doc.version, name: 'CCCD', required: true, status: 'valid', customerNote: null }, 403);
    for (let i = 0; i < 12; i++) {
      order = await api(admin, 'POST', route + '/payments', { version: order.version, type: 'receipt', amountVnd: i === 0 ? 600000 : 1000, reference: `US04-${order.id.slice(0, 8)}-${i}`, originalReceiptId: null });
      const p = order.payments.at(-1);
      if (i === 0) order = await api(admin, 'POST', route + '/payments/' + p.id + '/confirm', { version: order.version });
      if (i === 1) order = await api(admin, 'POST', route + '/payments/' + p.id + '/fail', { version: order.version, reason: 'Chưa nhận được khoản chuyển.' });
    }
    const receipt = order.payments[0];
    order = await api(admin, 'POST', route + '/payments', { version: order.version, type: 'refund', amountVnd: 100000, reference: `US04-${order.id.slice(0, 8)}-REFUND`, originalReceiptId: receipt.id });
    const refund = order.payments.at(-1); order = await api(admin, 'POST', route + '/payments/' + refund.id + '/confirm', { version: order.version });
    reply = await send('Thanh toán và hồ sơ?');
    assert.deepEqual(reply.sections.map(s => s.topic), ['payment', 'documents']);
    const p = reply.sections[0].payment; assert.equal(p.receivedVnd, 600000); assert.equal(p.refundedVnd, 100000); assert.equal(p.netReceived, 500000); assert.equal(p.remainingVnd, 500000);
    assert.equal(p.transactions.items.length, 10); assert.equal(p.transactions.totalCount, 13); assert.ok(p.transactions.items.every(x => !x.documentUrl));
    assert.equal(reply.sections[1].documents.requiredOutstanding, 1);
    const latest = () => page.locator('.order-chat-message.assistant').last();
    const payments = latest().getByRole('region', { name: 'Chi tiết thanh toán' });
    await payments.getByRole('button', { name: 'Trang sau' }).click();
    await payments.getByText('Trang 2 · 13 mục', { exact: true }).waitFor();
    assert.ok((await payments.innerText()).includes('500.000')); assert.ok((await payments.innerText()).includes('Từ chối / thất bại'));
    await payments.getByRole('button', { name: 'Trang trước' }).click(); await payments.getByText('Trang 1 · 13 mục', { exact: true }).waitFor();
    await page.evaluate(() => { window.scrollTo(0, 0); document.querySelector('.order-chat-messages').scrollTop = document.querySelector('.order-chat-messages').scrollHeight; });
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-04/ui-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-04/ui-mobile.png'), fullPage: true });
    await page.evaluate(() => { const box = document.querySelector('.order-chat-messages'); const message = [...document.querySelectorAll('.order-chat-message.assistant')].at(-1); box.scrollTop += message.getBoundingClientRect().top - box.getBoundingClientRect().top; });
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-04/ui-payment-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-04/ui-payment-desktop.png'), fullPage: true });
    await api(other, 'GET', `/my/orders/${order.id}/payment-details`, undefined, 404);
    await api(other, 'GET', `/my/orders/${order.id}/payments/${receipt.id}`, undefined, 404);
    await api(other, 'GET', `/my/orders/${order.id}/documents`, undefined, 404);
    await api(customer, 'GET', `/my/orders/${order.id}/payment-details?pageSize=21`, undefined, 422);
    await api(customer, 'GET', `/my/orders/${order.id}/payments/${receipt.id}/document`, undefined, 404);
    reply = await send('Giao dịch hôm nay?'); assert.equal(reply.sections[0].payment.matchStatus, 'ambiguous');
    reply = await send('Mã giao dịch ' + receipt.reference); assert.equal(reply.sections[0].payment.matchStatus, 'matched');
    reply = await send('Mã giao dịch UNKNOWN-999'); assert.equal(reply.sections[0].payment.matchStatus, 'not_found');
    await docs.getByText('Sửa mục hồ sơ', { exact: true }).click(); const editor = docs.locator('form').first();
    await editor.getByLabel('Trạng thái hồ sơ').selectOption('valid'); await editor.getByLabel('Ghi chú dành cho khách').fill('Đã kiểm tra hợp lệ.');
    response = adminPage.waitForResponse(r => r.url().includes('/documents/') && r.request().method() === 'PUT');
    await editor.getByRole('button', { name: 'Lưu mục hồ sơ' }).click(); assert.equal((await (await response).json()).status, 'valid');
    reply = await send('Tôi thiếu giấy tờ nào?'); assert.equal(reply.sections[0].documents.requiredOutstanding, 0); assert.equal(reply.sections[0].documents.checklist.items[0].status, 'valid');
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ ok: true, order: order.code, sessionId: session.id, checks: ['missing source', 'admin UI create/edit', 'receipts/refunds/pending/failed', 'whole-order totals', 'pagination', 'ownership', 'no invented document', 'ambiguity/reference', 'fresh checklist', 'desktop/mobile'] }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
