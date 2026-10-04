import { FormEvent, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { apiPost } from '../../shared/api/client'

import { useOrdersSession } from '../../features/orders/Session'
import { UnifiedAssistantChat } from '../../features/orders/OrderAssistantPage'
import { isOrderQuestion } from '../../features/chat/routing'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'

type Context = { carId: string; displayName: string; description: string; presenceSourceId: string }
type Message = { role: 'user' | 'assistant'; content: string; contexts?: Context[] }

function GuestChat() {
  const [params] = useSearchParams(); const [question, setQuestion] = useState(params.get('car') ? `Hãy tư vấn cho tôi về xe ${params.get('car')}` : ''); const [sending, setSending] = useState(false)
  const [messages, setMessages] = useState<Message[]>([{ role: 'assistant', content: 'Xin chào! Hãy cho mình biết ngân sách, số ghế hoặc mẫu xe bạn đang quan tâm.' }])
  async function submit(event: FormEvent) { event.preventDefault(); const text = question.trim(); if (!text || sending) return; setMessages(x => [...x, { role: 'user', content: text }]); setQuestion(''); setSending(true); try { if (isOrderQuestion(text)) { sessionStorage.setItem('assistant-pending-question', text); setMessages(x => [...x, { role: 'assistant', content: 'Bạn cần đăng nhập để tra cứu và xử lý đơn hàng của mình.' }]); return; } const result = await apiPost<{ answer: string; contexts: Context[] }, { question: string } >('/api/chat', { question: text }); setMessages(x => [...x, { role: 'assistant', content: result.answer, contexts: result.contexts }]) } catch { setMessages(x => [...x, { role: 'assistant', content: 'Không kết nối được với API. Vui lòng thử lại.' }]) } finally { setSending(false) } }
  const prompts = ['SUV 5 chỗ dưới 1 tỷ', 'So sánh Honda CR-V và Mazda CX-5', 'Đại lý Toyota tại Hà Nội']
  return <div className="chat-page"><aside className="chat-info"><span className="section-kicker">AutoWise assistant</span><h1>Trợ lý AI của bạn.</h1><p>Tư vấn xe và hỗ trợ đơn hàng trong cùng một trợ lý. Đăng nhập để tra cứu đơn, thanh toán và hồ sơ.</p><div>{prompts.map(x => <button key={x} onClick={() => setQuestion(x)}>{x} →</button>)}</div></aside><section className="chat-workspace"><div className="chat-stream" aria-live="polite">{messages.map((message, index) => <div key={index} className={`chat-message ${message.role}`}><span>{message.role === 'assistant' ? 'A' : 'Bạn'}</span><div><p>{message.content}</p>{message.contexts && <div className="context-cards">{message.contexts.map(c => <Link key={c.carId} to={`/cars/${c.carId}`}><strong>{c.displayName}</strong><small>{c.presenceSourceId}</small></Link>)}</div>}</div></div>)}{sending && <div className="chat-message assistant"><span>A</span><div><p>Đang tìm trong database…</p></div></div>}</div><Link to="/login?returnTo=%2Fchat">Đăng nhập để tra cứu đơn hàng →</Link><form className="chat-input" onSubmit={submit}><textarea rows={2} value={question} onChange={e => setQuestion(e.target.value)} placeholder="Ví dụ: Tôi cần xe 7 chỗ dưới 1,2 tỷ…" /><button disabled={sending || !question.trim()}>Gửi →</button></form></section></div>
}

export default function ChatPage() {
  const { user, loading } = useOrdersSession();
  if (loading) return <LoadingSkeleton />;
  return user?.role === "Customer" ? <UnifiedAssistantChat /> : <GuestChat />;
}
