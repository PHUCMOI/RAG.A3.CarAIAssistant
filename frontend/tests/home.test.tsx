import { expect, it, vi } from 'vitest';
import { fireEvent, render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import HomePage from '../src/pages/HomePage';
import { car, json } from './fixtures';
const cars = Array.from({ length: 8 }, (_, i) => car(String(i + 1), { brand: ['Toyota', 'Honda', 'Kia', 'Ford', 'Mazda', 'Hyundai', 'Toyota', 'Toyota'][i], displayName: `Xe ${i + 1}`, fuelType: 'Petrol' }));
function mount() { render(<MemoryRouter><HomePage /></MemoryRouter>); }
it('uses loaded dataset counts, diversifies the preview and shares comparison selections', async () => {
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(json(url.startsWith('/api/cars') ? { count: 999, items: cars } : { items: [1, 2] }))));
  mount();
  expect(await screen.findByRole('heading', { name: 'Xe 6' })).toBeInTheDocument();
  expect(document.querySelector('.hero-car strong')).toHaveTextContent('8');
  expect(document.querySelectorAll('.car-card')).toHaveLength(6);
  expect(screen.queryByRole('heading', { name: 'Xe 7' })).not.toBeInTheDocument();
  expect(screen.getAllByText('Xăng')).toHaveLength(6);
  const buttons = screen.getAllByRole('button', { name: '+ So sánh' });
  fireEvent.click(buttons[0]); fireEvent.click(buttons[1]);
  expect(screen.getByRole('link', { name: 'So sánh (2)' })).toHaveAttribute('href', '/compare?ids=1%2C2');
  expect(JSON.parse(localStorage.getItem('compareCars')!)).toEqual(['1', '2']);
});
it('retries auxiliary statistics without blocking an empty catalogue or clearing the query', async () => {
  let failed = true;
  vi.stubGlobal('fetch', vi.fn((url: string) => url === '/api/dealers' && failed ? Promise.reject(new Error('offline')) : Promise.resolve(json({ items: url === '/api/dealers' ? [1, 2, 3] : [] }))));
  mount();
  fireEvent.change(screen.getByRole('textbox', { name: 'Tìm kiếm xe' }), { target: { value: 'Honda' } });
  const retry = await screen.findByRole('button', { name: 'Thử lại số liệu đại lý' });
  failed = false; fireEvent.click(retry);
  expect(await screen.findByText('đại lý trong dữ liệu')).toBeInTheDocument();
  expect(document.querySelector('.stat-chip.one strong')).toHaveTextContent('3');
  expect(screen.getByRole('textbox', { name: 'Tìm kiếm xe' })).toHaveValue('Honda');
  expect(screen.getByText('Chưa có mẫu xe')).toBeInTheDocument();
  expect(screen.getByRole('link', { name: /Tư vấn cùng AI/ })).toHaveAttribute('href', '/chat');
});
it('preserves an existing three-car selection when another car is requested', async () => {
  localStorage.setItem('compareCars', JSON.stringify(['a', 'b', 'c']));
  vi.stubGlobal('fetch', vi.fn((url: string) => Promise.resolve(json({ items: url.startsWith('/api/cars') ? cars : [] }))));
  mount();
  fireEvent.click((await screen.findAllByRole('button', { name: '+ So sánh' }))[0]);
  expect(within(screen.getByRole('complementary', { name: 'Xe đã chọn so sánh' })).getByRole('status')).toHaveTextContent('tối đa 3 xe');
  expect(JSON.parse(localStorage.getItem('compareCars')!)).toEqual(['a', 'b', 'c']);
});
