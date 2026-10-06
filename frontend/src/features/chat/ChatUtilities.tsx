import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { CatalogContext } from './storage'

export function composerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>, busy: boolean) {
  if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing && event.keyCode !== 229) {
    event.preventDefault()
    if (!busy) event.currentTarget.form?.requestSubmit()
  }
}
export function ContextLinks({ contexts }: { contexts?: CatalogContext[] }) {
  return contexts?.length ? <div className="context-cards">{contexts.map(context => <div className="chat-context" key={context.carId}><Link to={`/cars/${encodeURIComponent(context.carId)}`}>{context.displayName} →</Link>{context.presenceSourceId && <Link className="text-link" to={`/sources/${encodeURIComponent(context.presenceSourceId)}`}>Xem nguồn tham khảo</Link>}</div>)}</div> : null
}
export function ChatStream({ children, revision, className }: { children: ReactNode; revision: unknown; className: string }) {
  const container = useRef<HTMLDivElement>(null)
  const atBottom = useRef(true)
  const [unread, setUnread] = useState(false)
  function scrollToEnd() {
    const element = container.current
    if (element) element.scrollTop = element.scrollHeight
    atBottom.current = true; setUnread(false)
  }
  useEffect(() => {
    if (atBottom.current) scrollToEnd()
    else setUnread(true)
  }, [revision])
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !container.current) return
    const observer = new ResizeObserver(() => { if (atBottom.current) scrollToEnd() })
    observer.observe(container.current)
    return () => observer.disconnect()
  }, [])
  return <div className="assistant-thread-container"><div ref={container} className={className} aria-live="polite" role="log" aria-label="Tin nhắn hội thoại" onScroll={() => {
    const element = container.current!
    atBottom.current = element.scrollHeight - element.scrollTop - element.clientHeight < 60
    if (atBottom.current) setUnread(false)
  }}>{children}</div>{unread && <button className="mini-button assistant-new-messages" onClick={scrollToEnd}>Tới tin nhắn mới ↓</button>}</div>
}
