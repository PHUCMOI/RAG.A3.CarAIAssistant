import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { UnifiedAssistantChat } from '../src/features/orders/OrderAssistantPage'
import { request } from '../src/features/orders/api'
import { json } from './fixtures'
vi.mock('../src/features/orders/Session', () => ({ useOrdersSession: () => ({ user: { id: 'alice', role: 'Customer' } }) }))
vi.mock('../src/features/orders/api', async importOriginal => ({ ...await importOriginal<object>(), request: vi.fn() }))
const initial = { id: 's1', version: 0, selectedOrderId: null, messages: [] }
it('retries an order question with the original request ID and no duplicate messages', async () => {
  let attempts = 0
  const bodies: unknown[] = []
  vi.mocked(request).mockImplementation(async (path, method, body) => {
    if (path === '/my/orders?pageSize=100') return { items: [] }
    if (path === '/assistant/sessions') return method === 'POST' ? initial : []
    if (path.endsWith('/messages')) {
      bodies.push(body); attempts++
      if (attempts === 1) throw new Error('Mất kết nối')
      return { ...initial, version: 1, messages: [{ role: 'user', content: 'Đơn hàng của tôi' }, { role: 'assistant', content: 'Đơn đang chuẩn bị.' }] }
    }
    throw new Error(path)
  })
  render(<MemoryRouter><UnifiedAssistantChat /></MemoryRouter>)
  const input = await screen.findByRole('textbox', { name: 'Câu hỏi' })
  fireEvent.change(input, { target: { value: 'Đơn hàng của tôi' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }))
  fireEvent.click(await screen.findByRole('button', { name: 'Gửi lại câu hỏi' }))
  expect(await screen.findByText('Đơn đang chuẩn bị.')).toBeInTheDocument()
  expect(bodies[1]).toEqual(bodies[0])
  expect(screen.getAllByText('Đơn hàng của tôi')).toHaveLength(1)
})
it('restores catalogue-only chat after refresh without needing a server session', async () => {
  vi.mocked(request).mockImplementation(async path => path === '/my/orders?pageSize=100' ? { items: [] } : [])
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ answer: 'Xe phù hợp', contexts: [] })))
  const first = render(<MemoryRouter><UnifiedAssistantChat /></MemoryRouter>)
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Tư vấn SUV' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }))
  await screen.findByText('Xe phù hợp'); first.unmount()
  render(<MemoryRouter><UnifiedAssistantChat /></MemoryRouter>)
  expect(await screen.findByText('Xe phù hợp')).toBeInTheDocument()
  fireEvent.change(screen.getByRole('combobox', { name: 'Chủ đề câu hỏi' }), { target: { value: 'cars' } })
  fireEvent.click(screen.getByRole('button', { name: 'Chuẩn bị phiếu hỗ trợ' }))
  expect(screen.getByRole('combobox', { name: 'Chủ đề câu hỏi' })).toHaveValue('orders')
  fireEvent.click(screen.getByRole('button', { name: '+ Hội thoại mới' }))
  await waitFor(() => expect(screen.queryByText('Xe phù hợp')).not.toBeInTheDocument())
  expect(screen.getByRole('textbox')).toHaveValue('')
})
it('sets the correct topic for prompts even when an order topic was selected', async () => {
  vi.mocked(request).mockImplementation(async path => path === '/my/orders?pageSize=100' ? { items: [] } : [])
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ answer: 'Gợi ý SUV', contexts: [] })))
  render(<MemoryRouter><UnifiedAssistantChat /></MemoryRouter>)
  const topic = await screen.findByRole('combobox', { name: 'Chủ đề câu hỏi' })
  fireEvent.change(topic, { target: { value: 'orders' } })
  fireEvent.click(screen.getByRole('button', { name: /Tìm chiếc xe phù hợp/ }))
  expect(topic).toHaveValue('cars')
  fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }))
  await screen.findByText('Gợi ý SUV')
  expect(vi.mocked(request).mock.calls.some(([, method]) => method === 'POST')).toBe(false)
})
it('keeps the chat and draft visible during a retry of order data', async () => {
  let retryStarted = false
  let resolve!: (value: unknown) => void
  vi.mocked(request).mockImplementation(async path => {
    if (path === '/my/orders?pageSize=100') {
      if (!retryStarted) throw new Error('Dịch vụ đơn hàng không phản hồi')
      return new Promise(done => { resolve = done })
    }
    return []
  })
  render(<MemoryRouter><UnifiedAssistantChat /></MemoryRouter>)
  const input = await screen.findByRole('textbox')
  fireEvent.change(input, { target: { value: 'Câu hỏi đang soạn' } })
  retryStarted = true
  fireEvent.click(screen.getByRole('button', { name: /Thử lại/ }))
  await screen.findByText('Đang cập nhật lịch sử và đơn hàng…')
  expect(input).toHaveValue('Câu hỏi đang soạn')
  expect(input).toBeVisible()
  resolve({ items: [] })
  await waitFor(() => expect(screen.queryByText('Đang cập nhật lịch sử và đơn hàng…')).not.toBeInTheDocument())
  expect(input).toHaveValue('Câu hỏi đang soạn')
})
