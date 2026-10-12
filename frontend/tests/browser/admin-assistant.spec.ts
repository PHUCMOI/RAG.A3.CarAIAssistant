import { test, expect, type Page } from '@playwright/test';

async function openFilters(page: Page) {
  const toggle = page.getByRole('button', { name: /Phạm vi tra cứu/ });
  if (await toggle.isVisible() && await toggle.getAttribute('aria-expanded') === 'false') await toggle.click();
}

test('admin can ask with filters, open records and retry failures', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/orders-service/**', async route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me')) return route.fulfill({ json: { id: 'admin', displayName: 'Admin demo', role: 'Admin' } });
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { token: 'test' } });
    if (path.endsWith('/admin/assistant/messages')) {
      calls++;
      if (calls === 1) return route.fulfill({ status: 503, json: { detail: 'AI tạm thời không khả dụng' } });
      expect(route.request().postDataJSON()).toMatchObject({ scope: 'orders', status: 'confirmed', query: 'AW-DEMO-0001' });
      return route.fulfill({ json: { answer: '**AW-DEMO-0001** đã xác nhận.', grounded: true, status: 'ok', retrievedAt: '2026-10-10T12:00:00Z', links: [{ title: 'AW-DEMO-0001', path: '/admin/orders/one' }] } });
    }
    return route.fulfill({ status: 404, json: { detail: 'Không có dữ liệu mock' } });
  });
  await page.goto('/admin/assistant');
  await expect(page.getByRole('heading', { name: 'Trợ lý AI quản trị' })).toBeVisible();
  await expect(page.locator('.admin-ai-welcome-mark')).toBeInViewport({ ratio: 1 });
  await page.screenshot({ path: `test-results/admin-assistant-welcome-${test.info().project.name}.png`, fullPage: true });
  await openFilters(page);
  await page.getByLabel('Nhóm dữ liệu').selectOption('orders');
  await page.getByLabel('Mã đơn', { exact: true }).fill('AW-DEMO-0001');
  await page.getByRole('combobox', { name: 'Trạng thái', exact: true }).selectOption('confirmed');
  await page.getByLabel('Câu hỏi cho trợ lý').fill('Kiểm tra đơn');
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
  await expect(page.getByRole('alert')).toContainText('AI tạm thời');
  await expect(page.getByLabel('Câu hỏi cho trợ lý')).toHaveValue('Kiểm tra đơn');
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
  await expect(page.getByRole('link', { name: 'AW-DEMO-0001' })).toHaveAttribute('href', '/admin/orders/one');
  await expect(page.getByText(/Đã kiểm chứng với dữ liệu/)).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: `test-results/admin-assistant-${test.info().project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Hội thoại mới' }).click();
  await expect(page.getByRole('link', { name: 'AW-DEMO-0001' })).toHaveCount(0);
});

test('customer is redirected away from admin assistant', async ({ page }) => {
  await page.route('**/api/orders-service/me', route => route.fulfill({ json: { id: 'customer', displayName: 'Khách', role: 'Customer' } }));
  await page.route('**/api/orders-service/my/orders**', route => route.fulfill({ json: { items: [], totalCount: 0, pageNumber: 1, pageSize: 20 } }));
  await page.goto('/admin/assistant');
  await expect(page).toHaveURL(/\/account\/orders/);
  await expect(page.getByRole('heading', { name: 'Trợ lý AI quản trị' })).toHaveCount(0);
});

test('admin can select a revenue period', async ({ page }) => {
  await page.route('**/api/orders-service/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me')) return route.fulfill({ json: { id: 'admin', displayName: 'Admin', role: 'Admin' } });
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { token: 'test' } });
    if (path.endsWith('/admin/assistant/messages')) {
      expect(route.request().postDataJSON()).toMatchObject({ scope: 'revenue', dateFrom: '2026-09-01', dateTo: '2026-09-30' });
      return route.fulfill({ json: { answer: 'Doanh thu vận hành: **500000000 VND**. Tiền thu ròng: **100000000 VND**.', grounded: true, retrievedAt: '2026-10-10T12:00:00Z', links: [] } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/admin/assistant');
  await openFilters(page);
  await page.getByRole('combobox', { name: 'Nhóm dữ liệu', exact: true }).selectOption('revenue');
  await page.getByLabel('Từ ngày', { exact: true }).fill('2026-09-01');
  await page.getByLabel('Đến ngày', { exact: true }).fill('2026-09-30');
  await page.getByLabel('Câu hỏi cho trợ lý').fill('Doanh thu trong kỳ?');
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click();
  await expect(page.getByText('500000000 VND', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('suggestions prepare a question and keyboard submission preserves the answer scope', async ({ page }) => {
  let calls = 0;
  await page.route('**/api/orders-service/**', route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith('/me')) return route.fulfill({ json: { id: 'admin', displayName: 'Admin demo', role: 'Admin' } });
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { token: 'test' } });
    if (path.endsWith('/admin/assistant/messages')) {
      calls++;
      expect(route.request().postDataJSON()).toMatchObject({ scope: 'revenue', dateFrom: null, dateTo: null });
      return route.fulfill({ json: { answer: 'Doanh thu vận hành: **500000000 VND**.', grounded: true, status: 'ok', retrievedAt: '2026-10-12T12:00:00Z', links: [] } });
    }
    return route.fulfill({ status: 404 });
  });
  await page.goto('/admin/assistant');
  await page.getByRole('button', { name: /Doanh thu tháng này/ }).click();
  const question = page.getByLabel('Câu hỏi cho trợ lý');
  await expect(question).toBeFocused();
  await expect(question).toHaveValue('Doanh thu và tiền thu ròng tháng này là bao nhiêu?');
  expect(calls).toBe(0);
  await question.press('Control+Enter');
  await expect(page.getByText('500000000 VND', { exact: true })).toBeVisible();
  await openFilters(page);
  await page.getByLabel('Nhóm dữ liệu').selectOption('orders');
  await expect(page.getByLabel('Phạm vi đã sử dụng')).toContainText('Doanh thu và dòng tiền');
  await expect(page.locator('.admin-ai-composer-context')).toContainText('Đơn hàng và thanh toán');
  const toggle = page.getByRole('button', { name: /Phạm vi tra cứu/ });
  if (await toggle.isVisible()) {
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-expanded', 'false');
    await expect(page.getByLabel('Nhóm dữ liệu')).toBeHidden();
  }
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
