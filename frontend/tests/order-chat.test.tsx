import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { UnifiedAssistantChat } from '../src/features/orders/OrderAssistantPage'
import { request } from '../src/features/orders/api'
vi.mock('../src/features/orders/Session', () => ({ useOrdersSession: () => ({ user: { id: 'alice', role: 'Customer' } }) }))
vi.mock('../src/features/orders/api', async importOriginal => ({ ...await importOriginal<object>(), request: vi.fn() }))
vi.mock('../src/features/chat/routing', async importOriginal => { const actual = await importOriginal<typeof import('../src/features/chat/routing')>(); return { ...actual, understandQuestion: vi.fn(async (question: string, context: { lastRoute?: string }) => ({ question, route: actual.isOrderQuestion(question, context.lastRoute === 'orders') ? 'orders' : 'catalogue', needsClarification: false, clarification: null })) } })
const initial = { id: 's1', version: 0, selectedOrderId: null, messages: [] }
it('lets a typed order code override the order linked to the chat', async () => {
  const bodies: Array<{ orderId?: string | null; content?: string }> = []
  vi.mocked(request).mockImplementation(async (path, method, body) => {
    if (path === '/my/orders?pageSize=100') return { items: [{ id: 'old', code: 'AW-OLD', carName: 'Old car' }] }
    if (path === '/my/orders/old') return { id: 'old', code: 'AW-OLD', carName: 'Old car' }
    if (path === '/assistant/sessions') return method === 'POST' ? initial : []
    if (path.endsWith('/messages')) {
      bodies.push(body as typeof bodies[number])
      return { ...initial, version: 1, messages: [{ role: 'assistant', content: 'Đã tra cứu đơn mới' }] }
    }
    throw new Error(path)
  })
  render(<MemoryRouter initialEntries={['/chat?orderId=old']}><UnifiedAssistantChat /></MemoryRouter>)
  const input = await screen.findByRole('textbox', { name: 'Câu hỏi' })
  await waitFor(() => expect(input).toHaveValue('Tiến độ, lịch giao, thanh toán và hồ sơ hiện tại của đơn này?'))
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  fireEvent.change(input, { target: { value: 'Thanh toán đơn AW-NEW thế nào?' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }))
  await screen.findByText('Đã tra cứu đơn mới')
  expect(bodies[0].orderId).toBeNull()
})
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
it('restores catalogue chat from the server after refresh', async () => {
  vi.mocked(request).mockImplementation(async (path, method) => {
    if (path === '/my/orders?pageSize=100') return { items: [] }
    if (path === '/assistant/sessions') return method === 'POST' ? initial : []
    return { ...initial, version: 1, messages: [{ role: 'assistant', content: 'Xe phù hợp', catalog: true }] }
  })
  const first = render(<MemoryRouter><UnifiedAssistantChat /></MemoryRouter>)
  fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Tư vấn SUV' } })
  fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }))
  await screen.findByText('Xe phù hợp'); first.unmount()
  render(<MemoryRouter><UnifiedAssistantChat /></MemoryRouter>)
  expect(await screen.findByText('Xe phù hợp')).toBeInTheDocument()
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: '+ Hội thoại mới' }))
  await waitFor(() => expect(screen.queryByText('Xe phù hợp')).not.toBeInTheDocument())
  expect(screen.getByRole('textbox')).toHaveValue('')
})
it('automatically routes catalogue prompts without topic controls', async () => {
  vi.mocked(request).mockImplementation(async (path, method) => {
    if (path === '/my/orders?pageSize=100') return { items: [] }
    if (path === '/assistant/sessions') return method === 'POST' ? initial : []
    return { ...initial, version: 1, messages: [{ role: 'assistant', content: 'Gợi ý SUV', catalog: true }] }
  })
  render(<MemoryRouter><UnifiedAssistantChat /></MemoryRouter>)
  await screen.findByRole('textbox')
  fireEvent.click(screen.getByRole('button', { name: /Tìm chiếc xe phù hợp/ }))
  expect(screen.queryByRole('combobox')).not.toBeInTheDocument()
  fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }))
  await screen.findByText('Gợi ý SUV')
  expect(vi.mocked(request).mock.calls.some(([path, method]) => path.endsWith('/catalogue-messages') && method === 'POST')).toBe(true)
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
