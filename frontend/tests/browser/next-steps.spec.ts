import { test, expect } from '@playwright/test';

for (const role of ['Customer', 'Admin', 'Guest']) {
  test(`${role} sees next steps without an automatic write`, async ({ page }) => {
    let turns = 0;
    await page.route('**/api/**', async route => {
      const path = new URL(route.request().url()).pathname;
      if (!path.startsWith('/api/')) return route.continue();
      if (path.endsWith('/me')) return route.fulfill({ status: role === 'Guest' ? 401 : 200, json: { id: 'owner', role, displayName: 'Demo' } });
      if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { token: 'csrf' } });
      if (path.endsWith('/my/orders')) return route.fulfill({ json: { items: [] } });
      if (path.endsWith('/assistant/sessions')) return route.fulfill({ json: route.request().method() === 'POST' ? { id: 'session', version: 1, messages: [] } : [] });
      if (path.endsWith('/admin/assistant/messages')) {
        turns++;
        return route.fulfill({ json: { answer: 'Dữ liệu đơn đã tra cứu.', grounded: true, status: 'ok', retrievedAt: '2026-10-11T10:00:00Z', data: { scope: 'orders', items: [{ code: 'AW-ONE', remainingVnd: 1000 }] }, links: [{ title: 'AW-ONE', path: '/admin/orders/one' }] } });
      }
      if (path === '/api/chat/turns') {
        turns++;
        return route.fulfill({ json: { answer: 'Bạn không có quyền xem doanh thu nội bộ.', grounded: false, status: 'forbidden', contexts: [] } });
      }
      if (path.endsWith('/turns')) {
        turns++;
        return route.fulfill({ json: { id: 'session', version: 2, messages: [{ role: 'assistant', content: 'Tiến độ đơn của bạn.', status: 'ok', orderCode: 'AW-ONE', detailUrl: '/account/orders/one' }] } });
      }
      return route.fulfill({ json: { id: 'session', version: 2, messages: [] } });
    });
    await page.goto(role === 'Admin' ? '/admin/assistant' : '/chat');
    const input = page.getByRole('textbox', { name: role === 'Admin' ? 'Câu hỏi cho trợ lý' : 'Câu hỏi', exact: true });
    await input.fill(role === 'Guest' ? 'Doanh thu cửa hàng?' : 'Kiểm tra đơn AW-ONE');
    await page.getByRole('button', { name: role === 'Guest' ? 'Gửi →' : 'Gửi câu hỏi', exact: true }).click();
    const steps = page.getByRole('region', { name: 'Bước tiếp theo' }).last();
    await expect(steps).toBeVisible();
    expect(turns).toBe(1);
    await steps.getByRole('button').first().click();
    await expect(input).not.toHaveValue('');
    expect(turns).toBe(1);
    if (role !== 'Admin') expect(await steps.locator('a[href^="/admin/"]').count()).toBe(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await page.screenshot({ path: `test-results/next-steps-${role}-${test.info().project.name}.png`, fullPage: true });
  });
}
