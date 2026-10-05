import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiPost } from '../../shared/api/client'
import { useOrdersSession } from '../../features/orders/Session'
import { UnifiedAssistantChat } from '../../features/orders/OrderAssistantPage'
import { isOrderQuestion } from '../../features/chat/routing'
import { useCarQuestion } from '../../features/chat/useCarQuestion'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ChatStream, composerKeyDown, ContextLinks } from '../../features/chat/ChatUtilities'
import { clearChatCache, readCache, restoreCatalog, saveCatalog, writeCache, type CatalogMessage, type CatalogContext } from '../../features/chat/storage'

const welcome: CatalogMessage = { role: 'assistant', catalog: true, content: 'Xin chào! Hãy cho mình biết ngân sách, số ghế hoặc mẫu xe bạn đang quan tâm.' }
export function GuestChat() {
  const carQuestion = useCarQuestion()
  const [question, setQuestion] = useState(() => { const value = readCache<unknown>('guest', 'composer'); return typeof value === 'string' ? value : '' })
  const [sending, setSending] = useState(false)
  const locked = useRef(false)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState('')
  const [messages, setMessages] = useState<CatalogMessage[]>(() => { const saved = restoreCatalog<CatalogMessage>('guest', 'messages', []); return saved.length ? saved : [welcome] })
  useEffect(() => { if (carQuestion) setQuestion(current => current || carQuestion) }, [carQuestion])
  useEffect(() => saveCatalog('guest', 'messages', messages), [messages])
  useEffect(() => writeCache('guest', 'composer', question), [question])
  async function send(value: string) {
    const text = value.trim()
    if (!text || locked.current) return
    locked.current = true; setSending(true); setError('')
    try {
      if (isOrderQuestion(text)) {
        writeCache('guest', 'pending-question', text)
        setMessages(current => [...current, { role: 'user', content: text, catalog: true }, { role: 'assistant', catalog: true, content: 'Bạn cần đăng nhập để tra cứu và xử lý đơn hàng của mình.' }])
      } else {
        const result = await apiPost<{ answer: string; contexts: CatalogContext[] }, { question: string }>('/api/chat', { question: text })
        setMessages(current => [...current, { role: 'user', content: text, catalog: true }, { role: 'assistant', content: result.answer, contexts: result.contexts, catalog: true }])
      }
      setQuestion(''); setFailed('')
    } catch { setFailed(text); setError('Không gửi được câu hỏi. Nội dung vẫn được giữ để bạn thử lại.') }
    finally { locked.current = false; setSending(false) }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(question) }
  const prompts = ['SUV 5 chỗ dưới 1 tỷ', 'So sánh Honda CR-V và Mazda CX-5', 'Đại lý Toyota tại Hà Nội']
  return <div className="chat-page"><aside className="chat-info"><span className="section-kicker">AutoWise assistant</span><h1>Trợ lý AI của bạn.</h1><p>Tư vấn xe và hỗ trợ đơn hàng trong cùng một trợ lý. Đăng nhập để tra cứu đơn, thanh toán và hồ sơ.</p><div>{prompts.map(prompt => <button disabled={sending} key={prompt} onClick={() => setQuestion(prompt)}>{prompt} →</button>)}</div><button className="mini-button" disabled={sending} onClick={() => { clearChatCache('guest'); setMessages([welcome]); setQuestion(''); setFailed(''); setError('') }}>+ Hội thoại mới</button><p>Lịch sử tư vấn lưu tạm trong tab này.</p></aside>
    <section className="chat-workspace"><ChatStream className="chat-stream" revision={`${messages.length}:${sending}`}>{messages.map((message, index) => <div key={index} className={`chat-message ${message.role}`}><span>{message.role === 'assistant' ? 'A' : 'Bạn'}</span><div><p>{message.content}</p><ContextLinks contexts={message.contexts} /></div></div>)}{sending && <p role="status">Đang xử lý câu hỏi…</p>}</ChatStream>
      {error && <div role="alert"><p>{error}</p><button className="mini-button" disabled={sending} onClick={() => void send(failed)}>Gửi lại câu hỏi</button></div>}
      <Link to="/login?returnTo=%2Fchat">Đăng nhập để tra cứu đơn hàng →</Link><form className="chat-input" onSubmit={submit}><textarea aria-label="Câu hỏi" rows={2} maxLength={1000} value={question} disabled={sending} onChange={e => setQuestion(e.target.value)} onKeyDown={e => composerKeyDown(e, sending)} placeholder="Ví dụ: Tôi cần xe 7 chỗ dưới 1,2 tỷ…" /><button disabled={sending || !question.trim()}>Gửi →</button></form>
    </section></div>
}

export default function ChatPage() {
  const { user, loading, error, refresh } = useOrdersSession()
  if (loading) return <LoadingSkeleton />
  return <>{error && <div className="page" role="status">Không kết nối được tài khoản. Bạn vẫn có thể tư vấn xe. <button className="mini-button" onClick={() => void refresh()}>Thử lại dịch vụ tài khoản</button></div>}{user?.role === 'Customer' ? <UnifiedAssistantChat key={user.id} /> : <GuestChat />}</>
}
