import { it, expect, vi } from 'vitest'
import { render, screen, within, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { ComparisonTable } from '../src/features/car-compare/ComparisonTable'
import ComparePage from '../src/pages/ComparePage'
import { car, json } from './fixtures'

it('keeps price context when prices differ and never treats missing prices as zero', () => {
  render(<MemoryRouter><ComparisonTable cars={[car('1', { priceVndFrom: null }), car('2', { priceVndFrom: 0 })]} differences /></MemoryRouter>)
  const row = screen.getByRole('rowheader', { name: /Giá tham khảo từ/ }).closest('tr')!
  expect(within(row).getByText('Chưa có dữ liệu')).toBeInTheDocument()
  expect(within(row).getByText('0 ₫')).toBeInTheDocument()
  expect(screen.getByRole('rowheader', { name: 'Nguồn giá' })).toBeInTheDocument()
  expect(screen.queryByRole('rowheader', { name: 'Số ghế' })).not.toBeInTheDocument()
})
it('reports identical data when missing values use null or empty strings', () => {
  render(<MemoryRouter><ComparisonTable cars={[car('1', { engine: null }), car('2', { engine: '' })]} differences /></MemoryRouter>)
  expect(screen.getByText('Không có thông số khác nhau trong dữ liệu hiện có.')).toBeInTheDocument()
  expect(screen.queryByRole('table')).not.toBeInTheDocument()
})
it('restores saved selection, orders columns by URL and keeps an explicit empty selection', async () => {
  const items = [car('2', { priceVndFrom: 200 }), car('1', { priceVndFrom: 100 })]
  localStorage.setItem('compareCars', JSON.stringify(['1', '2']))
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async url => String(url).includes('/compare?') ? json({ items, missingIds: [] }) : json({ items, count: 2 })))
  render(<MemoryRouter initialEntries={['/compare']}><ComparePage /></MemoryRouter>)
  const table = await screen.findByRole('table')
  const headings = within(table).getAllByRole('columnheader')
  expect(headings[1]).toHaveTextContent('Xe 1')
  expect(headings[2]).toHaveTextContent('Xe 2')
  fireEvent.click(screen.getByRole('button', { name: 'Xóa tất cả xe' }))
  await waitFor(() => expect(screen.queryByRole('table')).not.toBeInTheDocument())
  expect(localStorage.getItem('compareCars')).toBe('[]')
})
