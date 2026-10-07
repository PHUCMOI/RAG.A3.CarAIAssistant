import { test, expect, type Page } from '@playwright/test'
const image = { name: 'my-car.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=', 'base64') }
async function guest(page: Page) {
  await page.route('**/api/**', route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    return path.endsWith('/me') ? route.fulfill({ status: 401, json: {} }) : route.fulfill({ json: { items: [] } })
  })
}
async function fits(page: Page) { expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true) }

test('image search has accessible selection, clears stale results and opens named car context', async ({ page }, testInfo) => {
  await guest(page)
  let calls = 0
  await page.route('**/api/image-service/search/image', route => {
    calls++
    expect(route.request().postDataBuffer()?.toString()).toContain('name="top_k"\r\n\r\n5')
    return route.fulfill({ json: { results: [{ car_id: '1', brand: 'Toyota', model: 'Vios', similarity: .87, best_image: '' }], confidence: 'medium', uncertain: true, margin: .02 } })
  })
  await page.goto('/search-image')
  await expect(page.getByRole('button', { name: 'Chọn ảnh xe', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: 'Tìm xe tương đồng →' })).toBeDisabled()
  await fits(page); await page.screenshot({ path: testInfo.outputPath('image-empty.png'), fullPage: true })
  await page.locator('input[type=file]').setInputFiles(image)
  await expect(page.getByAltText('Ảnh xe cần tìm')).toBeVisible()
  await page.getByRole('button', { name: 'Tìm xe tương đồng →' }).click()
  await expect(page.getByRole('heading', { name: '1 mẫu xe tương đồng' })).toBeFocused()
  await expect(page.getByRole('status')).toContainText('Chưa đủ rõ')
  await fits(page); await page.screenshot({ path: testInfo.outputPath('image-results.png'), fullPage: true })
  const chat = page.getByRole('link', { name: 'Hỏi AI', exact: true })
  await expect(chat).toHaveAttribute('href', '/chat?car=1&carName=Toyota+Vios')
  await chat.click()
  await expect(page.getByRole('textbox', { name: 'Câu hỏi' })).toHaveValue('Hãy tư vấn cho tôi về xe Toyota Vios')
  await fits(page); await page.screenshot({ path: testInfo.outputPath('chat-image-entry.png') })
  expect(calls).toBe(1)
  await page.goBack()
  await page.locator('input[type=file]').setInputFiles(image)
  await page.getByRole('button', { name: 'Tìm xe tương đồng →' }).click()
  await expect(page.locator('.match-card')).toHaveCount(1)
  await page.getByRole('combobox', { name: 'Số kết quả hiển thị' }).selectOption('3')
  await expect(page.locator('.match-card')).toHaveCount(0)
  await page.getByRole('button', { name: 'Xóa ảnh đã chọn' }).click()
  await expect(page.getByRole('button', { name: 'Chọn ảnh xe', exact: true })).toBeVisible()
})

test('image search retains input on failure and retry shows a useful empty state', async ({ page }) => {
  await guest(page)
  let calls = 0
  await page.route('**/api/image-service/search/image', async route => {
    calls++
    if (calls === 1) return route.fulfill({ status: 503, json: {} })
    return route.fulfill({ json: { results: [], confidence: 'low', uncertain: false, margin: 0 } })
  })
  await page.goto('/search-image')
  await page.locator('input[type=file]').setInputFiles(image)
  await page.getByRole('button', { name: 'Tìm xe tương đồng →' }).click()
  await expect(page.getByRole('alert')).toContainText('Ảnh của bạn vẫn được giữ')
  await expect(page.getByAltText('Ảnh xe cần tìm')).toBeVisible()
  await page.getByRole('button', { name: 'Thử lại tìm kiếm' }).click()
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy mẫu xe phù hợp' })).toBeVisible()
  expect(calls).toBe(2)
})

test('image search rejects unsupported files and blocks replacing or resubmitting a pending search', async ({ page }) => {
  await guest(page)
  let finish!: () => void
  const gate = new Promise<void>(resolve => { finish = resolve })
  let calls = 0
  await page.route('**/api/image-service/search/image', async route => {
    calls++; await gate
    return route.fulfill({ json: { results: [], confidence: 'low', uncertain: false, margin: 0 } })
  })
  await page.goto('/search-image')
  await page.locator('input[type=file]').setInputFiles({ name: 'wrong.gif', mimeType: 'image/gif', buffer: Buffer.from('test') })
  await expect(page.getByRole('alert')).toContainText('JPG, PNG hoặc WebP')
  await page.locator('input[type=file]').setInputFiles(image)
  await page.getByRole('button', { name: 'Tìm xe tương đồng →' }).click()
  await expect(page.getByRole('button', { name: 'Đổi ảnh', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Xóa ảnh đã chọn' })).toBeDisabled()
  await expect(page.getByRole('combobox')).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Đang tìm mẫu xe…' })).toBeDisabled()
  await expect(page.getByRole('status')).toContainText('Đang tìm xe tương đồng')
  finish()
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy mẫu xe phù hợp' })).toBeVisible()
  expect(calls).toBe(1)
})

test('chat keeps image controls compact and validates attachments visibly', async ({ page }, testInfo) => {
  await guest(page)
  await page.goto('/chat')
  await expect(page.locator('.assistant-image-link')).toHaveAttribute('href', '/search-image')
  await page.locator('input[type=file]').setInputFiles({ name: 'wrong.gif', mimeType: 'image/gif', buffer: Buffer.from('test') })
  await expect(page.getByRole('alert')).toContainText('JPEG, PNG hoặc WebP')
  await page.locator('input[type=file]').setInputFiles(image)
  await expect(page.getByRole('alert')).toHaveCount(0)
  await expect(page.locator('.chat-attachment-name')).toHaveText('my-car.png')
  await page.getByRole('textbox', { name: 'Câu hỏi' }).fill('Xe này phù hợp đi gia đình không?')
  await fits(page); await page.screenshot({ path: testInfo.outputPath('chat-attachment.png') })
  await page.getByRole('button', { name: 'Bỏ ảnh đính kèm' }).click()
  await expect(page.getByRole('textbox', { name: 'Câu hỏi' })).toHaveValue('Xe này phù hợp đi gia đình không?')
  await expect(page.locator('.chat-attachment-bar')).toHaveCount(0)
})

test('failed sample loading retries the sample rather than a previously selected image', async ({ page }) => {
  await guest(page)
  let sampleCalls = 0
  let searches = 0
  await page.route('**/api/image-service/images/**', route => {
    sampleCalls++
    if (sampleCalls === 1) return route.fulfill({ status: 503 })
    return route.fulfill({ contentType: 'image/png', body: image.buffer })
  })
  await page.route('**/api/image-service/search/image', route => {
    searches++
    expect(route.request().postDataBuffer()?.toString()).toContain('Honda CR-V.jpg')
    return route.fulfill({ json: { results: [], confidence: 'low', uncertain: false, margin: 0 } })
  })
  await page.goto('/search-image')
  await page.locator('input[type=file]').setInputFiles(image)
  await page.getByRole('button', { name: 'Honda CR-V', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('ảnh mẫu')
  await page.getByRole('button', { name: 'Thử lại tìm kiếm' }).click()
  await expect(page.getByRole('heading', { name: 'Chưa tìm thấy mẫu xe phù hợp' })).toBeVisible()
  expect(sampleCalls).toBe(2)
  expect(searches).toBe(1)
})
