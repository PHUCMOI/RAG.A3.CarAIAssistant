// Store the Blob in IndexedDB: a 10 MB photo does not fit in sessionStorage.
// A per-tab key avoids passing one tab's attachment to another signed-in session.
type PendingTurn = { text: string; file: Blob | null; name?: string; expires: number }
const database = 'autowise-pending-turns'
function tabKey() {
  let key = sessionStorage.getItem('autowise-pending-turn-key')
  if (!key) { key = crypto.randomUUID(); sessionStorage.setItem('autowise-pending-turn-key', key) }
  return key
}
async function transact<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(database, 1)
    request.onupgradeneeded = () => request.result.createObjectStore('turns')
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction('turns', mode)
      const request = action(tx.objectStore('turns'))
      tx.oncomplete = () => resolve(request.result)
      tx.onerror = () => reject(tx.error)
      tx.onabort = () => reject(tx.error)
    })
  } finally { db.close() }
}
export async function savePendingTurn(text: string, file: File | null) {
  const key = tabKey()
  // Remove expired records from abandoned tabs on each save.
  await transact('readwrite', store => {
    const cursor = store.openCursor()
    cursor.onsuccess = () => { const row = cursor.result; if (row) { if (row.value.expires < Date.now()) row.delete(); row.continue() } }
    return store.put({ text, file, name: file?.name, expires: Date.now() + 30 * 60_000 } satisfies PendingTurn, key)
  })
}
export async function loadPendingTurn(): Promise<{ text: string; file: File | null } | null> {
  if (typeof indexedDB === 'undefined') return null
  const key = sessionStorage.getItem('autowise-pending-turn-key')
  if (!key) return null
  const turn = await transact<PendingTurn | undefined>('readonly', store => store.get(key))
  if (!turn) return null
  if (turn.expires < Date.now()) { await clearPendingTurn(); return null }
  return { text: turn.text, file: turn.file ? new File([turn.file], turn.name || 'car-image', { type: turn.file.type }) : null }
}
export async function clearPendingTurn() {
  const key = sessionStorage.getItem('autowise-pending-turn-key')
  // Synchronously make an accepted/discarded turn unreachable across a reload.
  sessionStorage.removeItem('autowise-pending-turn-key')
  if (!key || typeof indexedDB === 'undefined') return
  await transact('readwrite', store => store.delete(key))
}
