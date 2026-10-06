import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LoginPage } from '../src/features/orders/LoginPage';
import { ApiError } from '../src/features/orders/api';
import { request } from '../src/features/orders/api';
vi.mock('../src/features/orders/api', async importOriginal => ({ ...await importOriginal<object>(), request: vi.fn() }));
vi.mock('../src/features/orders/Session', () => ({ useOrdersSession: () => ({ user: null, error: '', refresh: async () => {} }) }));
function mount(url = '/login') {
  render(<MemoryRouter initialEntries={[url]}><Routes><Route path="/login" element={<LoginPage />} /><Route path="/chat" element={<p>Chat destination</p>} /><Route path="/account" element={<p>Account destination</p>} /><Route path="/admin/orders" element={<p>Admin destination</p>} /></Routes></MemoryRouter>);
  fireEvent.change(screen.getByLabelText('Email', { exact: true }), { target: { value: 'test@example.com' } });
  fireEvent.change(screen.getByLabelText('Mật khẩu', { exact: true }), { target: { value: 'password' } });
}
it('retains credentials after an error, allows visibility toggling and retries the same login', async () => {
  vi.mocked(request).mockReset().mockRejectedValueOnce(new ApiError(401, 'Unauthorized')).mockResolvedValueOnce({ role: 'Customer' });
  mount('/login?returnTo=%2Fchat');
  fireEvent.click(screen.getByRole('button', { name: 'Hiện mật khẩu' }));
  expect(screen.getByLabelText('Mật khẩu', { exact: true })).toHaveAttribute('type', 'text');
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập', exact: true }));
  expect(await screen.findByRole('alert')).toHaveTextContent('Email hoặc mật khẩu chưa đúng');
  expect(screen.getByLabelText('Mật khẩu', { exact: true })).toHaveValue('password');
  fireEvent.click(screen.getByRole('button', { name: 'Ẩn mật khẩu' }));
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập', exact: true }));
  expect(await screen.findByText('Chat destination')).toBeInTheDocument();
  expect(request).toHaveBeenCalledTimes(2);
});
it('rejects external redirect targets and prevents duplicate submissions while pending', async () => {
  let resolve!: (value: unknown) => void;
  vi.mocked(request).mockReset().mockImplementation(() => new Promise(done => { resolve = done; }));
  mount('/login?returnTo=https%3A%2F%2Fexample.com');
  const form = screen.getByLabelText('Email', { exact: true }).closest('form')!;
  fireEvent.submit(form); fireEvent.submit(form);
  expect(request).toHaveBeenCalledTimes(1);
  resolve({ role: 'Customer' });
  await waitFor(() => expect(screen.getByText('Account destination')).toBeInTheDocument());
});
it('routes admin accounts to the admin workspace', async () => {
  vi.mocked(request).mockReset().mockResolvedValue({ role: 'Admin' });
  mount('/login?returnTo=%2Fchat');
  fireEvent.click(screen.getByRole('button', { name: 'Đăng nhập', exact: true }));
  expect(await screen.findByText('Admin destination')).toBeInTheDocument();
});
