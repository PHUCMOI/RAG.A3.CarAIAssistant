type Item = { id: string; updatedAt: string }
export function ChatHistory({ items, currentId, currentTitle, busy, onOpen }: { items: Item[]; currentId?: string; currentTitle?: string; busy: boolean; onOpen: (id: string) => void }) {
  const today = new Date(); today.setHours(0, 0, 0, 0)
  const yesterday = new Date(today); yesterday.setDate(yesterday.getDate() - 1)
  const groups = ['Hôm nay', 'Hôm qua', 'Trước đó'].map(label => ({ label, items: [] as Item[] }))
  for (const item of [...items].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))) {
    const time = Date.parse(item.updatedAt)
    groups[time >= today.getTime() ? 0 : time >= yesterday.getTime() ? 1 : 2].items.push(item)
  }
  return <>{groups.filter(group => group.items.length).map(group => <div className="assistant-history-group" key={group.label}><h3>{group.label}</h3>{group.items.map(item => <button className="order-chat-session" aria-pressed={currentId === item.id} data-session-id={item.id} data-close-history key={item.id} disabled={busy} onClick={() => onOpen(item.id)}><strong>{item.id === currentId && currentTitle ? currentTitle : 'Tra cứu đơn hàng'}</strong><small>{new Date(item.updatedAt).toLocaleString('vi-VN')}</small></button>)}</div>)}</>
}
