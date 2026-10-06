import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AccountHome } from '../src/features/account/AccountHome';
import { request } from '../src/features/orders/api';
vi.mock('../src/features/orders/Session', () => ({ useOrdersSession: () => ({ user: { displayName: 'Nguyễn An', role: 'Customer' } }) }));
vi.mock('../src/features/orders/api', async original => ({ ...await original<object>(), request: vi.fn() }));
function mount() { render(<MemoryRouter><AccountHome /></MemoryRouter>); }
it('uses server totals rather than the preview length and links to real orders', async () => {
  vi.mocked(request).mockReset().mockImplementation(async path => path.includes('/orders') ? { totalCount: 21, items: [{ id: 'order-1', code: 'AW-001', carName: 'Toyota Vios', status: 'confirmed', totalVnd: 500000000, createdAt: '2026-10-01' }] } : path.includes('unread-count') ? { count: 2 } : [{ carId: '1' }, { carId: '2' }, { carId: '3' }]);
  mount();
  expect(await within(screen.getByRole('region', { name: 'Đơn mua xe' })).findByText('21')).toBeInTheDocument();
  expect(await within(screen.getByRole('region', { name: 'Xe yêu thích' })).findByText('3')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Toyota Vios/ })).toHaveAttribute('href', '/account/orders/order-1');
  expect(screen.getByText('Đã xác nhận')).toBeInTheDocument();
});
it('distinguishes zero data from loading and offers a useful empty state', async () => {
  vi.mocked(request).mockReset().mockImplementation(async path => path.includes('/orders') ? { totalCount: 0, items: [] } : path.includes('unread-count') ? { count: 0 } : []);
  mount();
  expect(await screen.findByText('Bắt đầu hành trình mua xe')).toBeInTheDocument();
  expect(screen.getByText('Bạn đã xem hết thông báo')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: 'Khám phá xe' })).toHaveAttribute('href', '/cars');
});
it('retries a failed metric independently while retaining the other data', async () => {
  let attempts = 0;
  vi.mocked(request).mockReset().mockImplementation(async path => {
    if (path.includes('unread-count')) { if (++attempts === 1) throw new Error('offline'); return { count: 4 }; }
    return path.includes('/orders') ? { totalCount: 0, items: [] } : [];
  });
  mount();
  const notices = screen.getByRole('region', { name: 'Thông báo chưa đọc' });
  fireEvent.click(await within(notices).findByRole('button', { name: 'Thử lại' }));
  expect(await within(notices).findByText('4')).toBeInTheDocument();
  expect(screen.getByText('Bắt đầu hành trình mua xe')).toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(4);
});
