import { test, expect } from '@playwright/test'

test('guest photo survives login and reload before the mixed order turn', async ({ page }) => {
  test.setTimeout(60_000)
  const question = 'Xe trong ảnh có phải xe đơn AW-OWNED không?'
  let signedIn = false
  let turns = 0
  const bytes = Buffer.alloc(6_000_000)
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=', 'base64').copy(bytes)
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    if (path.endsWith('/me')) return route.fulfill({ status: signedIn ? 200 : 401, json: signedIn ? { id: 'owner', role: 'Customer', displayName: 'Owner' } : {} })
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { token: 'csrf' } })
    if (path.endsWith('/auth/login')) { signedIn = true; return route.fulfill({ json: { id: 'owner', role: 'Customer' } }) }
    if (path === '/api/chat/turns') return route.fulfill({ json: { answer: 'Đăng nhập để đối chiếu ảnh với đơn.', requiresLogin: true, grounded: false, status: 'needs_clarification' } })
    if (path.endsWith('/my/orders')) return route.fulfill({ json: { items: [] } })
    if (path.endsWith('/assistant/sessions')) return route.fulfill({ json: route.request().method() === 'POST' ? { id: 'session', version: 1, messages: [] } : [] })
    if (path.endsWith('/turns')) {
      const body = route.request().postDataJSON()
      expect(body.content).toBe(question)
      expect(body.imageBase64).toBe(bytes.toString('base64'))
      expect(body.mimeType).toBe('image/png')
      turns++
      return route.fulfill({ json: { id: 'session', version: 2, messages: [{ role: 'assistant', content: 'Đã đối chiếu ảnh của bạn.' }] } })
    }
    return route.fulfill({ json: { id: 'session', version: 2, messages: [] } })
  })
  await page.goto('/chat')
  await page.locator('input[type=file]').setInputFiles({ name: 'large-car.png', mimeType: 'image/png', buffer: bytes })
  await page.getByRole('textbox', { name: 'Câu hỏi' }).fill(question)
  await page.getByRole('button', { name: 'Gửi →' }).click()
  await expect(page.getByText('Đăng nhập để đối chiếu ảnh với đơn.', { exact: true })).toBeVisible()
  await page.getByRole('link', { name: 'Đăng nhập để tra cứu đơn hàng →' }).click()
  await page.getByLabel('Email', { exact: true }).fill('owner@example.com')
  await page.getByLabel('Mật khẩu', { exact: true }).fill('test-password')
  await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click()
  await expect(page).toHaveURL(/\/chat$/)
  await expect(page.getByText('large-car.png', { exact: true })).toBeVisible()
  await page.reload()
  await expect(page.getByText('large-car.png', { exact: true })).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Câu hỏi' })).toHaveValue(question)
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click()
  await expect(page.getByText('Đã đối chiếu ảnh của bạn.', { exact: true })).toBeVisible()
  expect(turns).toBe(1)
  await page.reload()
  await expect(page.getByText('large-car.png', { exact: true })).toHaveCount(0)
})

test('customer sends raw image and order question to one endpoint and restores source metadata', async ({ page }) => {
  const question = 'Xe trong ảnh có phải xe đơn AW-OWNED khong?'
  let calls = 0
  let saved: object = { id: 'session', version: 0, selectedOrderId: null, messages: [] }
  await page.route('**/api/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (!path.startsWith('/api/')) return route.continue()
    expect(path).not.toBe('/api/chat/understand')
    if (path.endsWith('/me')) return route.fulfill({ json: { id: 'owner', role: 'Customer', displayName: 'Owner' } })
    if (path.endsWith('/auth/csrf')) return route.fulfill({ json: { token: 'csrf' } })
    if (path.endsWith('/my/orders')) return route.fulfill({ json: { items: [] } })
    if (path.endsWith('/assistant/sessions')) return route.fulfill({ json: route.request().method() === 'POST' ? saved : [] })
    if (path.endsWith('/turns')) {
      calls++
      const body = route.request().postDataJSON()
      expect(body.content).toBe(question)
      expect(body.imageBase64).toBeTruthy()
      expect(body.mimeType).toBe('image/png')
      expect(body.route).toBeUndefined()
      saved = { id: 'session', version: 1, selectedOrderId: 'owned', messages: [
        { role: 'user', content: question, imageUrl: `data:image/png;base64,${body.imageBase64}` },
        { role: 'assistant', content: 'Ảnh chỉ đối chiếu mẫu xe, không xác minh VIN.', generationMode: 'bedrock-natural',
          grounded: true, status: 'partial', evidence: [{ contextId: 'tool:image', section: 'image', content: 'Model comparison' }],
          citations: [{ contextId: 'tool:image', title: 'Nguồn đối chiếu đơn', sourceDetailPath: '/account/orders/owned' }] }
      ] }
      return route.fulfill({ json: saved })
    }
    if (path.includes('/assistant/sessions/')) return route.fulfill({ json: saved })
    return route.fulfill({ json: { items: [] } })
  })
  await page.goto('/chat')
  await page.locator('input[type=file]').setInputFiles({ name: 'car.png', mimeType: 'image/png',
    buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=', 'base64') })
  await page.getByRole('textbox', { name: 'Câu hỏi' }).fill(question)
  await page.getByRole('button', { name: 'Gửi câu hỏi' }).click()
  await expect(page.getByText('Ảnh chỉ đối chiếu mẫu xe, không xác minh VIN.')).toBeVisible()
  await expect(page.getByRole('textbox', { name: 'Câu hỏi' })).toHaveValue('')
  await page.getByText('Nguồn dữ liệu của câu trả lời', { exact: true }).click()
  await expect(page.getByRole('link', { name: 'Nguồn đối chiếu đơn' })).toHaveAttribute('href', '/account/orders/owned')
  await page.reload()
  await expect(page.getByText('Một phần dữ liệu chưa có hoặc chưa xác minh được.')).toBeVisible()
  await page.getByText('Nguồn dữ liệu của câu trả lời', { exact: true }).click()
  await expect(page.getByRole('link', { name: 'Nguồn đối chiếu đơn' })).toBeVisible()
  expect(calls).toBe(1)
})
