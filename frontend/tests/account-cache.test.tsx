import { it, expect, vi } from 'vitest'
import { act, render, screen, fireEvent, waitFor } from '@testing-library/react'
import { OrdersSession, useOrdersSession } from '../src/features/orders/Session'
import { request } from '../src/features/orders/api'
import { readCache, writeCache } from '../src/features/chat/storage'
vi.mock('../src/features/orders/api', async importOriginal => ({ ...await importOriginal<object>(), request: vi.fn() }))
function Identity() { const { user, refresh } = useOrdersSession(); return <><span>{user?.id || 'guest'}</span><button onClick={() => void refresh()}>Refresh identity</button></> }
it('clears the previous account cache when the authenticated user changes or expires', async () => {
  vi.mocked(request).mockResolvedValueOnce({ id: 'alice', role: 'Customer' }).mockResolvedValueOnce({ id: 'bob', role: 'Customer' })
  render(<OrdersSession><Identity /></OrdersSession>)
  await screen.findByText('alice'); writeCache('alice', 'composer', 'private question')
  fireEvent.click(screen.getByRole('button', { name: 'Refresh identity' }))
  await screen.findByText('bob'); expect(readCache('alice', 'composer')).toBeNull()
  writeCache('bob', 'composer', 'another question')
  act(() => window.dispatchEvent(new Event('account-session-expired')))
  await waitFor(() => expect(screen.getByText('guest')).toBeInTheDocument())
  expect(readCache('bob', 'composer')).toBeNull()
})
