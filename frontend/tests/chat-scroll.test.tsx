import { it, expect } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { ChatStream } from '../src/features/chat/ChatUtilities'
it('keeps the reading position and offers a jump when new messages arrive', () => {
  const view = render(<ChatStream revision={1} className="stream">First message</ChatStream>)
  const stream = screen.getByRole('log')
  Object.defineProperties(stream, { scrollHeight: { value: 1000, configurable: true }, clientHeight: { value: 200, configurable: true } })
  stream.scrollTop = 100; fireEvent.scroll(stream)
  view.rerender(<ChatStream revision={2} className="stream">New message</ChatStream>)
  expect(stream.scrollTop).toBe(100)
  fireEvent.click(screen.getByRole('button', { name: 'Tới tin nhắn mới ↓' }))
  expect(stream.scrollTop).toBe(1000)
  expect(screen.queryByRole('button')).not.toBeInTheDocument()
})
