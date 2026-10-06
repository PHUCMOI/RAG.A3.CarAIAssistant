import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import type { Dealer } from '../src/entities/dealer/model'
import { DealerCard } from '../src/entities/dealer/DealerCard'
import DealersPage from '../src/pages/DealersPage'
import { filterDealers } from '../src/features/dealer-filter/search'
import { json } from './fixtures'

const dealers: Dealer[] = [
  { dealerId: 1, name: 'Toyota Láng Hạ', address: 'Láng Hạ, Hà Nội', city: 'Hanoi', supportedBrands: ['Toyota'], checkedAt: '2026-10-01', phone: '+84 24 1234 5678', website: 'https://example.com', sourceId: 'toyota-source' },
  { dealerId: 2, name: 'Toyota Sài Gòn', address: 'Quận 1', city: 'Ho Chi Minh City', supportedBrands: ['Toyota'], checkedAt: '2026-10-01' },
  { dealerId: 3, name: 'Honda Đà Nẵng', address: 'Đường 2 tháng 9', city: 'Da Nang', supportedBrands: ['Honda'], checkedAt: '2026-10-01' },
]
it('combines brand, Vietnamese city names and accent-insensitive address search', () => {
  expect(filterDealers(dealers, new URLSearchParams('brand=Toyota&city=Hà Nội&query=LANG HA')).map(dealer => dealer.dealerId)).toEqual([1])
  expect(filterDealers(dealers, new URLSearchParams('query=da nang')).map(dealer => dealer.dealerId)).toEqual([3])
  expect(filterDealers(dealers, new URLSearchParams('brand=Toyota&city=Da Nang'))).toHaveLength(0)
})
it('links to the supplied phone, website, map address and source', () => {
  render(<MemoryRouter><DealerCard dealer={dealers[0]} /></MemoryRouter>)
  expect(screen.getByRole('link', { name: /Gọi Toyota Láng Hạ/ })).toHaveAttribute('href', 'tel:+842412345678')
  expect(screen.getByRole('link', { name: /Website đại lý/ })).toHaveAttribute('href', 'https://example.com/')
  const map = screen.getByRole('link', { name: /Xem bản đồ/ }).getAttribute('href')!
  expect(new URL(map).searchParams.get('query')).toContain('Láng Hạ, Hà Nội')
  expect(screen.getByRole('link', { name: 'Xem nguồn ↗' })).toHaveAttribute('href', '/sources/toyota-source')
})
it('handles unavailable contacts and invalid dates without creating unsafe website links', () => {
  render(<MemoryRouter><DealerCard dealer={{ ...dealers[1], address: '', checkedAt: 'invalid', website: 'javascript:alert(1)' }} /></MemoryRouter>)
  expect(screen.getByText('Chưa có số điện thoại')).toBeInTheDocument()
  expect(screen.getByText('Chưa có địa chỉ')).toBeInTheDocument()
  expect(screen.getByText('Ngày kiểm tra: Chưa cập nhật')).toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Website đại lý/ })).not.toBeInTheDocument()
  expect(screen.queryByRole('link', { name: /Xem bản đồ/ })).not.toBeInTheDocument()
})
it('preserves URL filters and the query when retrying a failed request', async () => {
  const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(json({ items: dealers, count: dealers.length }))
  vi.stubGlobal('fetch', fetchMock)
  render(<MemoryRouter initialEntries={['/dealers?brand=Toyota&city=Hanoi&query=lang+ha']}><DealersPage /></MemoryRouter>)
  fireEvent.click(await screen.findByRole('button', { name: 'Thử lại' }))
  expect(await screen.findByRole('heading', { name: 'Toyota Láng Hạ' })).toBeInTheDocument()
  expect(screen.getByRole('textbox', { name: 'Tìm đại lý' })).toHaveValue('lang ha')
  expect(screen.getByRole('combobox', { name: 'Hãng xe' })).toHaveValue('Toyota')
  expect(screen.getByRole('combobox', { name: 'Thành phố' })).toHaveValue('Hanoi')
})
