const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const path = require('node:path');
const base = process.env.ORDERS_URL || 'http://localhost:5173'; const root = base + '/api/orders-service';
(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: true });
  try {
    const customer = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const admin = await browser.newContext({ viewport: { width: 1440, height: 1000 } }); const other = await browser.newContext(); const errors = [];
    async function api(ctx, method, route, data, expected = 200) {
      const headers = {}; if (method !== 'GET') { headers['X-CSRF-TOKEN'] = (await (await ctx.request.get(root + '/auth/csrf')).json()).token; headers['Idempotency-Key'] = crypto.randomUUID(); }
      const response = await ctx.request.fetch(root + route, { method, data, headers }); const text = await response.text(); assert.equal(response.status(), expected, route + ': ' + text); return text ? JSON.parse(text) : null;
    }
    await api(customer, 'POST', '/auth/login', { email: 'customer3@autowise.test', password: 'DemoCustomer!2026' }); await api(admin, 'POST', '/auth/login', { email: 'admin@autowise.test', password: 'DemoAdmin!2026' }); await api(other, 'POST', '/auth/login', { email: 'customer4@autowise.test', password: 'DemoCustomer!2026' });
    const page = await customer.newPage(); page.on('pageerror', e => errors.push(e.message)); await page.goto(base + '/account/assistant');
    let response = page.waitForResponse(r => r.url().endsWith('/assistant/sessions') && r.request().method() === 'POST'); await page.getByRole('button', { name: '+ Hội thoại mới', exact: true }).click(); let session = await (await response).json();
    await page.getByRole('button', { name: 'Chuẩn bị phiếu hỗ trợ', exact: true }).click();
    response = page.waitForResponse(r => r.url().endsWith('/messages')); await page.getByRole('button', { name: 'Gửi câu hỏi', exact: true }).click(); session = await (await response).json();
    const card = page.getByRole('region', { name: 'Bản nháp hỗ trợ' }); await card.waitFor(); assert.equal(session.draft.type, 'support'); assert.equal(session.draft.ready, false);
    await card.getByLabel('Chủ đề hỗ trợ').fill('Khoản chuyển chưa cập nhật'); await card.getByLabel('Tóm tắt vấn đề').fill('Tôi đã chuyển tiền nhưng chưa cập nhật, nhờ nhân viên kiểm tra.');
    response = page.waitForResponse(r => r.url().endsWith('/draft-actions')); await card.getByRole('button', { name: 'Lưu bản nháp hỗ trợ', exact: true }).click(); session = await (await response).json(); assert.equal(session.draft.ready, true);
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-05/ui-draft-desktop.png'), fullPage: true });
    const confirm = { requestId: crypto.randomUUID(), version: session.version, draftId: session.draft.id, draftVersion: session.draft.version, action: 'confirm' };
    await api(other, 'POST', `/assistant/sessions/${session.id}/draft-actions`, confirm, 404);
    response = page.waitForResponse(r => r.url().endsWith('/draft-actions')); await card.getByRole('button', { name: 'Xác nhận gửi phiếu', exact: true }).click(); session = await (await response).json(); const id = session.draft.requestId;
    const replays = await Promise.all([api(customer, 'POST', `/assistant/sessions/${session.id}/draft-actions`, confirm), api(customer, 'POST', `/assistant/sessions/${session.id}/draft-actions`, { ...confirm, requestId: crypto.randomUUID() })]); assert.ok(replays.every(s => s.draft.requestId === id));
    await card.getByRole('link', { name: 'Xem phiếu hỗ trợ →' }).click(); await page.getByRole('heading', { name: session.draft.requestCode + ' · Khoản chuyển chưa cập nhật', exact: true }).waitFor();
    await api(other, 'GET', '/my/support-tickets/' + id, undefined, 404); await api(customer, 'POST', '/admin/support-tickets/' + id + '/actions', { version: 1, action: 'accept' }, 403);
    const adminPage = await admin.newPage(); adminPage.on('pageerror', e => errors.push(e.message)); await adminPage.goto(base + '/admin/support-tickets/' + id);
    response = adminPage.waitForResponse(r => r.url().endsWith('/actions')); await adminPage.getByRole('button', { name: 'Tiếp nhận phiếu', exact: true }).click(); let ticket = await (await response).json(); assert.equal(ticket.status, 'in_progress');
    await adminPage.getByLabel('Nội dung phản hồi', { exact: true }).fill('INTERNAL_US05_NOTE'); await adminPage.getByLabel('Ghi chú nội bộ (khách không thấy)').check();
    response = adminPage.waitForResponse(r => r.url().endsWith('/replies')); await adminPage.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click(); ticket = await (await response).json();
    const visible = await api(customer, 'GET', '/my/support-tickets/' + id); assert.ok(!JSON.stringify(visible).includes('INTERNAL_US05_NOTE')); assert.equal(visible.replies.totalCount, 0);
    await adminPage.getByLabel('Ghi chú nội bộ (khách không thấy)').uncheck(); await adminPage.getByLabel('Nội dung phản hồi', { exact: true }).fill('Đã tiếp nhận vấn đề, đang kiểm tra khoản chuyển.');
    response = adminPage.waitForResponse(r => r.url().endsWith('/replies')); await adminPage.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click(); ticket = await (await response).json();
    response = adminPage.waitForResponse(r => r.url().endsWith('/actions')); await adminPage.getByRole('button', { name: 'Đánh dấu đã giải quyết', exact: true }).click(); ticket = await (await response).json(); assert.equal(ticket.status, 'resolved');
    await page.getByRole('button', { name: 'Tải lại phiếu', exact: true }).click(); await page.getByText('Đã tiếp nhận vấn đề, đang kiểm tra khoản chuyển.', { exact: true }).waitFor(); assert.ok(!(await page.locator('body').innerText()).includes('INTERNAL_US05_NOTE'));
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-05/ui-customer-desktop.png'), fullPage: true });
    await page.setViewportSize({ width: 390, height: 844 }); assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)); await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-05/ui-customer-mobile.png'), fullPage: true });
    await page.getByLabel('Nội dung phản hồi', { exact: true }).fill('Tôi cần kiểm tra thêm, chưa thấy cập nhật.'); response = page.waitForResponse(r => r.url().endsWith('/replies')); await page.getByRole('button', { name: 'Gửi phản hồi', exact: true }).click(); ticket = await (await response).json(); assert.equal(ticket.status, 'in_progress');
    await adminPage.getByRole('button', { name: 'Tải lại phiếu', exact: true }).click(); await adminPage.getByText('Tôi cần kiểm tra thêm, chưa thấy cập nhật.', { exact: true }).waitFor();
    await adminPage.evaluate(() => window.scrollTo(0, 0));
    await adminPage.screenshot({ path: path.resolve('docs/features/order-assistant/us-05/ui-admin-desktop.png'), fullPage: true });
    response = adminPage.waitForResponse(r => r.url().endsWith('/actions')); await adminPage.getByRole('button', { name: 'Đánh dấu đã giải quyết', exact: true }).click(); ticket = await (await response).json(); response = adminPage.waitForResponse(r => r.url().endsWith('/actions')); await adminPage.getByRole('button', { name: 'Đóng phiếu', exact: true }).click(); ticket = await (await response).json(); assert.equal(ticket.status, 'closed');
    await api(customer, 'POST', '/my/support-tickets/' + id + '/replies', { version: ticket.version, content: 'late' }, 422);
    assert.deepEqual(errors, []); console.log(JSON.stringify({ ok: true, ticket: ticket.code, id, sessionId: session.id, checks: ['no order', 'preview/edit/confirm', 'race/replay', 'owner/roles', 'internal privacy', 'admin accept/reply/resolve/close', 'customer reply/reopen', 'no SLA', 'desktop/mobile'] }));
  } finally { await browser.close(); }
})().catch(e => { console.error(e); process.exitCode = 1; });
