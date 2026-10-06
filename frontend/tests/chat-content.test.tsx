import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AnswerContent, ChatComposer, CopyAnswer } from '../src/features/chat/ChatContent'

it('formats headings, lists and tables while treating HTML as text', () => {
  render(<AnswerContent content={'## Lựa chọn\n- **Toyota**\n- Mazda\n\n| Xe | Giá |\n| --- | --- |\n| Toyota | 800 triệu |\n\n<img src=x onerror=alert(1) />'} />)
  expect(screen.getByRole('heading', { name: 'Lựa chọn' })).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(2)
  expect(screen.getByRole('cell', { name: '800 triệu' })).toBeInTheDocument()
  expect(screen.queryByRole('img')).not.toBeInTheDocument()
  expect(screen.getByText('<img src=x onerror=alert(1) />')).toBeInTheDocument()
})
it('shows feedback when copying succeeds or the clipboard is unavailable', async () => {
  const writeText = vi.fn().mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('blocked'))
  vi.stubGlobal('navigator', { clipboard: { writeText } })
  render(<CopyAnswer content="Câu trả lời" />)
  fireEvent.click(screen.getByRole('button'))
  await screen.findByText('Đã sao chép')
  expect(writeText).toHaveBeenCalledWith('Câu trả lời')
  fireEvent.click(screen.getByRole('button'))
  await screen.findByText('Không thể sao chép. Hãy chọn nội dung để sao chép thủ công.')
})
it('shows the character limit near capacity', () => {
  render(<ChatComposer value={'a'.repeat(900)} onChange={() => {}} busy={false} onSubmit={() => {}} sendLabel="Gửi" placeholder="Câu hỏi" notice="" />)
  expect(screen.getByText('900/1.000 ký tự')).toBeInTheDocument()
  expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '1000')
})
