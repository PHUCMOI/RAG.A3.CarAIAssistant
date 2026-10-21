import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { NextSteps, nextSteps, type NextStepContext } from '../src/features/chat/NextSteps';

describe('next steps', () => {
  for (const role of ['guest', 'customer', 'admin'] as const) {
    for (const status of ['ok', 'partial', 'no_data', 'needs_clarification', 'forbidden', 'error', undefined]) {
      it(`provides a way forward for ${role}/${status}`, () => {
        const steps = nextSteps({ role, status });
        expect(steps.length).toBeGreaterThan(0);
        expect(steps.some(step => step.path || step.prompt)).toBe(true);
        if (role !== 'admin') expect(steps.some(step => step.path?.startsWith('/admin/'))).toBe(false);
      });
    }
  }
  it('uses customer actions from verified progress and rejects admin paths', () => {
    const steps = nextSteps({ role: 'customer', orderCode: 'AW-DEMO', sections: [{ topic: 'status', progress: { nextActions: [
      { actor: 'customer', content: 'Xem thanh toán', detailUrl: '/account/orders/one' },
      { actor: 'admin', content: 'Xác nhận thu tiền', detailUrl: '/admin/orders/one' },
    ] } }] });
    expect(steps.some(step => step.label === 'Xem thanh toán')).toBe(true);
    expect(steps.some(step => step.label === 'Xác nhận thu tiền')).toBe(false);
  });
  it('keeps a fallback when untrusted cached references are invalid', () => {
    const steps = nextSteps({ role: 'customer', contexts: [{ carId: '../../admin/orders', displayName: 'Invalid reference' }] });
    expect(steps.some(step => step.prompt)).toBe(true);
    expect(steps.some(step => step.path?.includes('..'))).toBe(false);
  });
  it('points guests needing private data to login', () => {
    expect(nextSteps({ role: 'guest', status: 'needs_clarification', requiresLogin: true }).some(step => step.path === '/login?returnTo=%2Fchat')).toBe(true);
  });
  it('uses actual admin data to prioritize payment review without executing it', () => {
    const context: NextStepContext = { role: 'admin', data: { scope: 'orders', items: [{ code: 'AW-DEMO', remainingVnd: 500 }] } };
    const onPrompt = vi.fn();
    render(<MemoryRouter><NextSteps context={context} onPrompt={onPrompt} /></MemoryRouter>);
    expect(onPrompt).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Kiểm tra thanh toán AW-DEMO' }));
    expect(onPrompt).toHaveBeenCalledWith(expect.objectContaining({ scope: 'orders', query: 'AW-DEMO', prompt: expect.stringContaining('AW-DEMO') }));
  });
});
it('offers catalogue navigation when a customer car-budget question fails', () => {
  const steps = nextSteps({ role: 'customer', status: 'error', question: 'có xe nào hợp tài chính 900tr và 5 chỗ ngồi không' });
  expect(steps.some(step => step.path === '/cars')).toBe(true);
  expect(steps.some(step => step.path === '/account/orders')).toBe(false);
});

it('keeps a failed car comparison in the catalogue', () => {
  const steps = nextSteps({ role: 'customer', status: 'error', question: 'So sánh Honda CR-V và Mazda CX-5 về giá, số ghế và bảo hành.' });
  expect(steps.some(step => step.path === '/cars')).toBe(true);
  expect(steps.some(step => step.path === '/account/orders')).toBe(false);
});

it('keeps order comparisons in the orders area', () => {
  const steps = nextSteps({ role: 'customer', status: 'error', question: 'So sánh hai đơn hàng của tôi' });
  expect(steps.some(step => step.path === '/account/orders')).toBe(true);
});

it('does not ask guests for order codes when clarifying a catalogue question', () => {
  const steps = nextSteps({ role: 'guest', status: 'needs_clarification' });
  expect(steps.some(step => /mã đơn/i.test(step.label))).toBe(false);
  expect(steps.some(step => /mẫu xe|tên xe/i.test(step.label))).toBe(true);
});

it('does not ask customers for order codes in catalogue chat', () => {
  const steps = nextSteps({ role: 'customer', status: 'needs_clarification', catalog: true });
  expect(steps.some(step => /mã đơn/i.test(step.label))).toBe(false);
});

it('links directly to a pending change request reported by chat', () => {
  const path = '/account/change-requests?requestId=22fd6d41-a53b-427c-a032-b1700427bd2c';
  const steps = nextSteps({ role: 'customer', status: 'ok', orderCode: 'AW-DEMO',
    sections: [{ topic: 'change_request', detailUrl: path }] });
  expect(steps.some(step => step.path === path && /đề nghị/i.test(step.label))).toBe(true);
  expect(steps.some(step => /thử lại|bổ sung mã đơn/i.test(step.label))).toBe(false);
});
