import { it, expect, vi } from 'vitest'
import { readCache, writeCache, clearChatCache, saveCatalog, restoreCatalog } from '../src/features/chat/storage'
it('isolates guest and account caches and clears only the requested owner', () => {
  writeCache('guest', 'composer', 'guest'); writeCache('alice', 'composer', 'alice'); writeCache('bob', 'composer', 'bob')
  expect(readCache('unknown', 'composer')).toBeNull()
  clearChatCache('alice')
  expect(readCache('alice', 'composer')).toBeNull(); expect(readCache('bob', 'composer')).toBe('bob'); expect(readCache('guest', 'composer')).toBe('guest')
})
it('restores catalogue messages but takes order content from the server', () => {
  saveCatalog('alice', 's1', [{ role: 'assistant', content: 'old order' }, { role: 'user', content: 'car question', catalog: true }, { role: 'assistant', content: 'car reply', catalog: true }])
  expect(restoreCatalog('alice', 's1', [{ role: 'assistant', content: 'fresh order' }]).map(m => m.content)).toEqual(['fresh order', 'car question', 'car reply'])
  expect(JSON.stringify(sessionStorage)).not.toContain('old order')
})
it('ignores malformed or outdated cache data', () => {
  sessionStorage.setItem('autowise-chat:v1:alice:local', '{bad')
  expect(restoreCatalog('alice', 'local', [])).toEqual([])
  writeCache('alice', 'local', [{ after: 0, message: { catalog: true, role: 'assistant', content: 'bad contexts', contexts: 'invalid' } }])
  expect(restoreCatalog('alice', 'local', [])).toEqual([])
})
it('works when browser storage is disabled', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('disabled') })
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('disabled') })
  expect(() => writeCache('guest', 'composer', 'hello')).not.toThrow()
  expect(readCache('guest', 'composer')).toBeNull()
})
