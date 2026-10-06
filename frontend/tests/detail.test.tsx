import { it, expect, vi } from 'vitest'
import { render, screen, waitFor, act, fireEvent } from '@testing-library/react'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import CarDetailPage from '../src/pages/CarDetailPage'
import { car, json } from './fixtures'
vi.mock('../src/features/orders/Session', () => ({ useOrdersSession: () => ({ user: null }) }))
it('ignores an older car response after navigation and uses the warranty source', async () => {
  let resolveOld!: (response: Response) => void
  vi.stubGlobal('fetch', vi.fn((url: string) => {
    if (url === '/api/cars/old') return new Promise<Response>(resolve => { resolveOld = resolve })
    if (url.startsWith('/api/warranties')) return Promise.resolve(json({ items: [{ durationMonths: 36, distanceLimitKm: 100000, conditions: 'Điều kiện thử nghiệm', sourceId: 'warranty-source' }] }))
    if (url === '/api/dealers') return Promise.resolve(json({ items: [] }))
    return Promise.resolve(json(car('new', { displayName: 'Xe mới' })))
  }))
  const router = createMemoryRouter([{ path: '/cars/:carId', element: <CarDetailPage /> }], { initialEntries: ['/cars/old'] })
  render(<RouterProvider router={router} />)
  await waitFor(() => expect(fetch).toHaveBeenCalled())
  await act(() => router.navigate('/cars/new'))
  expect(await screen.findByRole('heading', { name: 'Xe mới' })).toBeInTheDocument()
  await act(async () => resolveOld(json(car('old', { displayName: 'Xe cũ' }))))
  expect(screen.queryByRole('heading', { name: 'Xe cũ' })).not.toBeInTheDocument()
  expect(await screen.findByRole('link', { name: /Nguồn chính sách/ })).toHaveAttribute('href', '/sources/warranty-source')
  expect(screen.getByRole('link', { name: 'Hỏi về xe này' })).toHaveAttribute('href', '/chat?car=new&carName=Xe%20m%E1%BB%9Bi')
  expect(screen.getByText(/Chưa có nguồn giá/)).toBeInTheDocument()
})
it.each([404, 500])('distinguishes HTTP %s from other errors', async status => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({}, status)))
  const router = createMemoryRouter([{ path: '/cars/:carId', element: <CarDetailPage /> }], { initialEntries: ['/cars/test'] })
  render(<RouterProvider router={router} />)
  expect(await screen.findByText(status === 404 ? 'Không tìm thấy mẫu xe này.' : 'Không kết nối được dữ liệu xe. Vui lòng thử lại.')).toBeInTheDocument()
})
it('adds the detail car to the existing comparison without losing earlier selections', async () => {
  localStorage.setItem('compareCars', JSON.stringify(['existing']))
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(json(url.startsWith('/api/cars/') ? car('new', { displayName: 'Xe mới', fuelType: 'Petrol', transmission: 'Automatic', priceVndFrom: null, priceSourceId: null }) : { items: [] }))))
  const router = createMemoryRouter([{ path: '/cars/:carId', element: <CarDetailPage /> }], { initialEntries: ['/cars/new'] })
  render(<RouterProvider router={router} />)
  fireEvent.click(await screen.findByRole('button', { name: '+ So sánh xe này' }))
  expect(JSON.parse(localStorage.getItem('compareCars')!)).toEqual(['existing', 'new'])
  expect(screen.getByRole('link', { name: 'Mở bảng so sánh →' })).toHaveAttribute('href', '/compare?ids=existing%2Cnew')
  expect(screen.getByRole('button', { name: '✓ Đã chọn so sánh' })).toHaveAttribute('aria-pressed', 'true')
  expect(screen.getAllByText('Xăng')).toHaveLength(2)
  expect(screen.getByText('Chưa có giá tham khảo')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: 'Xem nguồn giá ↗' })).not.toBeInTheDocument()
})
it('reports the three-car limit and keeps the original comparison', async () => {
  localStorage.setItem('compareCars', JSON.stringify(['a', 'b', 'c']))
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(json(url.startsWith('/api/cars/') ? car('new') : { items: [] }))))
  const router = createMemoryRouter([{ path: '/cars/:carId', element: <CarDetailPage /> }], { initialEntries: ['/cars/new'] })
  render(<RouterProvider router={router} />)
  fireEvent.click(await screen.findByRole('button', { name: '+ So sánh xe này' }))
  expect(screen.getByRole('status')).toHaveTextContent('Chỉ có thể so sánh tối đa 3 xe')
  expect(JSON.parse(localStorage.getItem('compareCars')!)).toEqual(['a', 'b', 'c'])
})
