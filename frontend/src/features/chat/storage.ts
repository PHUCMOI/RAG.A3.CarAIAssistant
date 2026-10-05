const prefix = 'autowise-chat:v1:'
const key = (owner: string, slot: string) => `${prefix}${encodeURIComponent(owner)}:${slot}`
export function readCache<T>(owner: string, slot: string): T | null {
  try {
    const entry = JSON.parse(sessionStorage.getItem(key(owner, slot)) || 'null')
    return entry?.version === 1 ? entry.data as T : null
  } catch { return null }
}
export function writeCache(owner: string, slot: string, data: unknown) {
  try { sessionStorage.setItem(key(owner, slot), JSON.stringify({ version: 1, data })) } catch { /* Chat works without storage. */ }
}
export function clearChatCache(owner: string) {
  try {
    const ownerPrefix = `${prefix}${encodeURIComponent(owner)}:`
    Object.keys(sessionStorage).filter(k => k.startsWith(ownerPrefix)).forEach(k => sessionStorage.removeItem(k))
  } catch { /* Storage may be disabled. */ }
}
export function clearLegacyChatCache() {
  try { Object.keys(sessionStorage).filter(k => k.startsWith('unified-assistant-') || k === 'assistant-pending-question').forEach(k => sessionStorage.removeItem(k)) } catch { /* optional storage */ }
}
export type CatalogContext = { carId: string; displayName: string; presenceSourceId?: string }
export type CatalogMessage = { role: string; content: string; catalog?: boolean; contexts?: CatalogContext[] }
type SavedEntry<T> = { after: number; message: T }
export function saveCatalog<T extends CatalogMessage>(owner: string, slot: string, messages: T[]) {
  let after = 0
  const entries: SavedEntry<T>[] = []
  for (const message of messages) {
    if (message.catalog) entries.push({ after, message })
    else after++
  }
  writeCache(owner, slot, entries)
}
export function restoreCatalog<T extends CatalogMessage>(owner: string, slot: string, server: T[]): T[] {
  const saved = readCache<SavedEntry<T>[]>(owner, slot)
  if (!Array.isArray(saved)) return server
  const entries = saved.filter(entry => Number.isSafeInteger(entry?.after) && entry.after >= 0 && entry.message?.catalog === true && ['user', 'assistant'].includes(entry.message.role) && typeof entry.message.content === 'string' && (entry.message.contexts == null || Array.isArray(entry.message.contexts) && entry.message.contexts.every(c => typeof c.carId === 'string' && typeof c.displayName === 'string' && (c.presenceSourceId == null || typeof c.presenceSourceId === 'string'))))
  const messages: T[] = []
  for (let index = 0; index <= server.length; index++) {
    messages.push(...entries.filter(entry => Math.min(entry.after, server.length) === index).map(entry => entry.message))
    if (index < server.length) messages.push(server[index])
  }
  return messages
}
