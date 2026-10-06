import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { expect, it, vi } from 'vitest';
import { AppHeader } from '../src/shared/components/AppHeader';
import { request } from '../src/features/orders/api';
const session = vi.hoisted(() => ({ user: null as null | { id: string; role: 'Admin' | 'Customer'; displayName: string }, refresh: vi.fn().mockResolvedValue(undefined) }));
vi.mock('../src/features/orders/Session', () => ({ useOrdersSession: () => session }));
vi.mock('../src/features/orders/api', () => ({ request: vi.fn() }));
function mount(admin = false, path = '/') { render(<MemoryRouter initialEntries={[path]}><AppHeader admin={admin} /></MemoryRouter>); }
it('shows guest login without a duplicate account navigation item', () => {
  session.user = null; mount();
  expect(screen.getByRole('link', { name: /Đăng nhập/ })).toHaveAttribute('href', '/login');
  expect(screen.queryByRole('link', { name: 'Tài khoản' })).not.toBeInTheDocument();
});
it('groups admin routes, marks the current group and closes with Escape or outside click', () => {
  session.user = { id: 'admin', role: 'Admin', displayName: 'Administrator' }; mount(true, '/admin/change-requests');
  const trigger = screen.getByRole('button', { name: 'Yêu cầu' });
  expect(trigger).toHaveClass('active');
  expect(screen.queryByRole('link', { name: 'Dữ liệu' })).not.toBeInTheDocument();
  expect(screen.queryByRole('link', { name: 'Cấu hình RAG' })).not.toBeInTheDocument();
  fireEvent.click(trigger);
  expect(screen.getByRole('link', { name: 'Đề nghị thay đổi' })).toHaveAttribute('aria-current', 'page');
  fireEvent.keyDown(trigger, { key: 'Escape' });
  expect(trigger).toHaveFocus(); expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(trigger); fireEvent.click(screen.getByRole('button', { name: 'Chăm sóc' }));
  expect(trigger).toHaveAttribute('aria-expanded', 'false');
  fireEvent.pointerDown(document.body);
  expect(screen.getByRole('button', { name: 'Chăm sóc' })).toHaveAttribute('aria-expanded', 'false');
});
it('shows customer shortcuts and preserves the session after a failed logout so it can be retried', async () => {
  session.user = { id: 'customer', role: 'Customer', displayName: 'Nguyễn An' }; mount(false, '/account/orders');
  vi.mocked(request).mockReset().mockRejectedValueOnce(new Error('Offline')).mockResolvedValueOnce(undefined);
  const trigger = screen.getByRole('button', { name: 'Tài khoản' });
  fireEvent.click(trigger);
  expect(screen.getByRole('link', { name: 'Đơn hàng của tôi' })).toHaveAttribute('href', '/account/orders');
  expect(screen.getByText('Nguyễn An')).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Đăng xuất' }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Offline');
  fireEvent.click(screen.getByRole('button', { name: 'Thử lại đăng xuất' }));
  await waitFor(() => expect(request).toHaveBeenCalledTimes(2));
  await waitFor(() => expect(screen.queryByRole('alert')).not.toBeInTheDocument());
});
