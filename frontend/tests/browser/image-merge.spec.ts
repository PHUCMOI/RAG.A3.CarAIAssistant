import { test, expect } from '@playwright/test';

test('guest image retry keeps the attachment and sends it only once on success', async ({ page }) => {
  await page.route('**/api/orders-service/me', route => route.fulfill({ status: 401, json: {} }));
  let calls = 0;
  await page.route('**/api/image-service/chat', async route => {
    calls++;
    expect(route.request().headers()['content-type']).toContain('multipart/form-data');
    expect(route.request().postDataBuffer()?.toString()).toContain('car.png');
    if (calls === 1) await route.fulfill({ status: 503, json: {} });
    else await route.fulfill({ json: { answer: 'Image matched', identified_cars: [{ car_id: '1', brand: 'Toyota', model: 'Vios' }] } });
  });
  await page.goto('/chat');
  await page.locator('input[type=file]').setInputFiles({ name: 'car.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jS1sAAAAASUVORK5CYII=', 'base64') });
  await expect(page.locator('.chat-attachment-name')).toHaveText('car.png');
  await page.locator('.assistant-composer > button').click();
  await expect(page.locator('.assistant-failed')).toBeVisible();
  await expect(page.locator('.chat-attachment-name')).toHaveText('car.png');
  await page.locator('.assistant-failed button').click();
  await expect(page.locator('.assistant-answer').last()).toHaveText('Image matched');
  await expect(page.locator('.chat-image-preview-bubble')).toHaveCount(1);
  await expect(page.locator('.chat-attachment-name')).toHaveCount(0);
  await expect(page.locator('a[href="/cars/1"]')).toBeVisible();
  await expect(page.locator('a[href*="image_retrieval_clip"]')).toHaveCount(0);
  expect(calls).toBe(2);
});
