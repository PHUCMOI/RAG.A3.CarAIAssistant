import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ChatLayout, ChatSidebar, ChatWelcome, ThinkingMessage } from '../../features/chat/ChatLayout'
import { apiPost } from '../../shared/api/client'
import { useOrdersSession } from '../../features/orders/Session'
import { UnifiedAssistantChat } from '../../features/orders/OrderAssistantPage'
import { isOrderQuestion } from '../../features/chat/routing'
import { useCarQuestion } from '../../features/chat/useCarQuestion'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { AnswerContent, CopyAnswer, FailedQuestion, ChatComposer } from '../../features/chat/ChatContent'
import { ChatStream, ContextLinks } from '../../features/chat/ChatUtilities'
import { clearChatCache, readCache, restoreCatalog, saveCatalog, writeCache, type CatalogMessage, type CatalogContext } from '../../features/chat/storage'

const welcome: CatalogMessage = { role: 'assistant', catalog: true, content: 'Xin chào! Hãy cho mình biết ngân sách, số ghế hoặc mẫu xe bạn đang quan tâm.' }
export function GuestChat() {
  const carQuestion = useCarQuestion()
  const [question, setQuestion] = useState(() => { const value = readCache<unknown>('guest', 'composer'); return typeof value === 'string' ? value : '' })
  const [sending, setSending] = useState(false)
  const locked = useRef(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const [pendingText, setPendingText] = useState('')
  const [error, setError] = useState('')
  const [failed, setFailed] = useState('')
  const [messages, setMessages] = useState<CatalogMessage[]>(() => { const saved = restoreCatalog<CatalogMessage>('guest', 'messages', []); return saved.length ? saved : [welcome] })
  useEffect(() => { if (carQuestion) setQuestion(current => current || carQuestion) }, [carQuestion])
  useEffect(() => saveCatalog('guest', 'messages', messages), [messages])
  useEffect(() => writeCache('guest', 'composer', question), [question])
  async function send(value: string) {
    const text = value.trim()
    const draftAtStart = input.current?.value || ''
    if (!text || locked.current) return
    locked.current = true; setSending(true); setError(''); setFailed(''); setPendingText(text)
    try {
      if (isOrderQuestion(text)) {
        writeCache('guest', 'pending-question', text)
        setMessages(current => [...current, { role: 'user', content: text, catalog: true }, { role: 'assistant', catalog: true, content: 'Bạn cần đăng nhập để tra cứu và xử lý đơn hàng của mình.' }])
      } else {
        const result = await apiPost<{ answer: string; contexts: CatalogContext[] }, { question: string }>('/api/chat', { question: text })
        setMessages(current => [...current, { role: 'user', content: text, catalog: true }, { role: 'assistant', content: result.answer, contexts: result.contexts, catalog: true }])
      }
      setQuestion(current => current === draftAtStart && draftAtStart.trim() === text ? '' : current); setFailed('')
    } catch { setFailed(text); setError('Không gửi được câu hỏi. Nội dung vẫn được giữ để bạn thử lại.') }
    finally { locked.current = false; setSending(false); setPendingText(''); input.current?.focus() }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(question) }
  const empty = messages.length === 1 && messages[0].content === welcome.content
  function choose(value: string) { setQuestion(value); input.current?.focus() }
  return <ChatLayout sidebar={<ChatSidebar busy={sending} onNew={() => { clearChatCache('guest'); setMessages([welcome]); setQuestion(''); setFailed(''); setError(''); input.current?.focus() }}>{!empty && <div className="assistant-local-session">Hội thoại hiện tại</div>}</ChatSidebar>}>
    <ChatStream className="assistant-thread" revision={`${messages.length}:${sending}:${failed}`}>
      {empty && !sending && !failed ? <ChatWelcome busy={sending} onPrompt={choose} /> : messages.filter((_, index) => index !== 0 || !empty).map((message, index) => <article key={index} className={`order-chat-message ${message.role}`}><strong>{message.role === 'assistant' ? 'AutoWise' : 'Bạn'}</strong>{message.role === 'assistant' ? <AnswerContent content={message.content} /> : <p>{message.content}</p>}<ContextLinks contexts={message.contexts} />{message.role === 'assistant' && <CopyAnswer content={message.content} />}</article>)}
      {sending && <ThinkingMessage question={pendingText} />}{failed && !sending && <FailedQuestion content={failed} error={error} busy={sending} onRetry={() => void send(failed)} />}
    </ChatStream>
    <div className="assistant-composer-area">
      <p className="assistant-login"><Link to="/login?returnTo=%2Fchat">Đăng nhập để tra cứu đơn hàng →</Link></p>
      <ChatComposer inputRef={input} value={question} onChange={setQuestion} busy={sending} onSubmit={submit} sendLabel="Gửi →" placeholder="Hỏi AutoWise về chiếc xe bạn quan tâm…" notice="Kiểm tra thông tin quan trọng với đại lý." />
    </div>
  </ChatLayout>
}

export default function ChatPage() {
  const { user, loading, error, refresh } = useOrdersSession()
  if (loading) return <LoadingSkeleton />
  return <div className="chat-route">{error && <div className="assistant-service-error" role="status">Không kết nối được tài khoản. Bạn vẫn có thể tư vấn xe. <button className="mini-button" onClick={() => void refresh()}>Thử lại dịch vụ tài khoản</button></div>}{user?.role === 'Customer' ? <UnifiedAssistantChat key={user.id} /> : <GuestChat />}</div>
}
