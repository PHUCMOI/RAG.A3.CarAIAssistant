import { it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { AnswerContent, ChatComposer, CopyAnswer } from '../src/features/chat/ChatContent'

it('renders Bedrock prose directly without injecting another catalogue introduction', () => {
  render(<AnswerContent natural content={'**Ford Edge** là mẫu SUV.\n\n### Giá tham khảo\nTừ **1.560.000.000 VND**.\n\n| Tiêu chí | Ford Edge | Honda CR-V |\n| --- | --- | --- |\n| Số chỗ | 5 | 7 |'} contexts={[{ carId: 'edge', displayName: 'Ford Edge', description: 'English description', summary: 'Template introduction' }]} />)
  expect(screen.queryByText('Template introduction')).not.toBeInTheDocument()
  expect(screen.queryByText('English description')).not.toBeInTheDocument()
  expect(screen.getByRole('heading', { name: 'Giá tham khảo' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Honda CR-V' })).toBeInTheDocument()
})

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
it('groups verified car statements into readable facts without losing caveats', () => {
  const { container } = render(<AnswerContent content={'Honda CR-V — Hộp số: Tự động.\n\nHonda CR-V có 5 chỗ.\n\nHonda CR-V có giá tham khảo từ 998.000.000 VND.\n\nToyota RAV4 — Hộp số: Tự động.\n\nĐây là giá tham khảo từ dữ liệu, không phải báo giá đại lý theo thời gian thực.'} />)
  expect(screen.getByRole('columnheader', { name: 'Honda CR-V' })).toBeInTheDocument()
  expect(screen.getByRole('columnheader', { name: 'Toyota RAV4' })).toBeInTheDocument()
  expect(container.querySelectorAll('dl')).toHaveLength(0)
  expect(screen.getByRole('table')).toBeInTheDocument()
  expect(screen.getAllByText('Chưa có dữ liệu trong câu trả lời')).toHaveLength(2)
  expect(screen.getByText('998.000.000 ₫')).toBeInTheDocument()
  expect(screen.getByText('5 chỗ')).toBeInTheDocument()
  expect(screen.getByLabelText('Lưu ý')).toHaveTextContent('không phải báo giá đại lý')
})
it('preserves code and displays it literally, including HTML and field-like lines', () => {
  const { container } = render(<AnswerContent content={'```html\n<script>alert(1)</script>\nGiá: 123\n```\n\n## Tiếp theo\n> Cần xác nhận theo VIN.'} />)
  expect(container.querySelector('pre')).toHaveTextContent('<script>alert(1)</script>')
  expect(container.querySelector('script')).toBeNull()
  expect(container.querySelector('dl')).toBeNull()
  expect(screen.getByRole('heading', { name: 'Tiếp theo' })).toBeInTheDocument()
})
it('merges duplicate disclaimers while retaining distinct car market qualifications', () => {
  const price = 'Đây là giá tham khảo từ dữ liệu, không phải báo giá đại lý theo thời gian thực.'
  const specs = 'Thông số trong database chủ yếu từ DVM-CAR thị trường Anh; không xác nhận phiên bản kỹ thuật tại Việt Nam.'
  render(<AnswerContent content={`Giá tham khảo của Honda CR-V.\nGiá từ: 998.000.000 VND.\n${price}\nĐược ghi nhận phân phối chính hãng theo dữ liệu đã kiểm tra.\n\nGiá tham khảo của Toyota RAV4.\nGiá từ: Chưa có dữ liệu.\n${price}\nCó mặt qua nhập khẩu; không khẳng định phân phối chính hãng.\n\n${specs}\n\n${specs}\nToyota RAV4: Có mặt qua nhập khẩu; không khẳng định phân phối chính hãng.`} />)
  expect(screen.getAllByLabelText('Lưu ý')).toHaveLength(1)
  expect(screen.getAllByText(price)).toHaveLength(1)
  expect(screen.getAllByText(specs)).toHaveLength(1)
  expect(screen.getAllByText('Toyota RAV4: Có mặt qua nhập khẩu; không khẳng định phân phối chính hãng.')).toHaveLength(1)
  expect(screen.getByLabelText('Lưu ý')).toHaveTextContent('Honda CR-V: Được ghi nhận phân phối chính hãng')
})
it('shows the character limit near capacity', () => {
  render(<ChatComposer value={'a'.repeat(900)} onChange={() => {}} busy={false} onSubmit={() => {}} sendLabel="Gửi" placeholder="Câu hỏi" notice="" />)
  expect(screen.getByText('900/1.000 ký tự')).toBeInTheDocument()
  expect(screen.getByRole('textbox')).toHaveAttribute('maxlength', '1000')
})
it('renders one car card with one price and a formatted source date', () => {
  const { container } = render(<AnswerContent content={'Xe gần giống nhất trong ảnh: **Ford Edge** (độ tương đồng 95.3%).\n\nFord Edge có giá tham khảo từ 1.560.000.000 VND.\n\nGiá tham khảo của Ford Edge.\nGiá từ: 1560000000 VND.\nNgày giá tham khảo: 2022-01-01.\n\nĐây là giá tham khảo từ dữ liệu, không phải báo giá đại lý theo thời gian thực.'} />)
  expect(screen.getAllByText('Ford Edge', { exact: true })).toHaveLength(1)
  expect(screen.getAllByText('1.560.000.000 ₫')).toHaveLength(1)
  expect(screen.getByText('01/01/2022')).toBeInTheDocument()
  expect(screen.getByText('Độ tương đồng 95,3% với ảnh trong catalogue.')).toBeInTheDocument()
  expect(container.querySelectorAll('.assistant-car-result')).toHaveLength(1)
  expect(screen.getAllByRole('heading', { name: 'Giá tham khảo của Ford Edge' })).toHaveLength(1)
})
it('preserves different prices instead of silently discarding a conflict', () => {
  render(<AnswerContent content={'Ford Edge có giá tham khảo từ 1.560.000.000 VND.\n\nGiá tham khảo của Ford Edge.\nGiá từ: 1600000000 VND.'} />)
  expect(screen.getByText('1.560.000.000 ₫ / 1.600.000.000 ₫')).toBeInTheDocument()
})
it('includes the catalogue description of the selected car beside its verified facts', () => {
  render(<AnswerContent content="Ford Edge có giá tham khảo từ 1.560.000.000 VND." contexts={[{ carId: 'edge', displayName: 'Ford Edge', description: 'SUV của Ford với không gian rộng rãi.', presenceSourceId: 'ford-source' }]} />)
  expect(screen.getByText('Mô tả từ catalogue')).toBeInTheDocument()
  expect(screen.getByText('SUV của Ford với không gian rộng rãi.')).toBeInTheDocument()
  expect(screen.getByText('1.560.000.000 ₫')).toBeInTheDocument()
})

it('adds a grounded introduction and feature bullets even for a price question', () => {
  render(<AnswerContent content="Ford Edge có giá tham khảo từ 1.560.000.000 VND." contexts={[{ carId: 'edge', displayName: 'Ford Edge', summary: 'Ford Edge là mẫu SUV 5 chỗ của hãng Ford.', specifications: { 'Kiểu xe': 'SUV', 'Số chỗ': '5 chỗ', 'Hộp số': 'Tự động' } }]} />)
  expect(screen.getByText(/là mẫu SUV 5 chỗ của hãng Ford/)).toBeInTheDocument()
  expect(screen.getAllByRole('listitem')).toHaveLength(3)
  expect(screen.getByRole('heading', { name: 'Đặc điểm xe' })).toBeInTheDocument()
  expect(screen.getByText('Tự động')).toBeInTheDocument()
})

it('shows a warranty condition once when repeated as a paragraph', () => {
  render(<AnswerContent content={'Ford Edge — Điều kiện bảo hành: Xác nhận theo VIN..\n\nXác nhận theo VIN.'} />)
  expect(screen.getAllByText('Xác nhận theo VIN')).toHaveLength(1)
})
