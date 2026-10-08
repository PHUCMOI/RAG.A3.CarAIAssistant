import { test, expect, type Page } from '@playwright/test'
import { car } from '../fixtures'
test('home search, combined quick filter and comparison use shared catalogue routes', async ({ page }, testInfo) => {
  await mockApi(page);
  await page.route('**/api/sources', route => route.fulfill({ json: { items: [{ sourceId: 'a' }, { sourceId: 'b' }] } }));
  await page.goto('/');
  await expect(page.locator('.hero-car strong')).toHaveText('25');
  await expect(page.locator('.stat-chip.two strong')).toHaveText('2');
  await expect(page.locator('.car-card')).toHaveCount(6);
  await expect(page.locator('.car-card').first()).toContainText('Xăng');
  await page.getByRole('button', { name: '+ So sánh', exact: true }).nth(0).click();
  await page.getByRole('button', { name: '+ So sánh', exact: true }).nth(0).click();
  await expect(page.getByRole('link', { name: 'So sánh (2)' })).toHaveAttribute('href', '/compare?ids=1%2C2');
  await fits(page); await page.screenshot({ path: testInfo.outputPath('home.png'), fullPage: true });
  await page.getByRole('link', { name: 'SUV 7 chỗ', exact: true }).click();
  await expect(page).toHaveURL(/bodyType=SUV&seats=7/);
  await page.goto('/');
  await page.getByRole('textbox', { name: 'Tìm kiếm xe' }).fill('Toyota Mẫu 01');
  await page.getByRole('textbox', { name: 'Tìm kiếm xe' }).press('Enter');
  await expect(page).toHaveURL(/\/cars\?query=/);
  await expect(page.getByRole('heading', { name: 'Toyota Mẫu 01' })).toBeVisible();
});
test('car detail translates specs, preserves comparison and shows unavailable price', async ({ page }, testInfo) => {
  await mockApi(page);
  await page.goto('/cars/25');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toyota Mẫu 25');
  await expect(page.locator('.detail-price')).toHaveText('Chưa có giá tham khảo');
  await expect(page.locator('.spec-grid')).toContainText('Số tự động');
  await page.evaluate(() => localStorage.setItem('compareCars', JSON.stringify(['1'])));
  await page.reload();
  await page.getByRole('button', { name: '+ So sánh xe này' }).click();
  await expect(page.getByRole('button', { name: '✓ Đã chọn so sánh' })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('link', { name: 'Mở bảng so sánh →' })).toHaveAttribute('href', '/compare?ids=1%2C25');
  await expect(page.getByRole('link', { name: /Nguồn chính sách bảo hành/ })).toHaveAttribute('href', '/sources/warranty-source');
  await fits(page); await page.screenshot({ path: testInfo.outputPath('car-detail.png'), fullPage: true });
  await page.getByRole('link', { name: 'Hỏi về xe này' }).click();
  await expect(page).toHaveURL(/\/chat\?car=25/);
});
test('account overview uses server totals, retries independently and links to orders', async ({ page }, testInfo) => {
  const pageErrors: string[] = [];
  page.on('pageerror', error => pageErrors.push(error.message));
  await mockApi(page, 'Customer');
  await page.route('**/api/orders-service/my/orders/order-a', route => route.fulfill({ json: { id: 'order-a', code: 'AW-001', carName: 'Toyota Vios', brand: 'Toyota', customerName: 'Khách thử nghiệm', customerId: 'customer-a', carId: '1', dealerName: 'Đại lý Toyota', status: 'confirmed', totalVnd: 500000000, depositRequiredVnd: 0, netReceived: 0, remainingVnd: 500000000, version: 0, plannedDate: null, actualHandoverAt: null, deliveryLocation: null, createdAt: '2026-10-01', payments: [], history: [] } }));
  await page.route('**/api/orders-service/my/orders?*', route => route.fulfill({ json: { totalCount: 21, items: [{ id: 'order-a', code: 'AW-001', carName: 'Toyota Vios', status: 'confirmed', totalVnd: 500000000, createdAt: '2026-10-01' }, { id: 'order-b', code: 'AW-002', carName: 'Honda City', status: 'completed', totalVnd: 600000000, createdAt: '2026-09-01' }] } }));
  await page.route('**/api/orders-service/my/favorites', route => route.fulfill({ json: [{ carId: '1' }] }));
  await page.route('**/api/orders-service/my/orders/order-a/**', route => route.fulfill({ status: 503, json: { detail: 'Evidence unavailable in this fixture' } }));
  let noticesReady = false;
  await page.route('**/api/orders-service/my/notifications/unread-count', route => !noticesReady ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { count: 2 } }));
  await page.goto('/account');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Khách thử nghiệm');
  await expect(page.getByRole('region', { name: 'Đơn mua xe' })).toContainText('21');
  await expect(page.getByRole('region', { name: 'Xe yêu thích' })).toContainText('1');
  const noticesRegion = page.getByRole('region', { name: 'Thông báo chưa đọc' });
  await expect(noticesRegion.getByRole('button', { name: 'Thử lại' })).toBeVisible();
  noticesReady = true;
  await noticesRegion.getByRole('button', { name: 'Thử lại' }).click();
  await expect(noticesRegion).toContainText('2');
  await expect(page.getByRole('link', { name: /Toyota Vios/ })).toHaveAttribute('href', '/account/orders/order-a');
  await fits(page); await page.screenshot({ path: testInfo.outputPath('account-overview.png'), fullPage: true });
  await page.locator('.header-personal>.header-group-trigger').click();
  await expect(page.locator('.header-user-summary')).toBeVisible();
  await page.getByRole('link', { name: /Toyota Vios/ }).click();
  await expect(page).toHaveURL(/\/account\/orders\/order-a$/);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Toyota Vios');
  expect(pageErrors).toEqual([]);
});
test('admin header groups working routes and restores keyboard focus', async ({ page }, testInfo) => {
  await mockApi(page, 'Admin');
  await page.goto('/admin/orders');
  if (page.viewportSize()!.width < 901) await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
  const header = page.locator('.app-header');
  await expect(header.getByRole('link', { name: 'Đơn hàng', exact: true })).toBeVisible();
  await expect(header.getByRole('link', { name: 'Dữ liệu', exact: true })).toHaveCount(0);
  await expect(header.getByRole('link', { name: 'Cấu hình RAG', exact: true })).toHaveCount(0);
  const trigger = header.getByRole('button', { name: 'Yêu cầu', exact: true });
  await trigger.click();
  await expect(header.getByRole('link', { name: 'Yêu cầu mua xe', exact: true })).toBeVisible();
  await page.keyboard.press('Tab'); await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click(); await header.getByRole('link', { name: 'Đề nghị thay đổi' }).click();
  await expect(page).toHaveURL(/\/admin\/change-requests$/);
  if (page.viewportSize()!.width < 901) await page.getByRole('button', { name: 'Mở menu', exact: true }).click();
  await expect(trigger).toHaveClass(/active/);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await header.getByRole('button', { name: 'Chăm sóc' }).click();
  await expect(header.getByRole('link', { name: 'Lịch hẹn' })).toBeVisible();
  await fits(page);
  await page.screenshot({ path: testInfo.outputPath('admin-header.png') });
});
test('customer header provides account shortcuts and closes on outside click', async ({ page }, testInfo) => {
  await mockApi(page, 'Customer'); await page.goto('/cars');
  const header = page.locator('.app-header');
  await expect(header.getByRole('link', { name: 'Tài khoản', exact: true })).toHaveCount(0);
  const trigger = header.getByRole('button', { name: 'Tài khoản', exact: true });
  await trigger.click();
  await expect(header.getByRole('link', { name: 'Đơn hàng của tôi' })).toBeVisible();
  await page.mouse.click(5, 700);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click(); await fits(page);
  await page.screenshot({ path: testInfo.outputPath('customer-header.png') });
  await header.getByRole('link', { name: 'Thông tin cá nhân' }).click();
  await expect(page).toHaveURL(/\/account\/profile$/);
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await trigger.click();
  // Visible alone does not catch a dropdown covered by another stacking context.
  await expect.poll(() => page.locator('.header-user-summary').evaluate(element => {
    const rect = element.getBoundingClientRect();
    return element.contains(document.elementFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2));
  })).toBe(true);
  await page.screenshot({ path: testInfo.outputPath('customer-account-header.png') });
  await header.getByRole('link', { name: 'Tổng quan tài khoản' }).click();
  await expect(page).toHaveURL(/\/account$/);
  const accountNav = page.getByRole('navigation', { name: 'Tài khoản khách hàng' });
  await accountNav.getByRole('button', { name: 'Mua xe & đơn hàng' }).click();
  await accountNav.getByRole('link', { name: 'Đơn hàng', exact: true }).click();
  await expect(page).toHaveURL(/\/account\/orders$/);
});
test('login visibility, failed submission, retry and keyboard focus', async ({ page }, testInfo) => {
  await mockApi(page);
  let attempts = 0;
  await page.route('**/api/orders-service/auth/login', route => {
    attempts++;
    return route.fulfill({ status: 401, json: { detail: 'Invalid credentials' } });
  });
  await page.goto('/login');
  await expect(page.getByRole('heading', { name: 'Chào mừng trở lại' })).toBeVisible();
  await page.getByLabel('Email', { exact: true }).fill('test@example.com');
  await page.getByLabel('Mật khẩu', { exact: true }).fill('test-password');
  await page.getByRole('button', { name: 'Hiện mật khẩu' }).click();
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveAttribute('type', 'text');
  await page.getByRole('button', { name: 'Ẩn mật khẩu' }).click();
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect(page.getByRole('alert')).toBeFocused();
  await expect(page.getByLabel('Mật khẩu', { exact: true })).toHaveValue('test-password');
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
  await expect.poll(() => attempts).toBe(2);
  await page.getByLabel('Mật khẩu', { exact: true }).fill('');
  await fits(page);
  await page.screenshot({ path: testInfo.outputPath('login.png'), fullPage: true });
});
const cars = Array.from({ length: 25 }, (_, i) => car(String(i + 1), { displayName: `Toyota Mẫu ${String(i + 1).padStart(2, '0')}`, priceVndFrom: i === 24 ? null : 500000000 + i * 10000000, fuelType: 'Petrol', transmission: 'Automatic', marketStatusVn: 'official_current' }))
async function mockApi(page: Page, role: 'Guest' | 'Customer' | 'Admin' = 'Guest', authError = false) {
  let expired = false
  let chat = { id: 'persisted-session', version: 0, selectedOrderId: null, messages: [] as object[] }
  await page.route('**/api/**', async route => {
    const url = new URL(route.request().url())
    const path = url.pathname
    if (!path.startsWith('/api/')) return route.continue()
    const reply = (data: unknown, status = 200) => route.fulfill({ json: data, status })
    if (path.endsWith('/me')) return authError ? reply({ detail: 'Offline' }, 503) : role === 'Guest' || expired ? reply({}, 401) : reply({ id: 'customer-a', role, displayName: 'Khách thử nghiệm' })
    if (path.endsWith('/auth/csrf')) return reply({ token: 'test-token' })
    if (path.endsWith('/auth/login')) { role = 'Customer'; expired = false; return reply({ id: 'customer-a', role, displayName: 'Khách thử nghiệm' }) }
    if (path.endsWith('/auth/logout')) { expired = true; return route.fulfill({ status: 204 }) }
    if (path.endsWith('/my/profile')) return reply({ id: 'customer-a', displayName: 'Khách thử nghiệm', email: 'test@example.com', createdAt: '2026-10-01T00:00:00Z', version: 0 })
    if (path.endsWith('/assistant/sessions')) return reply(route.request().method() === 'POST' ? chat : [])
    if (path.endsWith('/catalogue-messages')) {
      chat = { ...chat, version: chat.version + 1, messages: [...chat.messages, { role: 'user', content: route.request().postDataJSON().content, catalog: true }, { role: 'assistant', content: 'Mẫu xe phù hợp với nhu cầu.', catalog: true, contexts: [{ carId: '1', displayName: cars[0].displayName, presenceSourceId: 'source-presence' }] }] }
      return reply(chat)
    }
    if (path.includes('/assistant/sessions/')) return reply(chat)
    if (path.endsWith('/orders')) return reply({ items: [], pageNumber: 1, pageSize: 20, totalCount: 0 })
    if (path === '/api/cars') return reply({ count: cars.length, items: cars })
    if (path === '/api/cars/compare') return reply({ items: cars.filter(c => url.searchParams.get('ids')?.split(',').includes(c.carId)), missingIds: [] })
    if (path.startsWith('/api/cars/')) return reply(cars.find(c => c.carId === path.split('/').at(-1)) || {}, cars.some(c => c.carId === path.split('/').at(-1)) ? 200 : 404)
    if (path === '/api/warranties') return reply({ items: [{ durationMonths: 36, distanceLimitKm: 100000, conditions: 'Xác nhận theo VIN.', sourceId: 'warranty-source' }] })
    if (path === '/api/dealers') return reply({ items: [{ dealerId: 1, name: 'Đại lý Toyota', supportedBrands: ['Toyota'], address: 'Hà Nội', city: 'Hà Nội', checkedAt: '2026-10-01' }] })
    if (path === '/api/chat/understand') { const body = route.request().postDataJSON(); return reply({ question: body.question, route: /đơn|thanh toán|AW-/i.test(body.question) ? 'orders' : 'catalogue', needsClarification: false, clarification: null }) }
    if (path === '/api/chat/compose') return reply({ answer: 'Bạn cần đăng nhập để tra cứu và xử lý đơn hàng của mình.', generationMode: 'bedrock-natural' })
    if (path === '/api/chat') return reply({ answer: 'Mẫu xe phù hợp với nhu cầu.', contexts: [{ carId: '1', displayName: cars[0].displayName, presenceSourceId: 'source-presence' }] })
    return reply({ items: [], count: 0 })
  })
}
async function fits(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true)
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }))
}
test('catalogue, mobile menu, filters, comparison and detail', async ({ page }, info) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  await mockApi(page)
  await page.goto('/cars')
  await expect(page.locator('.car-card')).toHaveCount(12)
  if (page.viewportSize()!.width < 900) {
    const menu = page.getByRole('button', { name: 'Mở menu' }); await menu.click()
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeVisible()
    await page.keyboard.press('Tab'); await page.keyboard.press('Escape')
    await expect(menu).toBeFocused()
    await expect(page.getByRole('navigation', { name: 'Điều hướng chính' })).toBeHidden()
    await page.getByRole('button', { name: 'Mở bộ lọc' }).click()
    const dialog = page.getByRole('dialog', { name: 'Bộ lọc xe' })
    const brand = dialog.getByRole('checkbox', { name: 'Toyota', exact: true })
    await brand.click(); await expect(brand).toBeChecked()
    await page.keyboard.press('Escape'); await expect(dialog).toBeHidden()
    await expect(page).toHaveURL(/brand=Toyota/)
  } else {
    const brand = page.locator('.catalog-desktop-filters').getByRole('checkbox', { name: 'Toyota', exact: true })
    await brand.click(); await expect(brand).toBeChecked()
  }
  await page.getByRole('button', { name: 'Trang sau' }).click(); await expect(page).toHaveURL(/page=2/)
  await page.reload(); await expect(page.getByText('Trang 2/3')).toBeVisible()
  await page.goBack(); await expect(page.getByText('Trang 1/3')).toBeVisible()
  for (let i = 0; i < 4; i++) await page.locator('.car-card').nth(i).getByRole('button', { name: '+ So sánh' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Chỉ có thể' })).toBeVisible()
  await fits(page)
  await page.screenshot({ path: info.outputPath('catalogue.png'), fullPage: true })
  await page.getByRole('link', { name: 'So sánh (3)' }).click()
  await expect(page.getByRole('table').first()).toBeVisible(); await fits(page)
  await page.screenshot({ path: info.outputPath('compare.png'), fullPage: true })
  await page.goto('/cars/1')
  await expect(page.getByRole('heading', { name: cars[0].displayName, exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: 'Nguồn chính sách bảo hành →' })).toHaveAttribute('href', '/sources/warranty-source')
  await fits(page); await page.screenshot({ path: info.outputPath('detail.png'), fullPage: true })
  await page.getByRole('link', { name: 'Hỏi về xe này' }).click()
  await expect(page.getByRole('textbox', { name: 'Câu hỏi' })).toHaveValue(`Hãy tư vấn cho tôi về xe ${cars[0].displayName}`)
  expect(errors).toEqual([])
})
test('guest chat retries, keyboard and refresh', async ({ page }, info) => {
  await mockApi(page); let tries = 0
  await page.route('**/api/chat', route => { tries++; return tries === 1 ? route.fulfill({ status: 503, json: {} }) : route.fulfill({ json: { answer: 'Câu trả lời đã phục hồi', contexts: [] } }) })
  await page.goto('/chat')
  await expect(page.getByRole('heading', { name: 'Trợ lý AI của bạn.' })).toBeVisible()
  await page.getByRole('button', { name: /Tìm chiếc xe phù hợp/ }).click()
  await expect(page.getByRole('textbox', { name: 'Câu hỏi' })).toHaveValue('Tư vấn SUV 5 chỗ dưới 1 tỷ')
  if (page.viewportSize()!.width < 900) {
    const history = page.getByRole('button', { name: /Lịch sử/ })
    await history.click()
    await expect(page.getByRole('dialog', { name: 'Lịch sử hội thoại' })).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(history).toBeFocused()
    await expect(page.getByRole('dialog', { name: 'Lịch sử hội thoại' })).toBeHidden()
  }
  expect(await page.locator('.assistant-composer').evaluate(element => element.getBoundingClientRect().bottom <= innerHeight)).toBe(true)
  const input = page.getByRole('textbox', { name: 'Câu hỏi' }); await input.fill('Tư vấn SUV')
  await input.press('Shift+Enter'); expect(tries).toBe(0)
  await input.press('Enter'); await expect(page.getByRole('button', { name: 'Gửi lại câu hỏi' })).toBeVisible()
  await page.getByRole('button', { name: 'Gửi lại câu hỏi' }).click()
  await expect(page.getByText('Câu trả lời đã phục hồi')).toBeVisible()
  await page.reload(); await expect(page.getByText('Câu trả lời đã phục hồi')).toBeVisible()
  await fits(page); await page.screenshot({ path: info.outputPath('guest-chat.png'), fullPage: true })
})
test('catalogue quick filters, translated labels and list view preserve comparison', async ({ page }, info) => {
  test.skip(page.viewportSize()!.width < 900, 'Desktop improvement scope')
  await mockApi(page)
  await page.goto('/cars')
  await expect(page.getByRole('textbox', { name: 'Tìm xe' })).toBeVisible()
  await page.locator('.catalog-quick-filters').getByRole('button', { name: '7 chỗ', exact: true }).click()
  await expect(page.getByText('Không tìm thấy xe', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Xóa bộ lọc seats: 7', exact: true }).click()
  await expect(page.locator('.car-card')).toHaveCount(12)
  const filters = page.locator('.catalog-desktop-filters')
  await filters.locator('summary').filter({ hasText: 'Nhiên liệu' }).click()
  const fuel = filters.getByRole('checkbox', { name: 'Xăng', exact: true })
  await fuel.click()
  await expect(fuel).toBeChecked()
  await expect(page).toHaveURL(/fuelType=Petrol/)
  await expect(page.locator('.filter-chips')).toContainText('Xăng')
  await page.locator('.car-card').first().getByRole('button', { name: '+ So sánh', exact: true }).click()
  await page.getByRole('button', { name: 'Hiển thị danh sách', exact: true }).click()
  await expect(page.locator('.car-list')).toBeVisible()
  await expect(page.locator('.car-card').first().getByRole('button', { name: 'Đã chọn', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await fits(page)
  await page.screenshot({ path: info.outputPath('catalogue-list.png'), fullPage: true })
  await filters.getByRole('spinbutton', { name: 'Giá tối thiểu (VND)' }).fill('-1')
  await filters.getByRole('button', { name: 'Áp dụng khoảng giá' }).click()
  await expect(filters.getByRole('status')).toContainText('không âm')
  await expect(page).not.toHaveURL(/minPrice=/)
  await filters.getByRole('spinbutton', { name: 'Giá tối thiểu (VND)' }).fill('500000000')
  await filters.getByRole('button', { name: 'Áp dụng khoảng giá' }).click()
  await expect(page.locator('.filter-chips')).toContainText('500.000.000')
  await expect(page.getByRole('complementary', { name: 'Xe đã chọn so sánh' })).toContainText('1/3 xe đã chọn')
})
test('comparison picker, differences, missing price and saved selection', async ({ page }, info) => {
  test.skip(page.viewportSize()!.width < 900, 'Desktop improvement scope')
  await mockApi(page)
  await page.goto('/compare?ids=1,2')
  await expect(page.getByRole('table').first()).toBeVisible()
  const replace = page.getByRole('button', { name: 'Thay Toyota Mẫu 01', exact: true })
  await replace.click()
  const dialog = page.getByRole('dialog', { name: 'Bộ chọn xe' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('textbox', { name: 'Tìm xe theo tên hoặc hãng' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(dialog).toBeHidden()
  await expect(replace).toBeFocused()
  await replace.click()
  await dialog.getByRole('textbox', { name: 'Tìm xe theo tên hoặc hãng' }).fill('mau 25')
  await expect(dialog.getByRole('button', { name: 'Chọn Toyota Mẫu 25', exact: true })).toBeVisible()
  await dialog.screenshot({ path: info.outputPath('compare-picker.png') })
  await dialog.getByRole('button', { name: 'Chọn Toyota Mẫu 25', exact: true }).click()
  await expect(dialog).toBeHidden()
  await expect(page).toHaveURL(/ids=25%2C2/)
  await expect(page.getByRole('table').getByRole('columnheader').nth(1)).toContainText('Toyota Mẫu 25')
  await expect(page.getByRole('table').getByRole('cell', { name: 'Chưa có dữ liệu', exact: true }).first()).toBeVisible()
  const differences = page.getByRole('checkbox', { name: 'Chỉ xem thông tin khác nhau' })
  await differences.click()
  await expect(differences).toBeChecked()
  await expect(page.getByRole('rowheader', { name: 'Nhiên liệu', exact: true })).toHaveCount(0)
  await expect(page.getByRole('rowheader', { name: 'Nguồn giá', exact: true })).toBeVisible()
  await fits(page)
  await page.screenshot({ path: info.outputPath('compare-differences.png'), fullPage: true })
  await page.goto('/compare')
  await expect(page).toHaveURL(/ids=25%2C2/)
  await page.getByRole('button', { name: 'Xóa tất cả xe', exact: true }).click()
  await expect(page.getByRole('table')).toHaveCount(0)
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('compareCars') || '[]'))).toEqual([])
})
test('customer chat cache is cleared after logout', async ({ page }, info) => {
  await mockApi(page, 'Customer'); await page.goto('/chat')
  const input = page.getByRole('textbox', { name: 'Câu hỏi' }); await input.fill('Tư vấn SUV'); await input.press('Enter')
  await expect(page.getByText('Mẫu xe phù hợp với nhu cầu.')).toBeVisible()
  await page.reload(); await expect(page.getByText('Mẫu xe phù hợp với nhu cầu.')).toBeVisible()
  await fits(page); await page.screenshot({ path: info.outputPath('customer-chat.png'), fullPage: true })
  await page.goto('/account/profile'); await page.getByRole('button', { name: 'Đăng xuất', exact: true }).click()
  await expect(page).toHaveURL(/\/login/)
  await page.goto('/chat'); await expect(page.getByRole('heading', { name: 'Trợ lý AI của bạn.' })).toBeVisible()
  await expect(page.getByText('Mẫu xe phù hợp với nhu cầu.')).toHaveCount(0)
})
test('desktop chat formats answers and preserves drafting during a request', async ({ page }, info) => {
  test.skip(page.viewportSize()!.width < 900, 'Desktop improvement scope')
  await mockApi(page, 'Customer')
  let release!: () => void
  const waiting = new Promise<void>(resolve => { release = resolve })
  await page.route('**/catalogue-messages', async route => {
    await waiting
    await route.fulfill({ json: { id: 'persisted-session', version: 1, selectedOrderId: null, messages: [{ role: 'assistant', catalog: true, content: '## Xe phù hợp\n- **Toyota**: dễ sử dụng\n- Mazda: nhiều trang bị\n\n| Xe | Giá tham khảo |\n| --- | --- |\n| Toyota | 800 triệu |', contexts: [{ carId: '1', displayName: 'Toyota', presenceSourceId: 's1' }] }] } })
  })
  await page.goto('/chat')
  await expect(page.getByRole('combobox', { name: 'Chủ đề câu hỏi' })).toHaveCount(0)
  await expect(page.getByRole('combobox', { name: 'Đơn cần tra cứu' })).toHaveCount(0)
  await page.getByRole('button', { name: /Tìm chiếc xe phù hợp/ }).click()
  await page.getByRole('button', { name: 'Gửi câu hỏi', exact: true }).click()
  await expect(page.getByRole('status').filter({ hasText: 'Đang tìm câu trả lời' })).toBeVisible()
  const input = page.getByRole('textbox', { name: 'Câu hỏi' })
  await expect(input).toBeEnabled()
  await input.fill('Còn xe 7 chỗ thì sao?\nTôi cần xe cho gia đình.\nƯu tiên rộng rãi.\nNgân sách 1 tỷ.')
  await expect(page.getByRole('button', { name: 'Gửi câu hỏi', exact: true })).toBeDisabled()
  release()
  await expect(page.getByRole('heading', { name: 'Xe phù hợp', exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '800 triệu' })).toBeVisible()
  await expect(input).toHaveValue(/Còn xe 7 chỗ/)
  expect(await input.evaluate(element => element.getBoundingClientRect().height)).toBeGreaterThan(44)
  await expect(page.getByRole('link', { name: 'Xem nguồn tham khảo' })).toHaveAttribute('href', '/sources/s1')
  await fits(page)
  await page.screenshot({ path: info.outputPath('chat-enhancements.png'), fullPage: true })
})
test('car answers display grouped facts and caveats without mobile overflow', async ({ page }, info) => {
  await mockApi(page)
  await page.route('**/api/chat', route => route.fulfill({ json: {
    answer: 'Honda CR-V — Hộp số: Tự động.\n\nHonda CR-V có 5 chỗ.\n\nHonda CR-V có giá tham khảo từ 998.000.000 VND.\n\nToyota RAV4 — Hộp số: Tự động.\n\nToyota RAV4 có 5 chỗ.\n\nĐây là giá tham khảo từ dữ liệu, không phải báo giá đại lý theo thời gian thực.', contexts: [],
  } }))
  await page.goto('/chat')
  await page.getByRole('textbox', { name: 'Câu hỏi' }).fill('So sánh Honda CR-V với Toyota RAV4')
  await page.getByRole('button', { name: 'Gửi →' }).click()
  await expect(page.getByRole('columnheader', { name: 'Honda CR-V', exact: true }).first()).toBeVisible()
  await expect(page.locator('.assistant-answer-facts')).toHaveCount(0)
  await expect(page.locator('.assistant-comparison')).toHaveCount(1)
  const headers = page.locator('.assistant-comparison thead th')
  const left = await headers.nth(1).boundingBox()
  const right = await headers.nth(2).boundingBox()
  expect(left!.y).toBe(right!.y)
  expect(right!.x).toBeGreaterThanOrEqual(left!.x + left!.width - 1)
  await expect(page.locator('.assistant-comparison tbody tr').filter({ hasText: 'Hộp số' }).locator('td')).toHaveText(['Tự động', 'Tự động'])
  await expect(page.getByLabel('Lưu ý')).toContainText('không phải báo giá')
  await expect(page.getByRole('table').first()).toBeVisible()
  await fits(page)
  await page.screenshot({ path: info.outputPath('answer-formatted.png'), fullPage: true })
})
test('Bedrock prose and horizontal comparisons render without duplicate templates', async ({ page }, info) => {
  await mockApi(page)
  await page.route('**/api/chat', route => route.fulfill({ json: {
    answer: '**Ford Edge** là mẫu SUV 5 chỗ.\n\n### So sánh xe\n| Tiêu chí | Ford Edge | Honda CR-V |\n| --- | --- | --- |\n| Số chỗ | 5 | 7 |\n\n• **Hộp số:** Tự động\n• **Nhiên liệu:** Diesel\n\n*Giá chỉ mang tính tham khảo.*',
    generationMode: 'bedrock-natural', contexts: [{ carId: 'car_29_5', displayName: 'Ford Edge', description: 'Original English description' }],
  } }))
  await page.goto('/chat')
  await page.getByRole('textbox', { name: 'Câu hỏi' }).fill('So sánh Ford Edge với Honda CR-V')
  await page.getByRole('button', { name: 'Gửi →' }).click()
  await expect(page.getByRole('columnheader', { name: 'Honda CR-V' })).toBeVisible()
  await expect(page.locator('.assistant-car-result')).toHaveCount(0)
  await expect(page.getByText('Original English description')).toHaveCount(0)
  await expect(page.locator('.assistant-answer-natural li')).toHaveCount(2)
  await fits(page)
  await page.screenshot({ path: info.outputPath('bedrock-natural.png'), fullPage: true })
})

test('single car answer uses narrative sections without repeated price', async ({ page }, info) => {
  await mockApi(page)
  await page.route('**/api/chat', route => route.fulfill({ json: {
    answer: 'Xe gần giống nhất trong ảnh: **Ford Edge** (độ tương đồng 95.3%).\n\nFord Edge có giá tham khảo từ 1.560.000.000 VND.\n\nGiá tham khảo của Ford Edge.\nGiá từ: 1560000000 VND.\nNgày giá tham khảo: 2022-01-01.\nĐây là giá tham khảo từ dữ liệu, không phải báo giá đại lý theo thời gian thực.\nFord Edge: Có mặt qua nhập khẩu; không khẳng định phân phối chính hãng.',
    contexts: [{ carId: 'car_29_5', displayName: 'Ford Edge' }],
  } }))
  await page.goto('/chat')
  await page.getByRole('textbox', { name: 'Câu hỏi' }).fill('Xe trong ảnh giá bao nhiêu?')
  await page.getByRole('button', { name: 'Gửi →' }).click()
  await expect(page.getByText('Ford Edge', { exact: true })).toBeVisible()
  await expect(page.getByText('1.560.000.000 ₫', { exact: true })).toHaveCount(1)
  await expect(page.getByText('01/01/2022')).toBeVisible()
  await expect(page.locator('.assistant-car-result')).toHaveCount(1)
  await fits(page)
  await page.screenshot({ path: info.outputPath('single-car-template.png'), fullPage: true })
})
test('public remains usable during account outage and private route offers retry', async ({ page }) => {
  await mockApi(page, 'Guest', true); await page.goto('/cars')
  await expect(page.locator('.car-card')).toHaveCount(12)
  await page.goto('/account/profile'); await expect(page.getByText('Không kết nối được dịch vụ đơn hàng.')).toBeVisible()
  await expect(page.getByRole('button', { name: /Thử lại/ })).toBeVisible()
})
test('dealers filters, search, URL navigation and contact links', async ({ page }, info) => {
  test.skip(page.viewportSize()!.width < 900, 'Desktop improvement scope')
  await mockApi(page)
  const dealers = [
    { dealerId: 1, name: 'Toyota Láng Hạ', address: 'Láng Hạ, Hà Nội', city: 'Hanoi', supportedBrands: ['Toyota'], checkedAt: '2026-10-01', phone: '+84 24 1234 5678', website: 'https://example.com', sourceId: 'toyota-source' },
    { dealerId: 2, name: 'Toyota Sài Gòn', address: 'Quận 1', city: 'Ho Chi Minh City', supportedBrands: ['Toyota'], checkedAt: '2026-10-01' },
    { dealerId: 3, name: 'Honda Đà Nẵng', address: 'Đường 2 tháng 9', city: 'Da Nang', supportedBrands: ['Honda'], checkedAt: '2026-10-01' },
  ]
  await page.route('**/api/dealers', route => route.fulfill({ json: { items: dealers, count: dealers.length } }))
  await page.goto('/dealers?brand=Toyota')
  await expect(page.locator('.dealer-card')).toHaveCount(2)
  await page.getByRole('combobox', { name: 'Thành phố', exact: true }).selectOption('Hanoi')
  await expect(page.locator('.dealer-card')).toHaveCount(1)
  const input = page.getByRole('textbox', { name: 'Tìm đại lý' })
  await input.fill('lang ha'); await input.press('Enter')
  await expect(page).toHaveURL(/query=lang\+ha/)
  await expect(page.getByRole('heading', { name: 'Toyota Láng Hạ', exact: true })).toBeVisible()
  await expect(page.getByRole('link', { name: /Gọi Toyota Láng Hạ/ })).toHaveAttribute('href', 'tel:+842412345678')
  await expect(page.getByRole('link', { name: 'Xem nguồn ↗' })).toHaveAttribute('href', '/sources/toyota-source')
  await expect(page.getByRole('link', { name: /Xem bản đồ/ })).toHaveAttribute('href', /google\.com\/maps\/search/)
  await page.goBack(); await expect(input).toHaveValue('')
  await page.goBack(); await expect(page.locator('.dealer-card')).toHaveCount(2)
  await page.locator('.dealers-quick-cities').getByRole('button', { name: 'Đà Nẵng', exact: true }).click()
  await expect(page.getByText('Không tìm thấy đại lý', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Xóa bộ lọc city: Da Nang', exact: true }).click()
  await expect(page.locator('.dealer-card')).toHaveCount(2)
  await fits(page)
  await page.screenshot({ path: info.outputPath('dealers.png'), fullPage: true })
})
test('admin route remains guarded and visible', async ({ page }, info) => {
  await mockApi(page, 'Admin'); await page.goto('/cars'); await expect(page).toHaveURL(/\/admin\/orders/)
  await expect(page.getByRole('navigation', { name: 'Điều hướng quản trị' })).toBeVisible()
  await page.screenshot({ path: info.outputPath('admin.png'), fullPage: true })
  await expect(page.locator('.admin-header')).toBeVisible()
  expect(await page.locator('.admin-header').evaluate(header => header.getBoundingClientRect().bottom <= document.querySelector('main')!.getBoundingClientRect().top)).toBe(true)
})
test('login from guest order question returns to chat with the pending question', async ({ page }) => {
  await mockApi(page); await page.goto('/chat')
  await page.getByRole('textbox', { name: 'Câu hỏi' }).fill('Đơn hàng của tôi')
  await page.getByRole('button', { name: 'Gửi →' }).click()
  await expect(page.getByText('Bạn cần đăng nhập để tra cứu và xử lý đơn hàng của mình.')).toBeVisible()
  await page.getByRole('link', { name: 'Đăng nhập để tra cứu đơn hàng →' }).click()
  await page.getByLabel('Email', { exact: true }).fill('test@example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.getByRole('textbox', { name: 'Câu hỏi' })).toHaveValue('Đơn hàng của tôi')
})
