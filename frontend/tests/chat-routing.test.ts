import { expect, it } from 'vitest'
import { isOrderQuestion } from '../src/features/chat/routing'

it('recognizes order and account topics and lets explicit car topics override follow-up context', () => {
  expect(isOrderQuestion('Trạng thái hiện tại thế nào?')).toBe(true)
  expect(isOrderQuestion('Còn phải trả bao nhiêu?')).toBe(true)
  expect(isOrderQuestion('Tôi muốn gặp nhân viên hỗ trợ')).toBe(true)
  expect(isOrderQuestion('Đổi mật khẩu')).toBe(true)
  expect(isOrderQuestion('Bao nhiêu?', true)).toBe(true)
  expect(isOrderQuestion('Toyota Vios giá bao nhiêu?', true)).toBe(false)
  expect(isOrderQuestion('So sánh xe Toyota và Honda', true)).toBe(false)
  expect(isOrderQuestion('Đơn AW-DEMO-0001 mua Toyota khi nào nhận xe?', true)).toBe(true)
  expect(isOrderQuestion('Xe đó bảo hành bao lâu?', true)).toBe(false)
})
