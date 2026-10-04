// Run against rebuilt local Docker. NODE_PATH may point to bundled Playwright.
const { chromium } = require('playwright');
const assert = require('node:assert/strict');
const path = require('node:path');
const base = process.env.ORDERS_URL || 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ channel: process.env.UI_BROWSER_CHANNEL || 'msedge', headless: true });
  let page;
  try {
    page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/account/assistant');
    await page.getByLabel('Email', { exact: true }).fill('customer1@autowise.test');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('DemoCustomer!2026');
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    const createdResponse = page.waitForResponse(response => response.url().endsWith('/assistant/sessions') && response.request().method() === 'POST');
    await page.getByRole('button', { name: '+ Hội thoại mới', exact: true }).click();
    const sessionId = (await (await createdResponse).json()).id;
    const composer = page.getByLabel('Câu hỏi', { exact: true });
    async function send(text) {
      await composer.fill(text);
      await page.getByRole('button', { name: 'Gửi câu hỏi', exact: true }).click();
      await page.getByRole('button', { name: 'Gửi câu hỏi', exact: true }).waitFor();
      await page.waitForFunction(() => document.querySelector('textarea')?.value === '', null, { timeout: 60000 });
    }
    await send('Trạng thái, còn phải trả bao nhiêu và khi nào nhận xe?');
    assert.equal(await page.locator('.order-chat-section').count(), 0);
    await send('AW-DEMO-0001');
    const latest = () => page.locator('.order-chat-message.assistant').last();
    assert.deepEqual(await latest().locator('h3').allTextContents(), ['Trạng thái', 'Thanh toán', 'Bàn giao']);
    assert.equal(await latest().locator('.order-chat-section a').count(), 3);
    await page.reload();
    await page.locator(`[data-session-id="${sessionId}"]`).click();
    await latest().locator('h3').first().waitFor();
    assert.equal(await latest().locator('h3').count(), 3);
    assert.notEqual(await page.getByLabel('Đơn cần tra cứu').inputValue(), '');
    await send('Còn bảo hành thì sao?');
    assert.deepEqual(await latest().locator('h3').allTextContents(), ['Bảo hành']);

    // Simulate a competing writer: 409 must preserve the customer's input.
    await page.route('**/assistant/sessions/*/messages', async route => {
      await route.fulfill({ status: 409, contentType: 'application/problem+json', body: JSON.stringify({ title: 'Xung đột phiên', detail: 'Hội thoại đã được cập nhật.' }) });
    });
    const draft = 'Thanh toán và lịch giao?';
    await composer.fill(draft);
    await page.getByRole('button', { name: 'Gửi câu hỏi', exact: true }).click();
    await page.getByText('Có lỗi xảy ra', { exact: true }).waitFor();
    assert.equal(await composer.inputValue(), draft);
    await page.unroute('**/assistant/sessions/*/messages');
    await send(draft);
    assert.deepEqual(await latest().locator('h3').allTextContents(), ['Thanh toán', 'Bàn giao']);
    await page.setViewportSize({ width: 390, height: 844 });
    assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1));
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-01/ui-mobile.png'), fullPage: true });
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-01/ui-desktop.png'), fullPage: true });
    assert.deepEqual(errors, []);
    console.log('PASS multi-intent UI: clarification, three sections, reopen, warranty follow-up, 409 draft, retry, mobile.');
  } catch (error) {
    if (page) {
      await page.screenshot({ path: path.resolve('docs/features/order-assistant/us-01/ui-failure.png'), fullPage: true });
      console.error('Failure URL:', page.url());
    }
    throw error;
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
