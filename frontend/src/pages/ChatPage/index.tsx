import { useEffect, useRef, useState, type ChangeEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { ImageIcon } from '../../shared/components/ImageIcon'
import { ChatLayout, ChatSidebar, ChatWelcome, ThinkingMessage } from '../../features/chat/ChatLayout'
import { apiPost, apiPostForm } from '../../shared/api/client'
import { useOrdersSession } from '../../features/orders/Session'
import { UnifiedAssistantChat } from '../../features/orders/OrderAssistantPage'
import { isOrderQuestion } from '../../features/chat/routing'
import { useCarQuestion } from '../../features/chat/useCarQuestion'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { AnswerContent, CopyAnswer, FailedQuestion, ChatComposer } from '../../features/chat/ChatContent'
import { ChatStream, ContextLinks } from '../../features/chat/ChatUtilities'
import { clearChatCache, readCache, restoreCatalog, saveCatalog, writeCache, type CatalogMessage, type CatalogContext, type IdentifiedCarItem } from '../../features/chat/storage'

const welcome: CatalogMessage = { role: 'assistant', catalog: true, content: 'Xin chào! Hãy cho mình biết ngân sách, số ghế hoặc mẫu xe bạn đang quan tâm.' }
export function GuestChat() {
  const carQuestion = useCarQuestion()
  const [question, setQuestion] = useState(() => { const value = readCache<unknown>('guest', 'composer'); return typeof value === 'string' ? value : '' })
  const [sending, setSending] = useState(false)
  const locked = useRef(false)
  const input = useRef<HTMLTextAreaElement>(null)
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)
  const previewVersion = useRef(0)
  const failedRequest = useRef<{ text: string; file: File | null; preview: string | null } | null>(null)
  function clearAttachment() { previewVersion.current++; setSelectedFile(null); setImagePreview(null); if (fileInput.current) fileInput.current.value = '' }
  function selectImage(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (!file) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) { setError('Chọn ảnh JPEG, PNG hoặc WebP.'); return }
    const version = ++previewVersion.current
    setSelectedFile(file); setImagePreview(null); setError(''); event.target.value = ''
    const reader = new FileReader()
    reader.onload = () => { if (version === previewVersion.current) setImagePreview(String(reader.result)) }
    reader.readAsDataURL(file)
  }
  const [pendingText, setPendingText] = useState('')
  const [error, setError] = useState('')
  const [failed, setFailed] = useState('')
  const [messages, setMessages] = useState<CatalogMessage[]>(() => { const saved = restoreCatalog<CatalogMessage>('guest', 'messages', []); return saved.length ? saved : [welcome] })
  useEffect(() => { if (carQuestion) setQuestion(current => current || carQuestion) }, [carQuestion])
  useEffect(() => saveCatalog('guest', 'messages', messages), [messages])
  useEffect(() => writeCache('guest', 'composer', question), [question])
  async function send(value: string, retry = false) {
    const request = retry ? failedRequest.current : null
    const text = request ? request.text : value.trim()
    const file = request ? request.file : selectedFile
    const preview = request ? request.preview : imagePreview
    const draftAtStart = input.current?.value || ''
    if ((!text && !file) || locked.current) return
    locked.current = true; setSending(true); setError(''); setFailed(''); setPendingText(text || 'Nhận diện xe từ hình ảnh')
    try {
      if (file) {
        const form = new FormData(); form.append('file', file); if (text) form.append('message', text)
        const result = await apiPostForm<{ answer: string; identified_cars?: IdentifiedCarItem[]; uncertain?: boolean }>('/api/image-service/chat', form)
        const contexts = (result.identified_cars || []).map(car => ({ carId: car.car_id, displayName: [car.brand, car.model].filter(Boolean).join(' ') || car.car_id }))
        setMessages(current => [...current, { role: 'user', content: text, imageUrl: preview || undefined, catalog: true }, { role: 'assistant', content: result.answer, contexts, identifiedCars: result.identified_cars, uncertain: result.uncertain, catalog: true }])
        if (selectedFile === file) clearAttachment()
      } else if (isOrderQuestion(text)) {
        writeCache('guest', 'pending-question', text)
        setMessages(current => [...current, { role: 'user', content: text, catalog: true }, { role: 'assistant', catalog: true, content: 'Bạn cần đăng nhập để tra cứu và xử lý đơn hàng của mình.' }])
      } else {
        const result = await apiPost<{ answer: string; contexts: CatalogContext[] }, { question: string }>('/api/chat', { question: text })
        setMessages(current => [...current, { role: 'user', content: text, catalog: true }, { role: 'assistant', content: result.answer, contexts: result.contexts, catalog: true }])
      }
      setQuestion(current => current === draftAtStart && draftAtStart.trim() === text ? '' : current); setFailed(''); failedRequest.current = null
    } catch { failedRequest.current = { text, file, preview }; setFailed(text || 'Nhận diện xe từ hình ảnh'); setError('Không gửi được câu hỏi. Nội dung vẫn được giữ để bạn thử lại.') }
    finally { locked.current = false; setSending(false); setPendingText(''); input.current?.focus() }
  }
  function submit(event: FormEvent) { event.preventDefault(); void send(question) }
  const empty = messages.length === 1 && messages[0].content === welcome.content
  function choose(value: string) { setQuestion(value); input.current?.focus() }
  return <ChatLayout sidebar={<ChatSidebar busy={sending} onNew={() => { clearChatCache('guest'); clearAttachment(); failedRequest.current = null; setMessages([welcome]); setQuestion(''); setFailed(''); setError(''); input.current?.focus() }}>{!empty && <div className="assistant-local-session">Hội thoại hiện tại</div>}</ChatSidebar>}>
    <ChatStream className="assistant-thread" revision={`${messages.length}:${sending}:${failed}`}>
      {empty && !sending && !failed ? <ChatWelcome busy={sending} onPrompt={choose} /> : messages.filter((_, index) => index !== 0 || !empty).map((message, index) => <article key={index} className={`order-chat-message ${message.role}`}><strong>{message.role === 'assistant' ? 'AutoWise' : 'Bạn'}</strong>{message.role === 'assistant' ? <AnswerContent content={message.content} /> : <p>{message.content || (message.imageUrl ? 'Nhận diện xe trong ảnh' : '')}</p>}{message.imageUrl && <img className="chat-image-preview-bubble" src={message.imageUrl} alt="Ảnh xe đã gửi" />}{message.uncertain && <p className="chat-uncertain-warning">Kết quả nhận diện chưa chắc chắn. Hãy kiểm tra thông tin xe.</p>}<ContextLinks contexts={message.contexts} />{message.role === 'assistant' && <CopyAnswer content={message.content} />}</article>)}
      {sending && <ThinkingMessage question={pendingText} />}{failed && !sending && <FailedQuestion content={failed} error={error} busy={sending} onRetry={() => void send(failed, true)} />}
    </ChatStream>
    <div className="assistant-composer-area">
      <p className="assistant-login"><Link to="/login?returnTo=%2Fchat">Đăng nhập để tra cứu đơn hàng →</Link></p>
      <ChatComposer canSend={!!selectedFile} tools={<button type="button" className="chat-attach-btn" disabled={sending} onClick={() => fileInput.current?.click()} aria-label="Đính kèm ảnh xe" title="Đính kèm ảnh xe"><ImageIcon /></button>} attachment={<div className="assistant-attachments">
        <input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={selectImage} />
        {selectedFile && <div className="chat-attachment-bar">{imagePreview && <img className="chat-attachment-thumb" src={imagePreview} alt="Ảnh xe đính kèm" />}<div className="chat-attachment-info"><span className="chat-attachment-name">{selectedFile.name}</span><small>{sending ? 'Đang nhận diện xe…' : 'Ảnh xe · Có thể gửi kèm câu hỏi'}</small></div><button type="button" className="chat-attachment-remove" disabled={sending} onClick={clearAttachment} aria-label="Bỏ ảnh đính kèm">×</button></div>}
        {error && !failed && <p className="assistant-attachment-error" role="alert">{error}</p>}
      </div>} inputRef={input} value={question} onChange={setQuestion} busy={sending} onSubmit={submit} sendLabel="Gửi →" placeholder="Hỏi AutoWise về chiếc xe bạn quan tâm…" notice="Kiểm tra thông tin quan trọng với đại lý." />
    </div>
  </ChatLayout>
}

export default function ChatPage() {
  const { user, loading, error, refresh } = useOrdersSession()
  if (loading) return <LoadingSkeleton />
  return <div className="chat-route">{error && <div className="assistant-service-error" role="status">Không kết nối được tài khoản. Bạn vẫn có thể tư vấn xe. <button className="mini-button" onClick={() => void refresh()}>Thử lại dịch vụ tài khoản</button></div>}{user?.role === 'Customer' ? <UnifiedAssistantChat key={user.id} /> : <GuestChat />}</div>
}
