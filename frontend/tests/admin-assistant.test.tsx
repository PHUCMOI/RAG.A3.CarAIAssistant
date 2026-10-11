import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AdminAssistantPage from '../src/features/admin/AdminAssistantPage';
const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock('../src/features/orders/api', async importOriginal => ({ ...await importOriginal<object>(), request: mocks.request }));
vi.mock('../src/features/orders/Session', () => ({ useOrdersSession: () => ({ user: { id: 'admin', role: 'Admin' } }) }));
describe('admin assistant', () => {
  beforeEach(() => { mocks.request.mockReset(); });
  it('sends selected filters and renders verified results and record links', async () => {
    mocks.request.mockResolvedValue({ answer: 'Đơn **đã xác nhận**.', grounded: true, status: 'ok', retrievedAt: '2026-10-10T10:00:00Z', links: [{ title: 'AW-EXAMPLE', path: '/admin/orders/example' }] });
    render(<MemoryRouter><AdminAssistantPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Nhóm dữ liệu'), { target: { value: 'orders' } });
    fireEvent.change(screen.getByLabelText('Mã đơn'), { target: { value: 'AW-EXAMPLE' } });
    fireEvent.change(screen.getByLabelText('Trạng thái'), { target: { value: 'confirmed' } });
    fireEvent.click(screen.getByLabelText('Chỉ đơn trễ lịch dự kiến'));
    fireEvent.change(screen.getByLabelText('Câu hỏi cho trợ lý'), { target: { value: 'Kiểm tra thanh toán' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/admin/assistant/messages', 'POST', { question: 'Kiểm tra thanh toán', scope: 'orders', query: 'AW-EXAMPLE', status: 'confirmed', delayed: true, dateFrom: null, dateTo: null }));
    expect(await screen.findByRole('link', { name: 'AW-EXAMPLE' })).toHaveAttribute('href', '/admin/orders/example');
    expect(screen.getByText('đã xác nhận')).toBeInTheDocument();
  });
  it('keeps question on AI failure and prevents duplicate sends', async () => {
    let reject!: (error: Error) => void;
    mocks.request.mockImplementation(() => new Promise((_resolve, fail) => { reject = fail; }));
    render(<MemoryRouter><AdminAssistantPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Câu hỏi cho trợ lý'), { target: { value: 'Thống kê' } });
    const button = screen.getByRole('button', { name: 'Gửi câu hỏi' });
    fireEvent.click(button); fireEvent.click(button);
    expect(mocks.request).toHaveBeenCalledTimes(1);
    reject(new Error('AI không khả dụng'));
    expect(await screen.findByRole('alert')).toHaveTextContent('AI không khả dụng');
    expect(screen.getByLabelText('Câu hỏi cho trợ lý')).toHaveValue('Thống kê');
  });
  it('submits the selected revenue period without order filters', async () => {
    mocks.request.mockResolvedValue({ answer: 'Doanh thu vận hành trong kỳ.', grounded: true, status: 'ok', retrievedAt: '2026-10-10T10:00:00Z', links: [] });
    render(<MemoryRouter><AdminAssistantPage /></MemoryRouter>);
    fireEvent.change(screen.getByLabelText('Nhóm dữ liệu'), { target: { value: 'revenue' } });
    fireEvent.change(screen.getByLabelText('Từ ngày'), { target: { value: '2026-09-01' } });
    fireEvent.change(screen.getByLabelText('Đến ngày'), { target: { value: '2026-09-30' } });
    fireEvent.change(screen.getByLabelText('Câu hỏi cho trợ lý'), { target: { value: 'Doanh thu trong kỳ?' } });
    fireEvent.click(screen.getByRole('button', { name: 'Gửi câu hỏi' }));
    await waitFor(() => expect(mocks.request).toHaveBeenCalledWith('/admin/assistant/messages', 'POST', expect.objectContaining({ scope: 'revenue', dateFrom: '2026-09-01', dateTo: '2026-09-30', status: '', delayed: false })));
  });
});
