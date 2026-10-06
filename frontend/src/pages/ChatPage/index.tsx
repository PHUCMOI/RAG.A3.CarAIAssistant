import { useEffect, useRef, useState, type FormEvent, type ChangeEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiPost, apiPostForm } from '../../shared/api/client'
import { useOrdersSession } from '../../features/orders/Session'
import { UnifiedAssistantChat } from '../../features/orders/OrderAssistantPage'
import { isOrderQuestion } from '../../features/chat/routing'
import { useCarQuestion } from '../../features/chat/useCarQuestion'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'
import { ChatStream, composerKeyDown, ContextLinks } from '../../features/chat/ChatUtilities'
import {
  clearChatCache,
  readCache,
  restoreCatalog,
  saveCatalog,
  writeCache,
  type CatalogMessage,
  type CatalogContext,
  type IdentifiedCarItem,
} from '../../features/chat/storage'

const welcome: CatalogMessage = {
  role: 'assistant',
  catalog: true,
  content: 'Xin chào! Hãy cho mình biết ngân sách, số ghế hoặc tải lên ảnh xe bạn muốn nhận diện và tư vấn.',
}

export function GuestChat() {
  const carQuestion = useCarQuestion()
  const [question, setQuestion] = useState(() => {
    const value = readCache<unknown>('guest', 'composer')
    return typeof value === 'string' ? value : ''
  })
  const [sending, setSending] = useState(false)
  const locked = useRef(false)
  const [error, setError] = useState('')
  const [failed, setFailed] = useState('')
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [messages, setMessages] = useState<CatalogMessage[]>(() => {
    const saved = restoreCatalog<CatalogMessage>('guest', 'messages', [])
    return saved.length ? saved : [welcome]
  })

  useEffect(() => {
    if (carQuestion) setQuestion((current) => current || carQuestion)
  }, [carQuestion])
  useEffect(() => saveCatalog('guest', 'messages', messages), [messages])
  useEffect(() => writeCache('guest', 'composer', question), [question])

  function handleFileChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn tập tin hình ảnh (JPG, PNG, WebP).')
      return
    }
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = () => {
      setImagePreview(reader.result as string)
    }
    reader.readAsDataURL(file)
    setError('')
  }

  function clearAttachment() {
    setSelectedFile(null)
    setImagePreview(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  async function send(value: string) {
    const text = value.trim()
    if ((!text && !selectedFile) || locked.current) return
    locked.current = true
    setSending(true)
    setError('')

    const fileToSend = selectedFile
    const previewToSend = imagePreview

    try {
      if (fileToSend) {
        const formData = new FormData()
        formData.append('file', fileToSend)
        if (text) formData.append('message', text)

        setMessages((current) => [
          ...current,
          {
            role: 'user',
            content: text || 'Nhận diện mẫu xe từ hình ảnh này',
            imageUrl: previewToSend || undefined,
            catalog: true,
          },
        ])
        clearAttachment()

        const result = await apiPostForm<{
          answer: string
          identified_cars?: IdentifiedCarItem[]
          contexts?: Array<{ car_id: string; text?: string; source_name?: string }>
          uncertain?: boolean
          latency_ms?: number
        }>('/api/image-service/chat', formData)

        const carContexts: CatalogContext[] = (result.identified_cars || []).map((c) => ({
          carId: c.car_id,
          displayName: `${c.brand || ''} ${c.model || ''} (${Math.round((c.similarity || 0) * 100)}% khớp)`.trim() || c.car_id,
          presenceSourceId: 'image_retrieval_clip',
        }))

        setMessages((current) => [
          ...current,
          {
            role: 'assistant',
            content: result.answer,
            contexts: carContexts,
            identifiedCars: result.identified_cars,
            uncertain: result.uncertain,
            catalog: true,
          },
        ])
      } else if (isOrderQuestion(text)) {
        writeCache('guest', 'pending-question', text)
        setMessages((current) => [
          ...current,
          { role: 'user', content: text, catalog: true },
          { role: 'assistant', catalog: true, content: 'Bạn cần đăng nhập để tra cứu và xử lý đơn hàng của mình.' },
        ])
      } else {
        const result = await apiPost<{ answer: string; contexts: CatalogContext[] }, { question: string }>('/api/chat', { question: text })
        setMessages((current) => [
          ...current,
          { role: 'user', content: text, catalog: true },
          { role: 'assistant', content: result.answer, contexts: result.contexts, catalog: true },
        ])
      }
      setQuestion('')
      setFailed('')
    } catch {
      setFailed(text)
      setError('Không gửi được câu hỏi hoặc dịch vụ đang bận. Vui lòng thử lại.')
    } finally {
      locked.current = false
      setSending(false)
    }
  }

  function submit(event: FormEvent) {
    event.preventDefault()
    void send(question)
  }

  const prompts = [
    'SUV 5 chỗ dưới 1 tỷ',
    'So sánh Honda CR-V và Mazda CX-5',
    'Đại lý Toyota tại Hà Nội',
  ]

  return (
    <div className="chat-page">
      <aside className="chat-info">
        <span className="section-kicker">AutoWise assistant</span>
        <h1>Trợ lý AI của bạn.</h1>
        <p>
          Tư vấn xe đa phương thức (văn bản & hình ảnh) và hỗ trợ đơn hàng. Đăng nhập để tra cứu đơn, thanh toán và hồ sơ.
        </p>
        <div>
          {prompts.map((prompt) => (
            <button disabled={sending} key={prompt} onClick={() => setQuestion(prompt)}>
              {prompt} →
            </button>
          ))}
        </div>
        <button
          className="mini-button"
          disabled={sending}
          onClick={() => {
            clearChatCache('guest')
            clearAttachment()
            setMessages([welcome])
            setQuestion('')
            setFailed('')
            setError('')
          }}
        >
          + Hội thoại mới
        </button>
        <p>Hỗ trợ nhận diện xe từ ảnh bằng CLIP và tư vấn thông số bằng RAG.</p>
      </aside>

      <section className="chat-workspace">
        <ChatStream className="chat-stream" revision={`${messages.length}:${sending}`}>
          {messages.map((message, index) => (
            <div key={index} className={`chat-message ${message.role}`}>
              <span>{message.role === 'assistant' ? 'A' : 'Bạn'}</span>
              <div>
                {message.imageUrl && (
                  <div className="chat-image-preview-bubble">
                    <img src={message.imageUrl} alt="Ảnh người dùng gửi" />
                  </div>
                )}
                <p>{message.content}</p>
                {message.uncertain && (
                  <div className="chat-uncertain-warning">
                    ⚠️ <em>Độ tin cậy nhận diện thấp hoặc góc chụp khó.</em>
                  </div>
                )}
                <ContextLinks contexts={message.contexts} />
              </div>
            </div>
          ))}
          {sending && <p role="status">Đang xử lý câu hỏi & nhận diện ảnh…</p>}
        </ChatStream>

        {error && (
          <div role="alert">
            <p>{error}</p>
            <button className="mini-button" disabled={sending} onClick={() => void send(failed)}>
              Gửi lại
            </button>
          </div>
        )}

        <Link to="/login?returnTo=%2Fchat">Đăng nhập để tra cứu đơn hàng →</Link>

        {selectedFile && (
          <div className="chat-attachment-bar">
            {imagePreview && <img src={imagePreview} alt="Preview" className="chat-attachment-thumb" />}
            <span className="chat-attachment-name">📷 {selectedFile.name}</span>
            <button type="button" className="chat-attachment-remove" onClick={clearAttachment} title="Xóa ảnh">
              ✕
            </button>
          </div>
        )}

        <form className="chat-input" onSubmit={submit}>
          <input
            type="file"
            ref={fileInputRef}
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handleFileChange}
          />
          <button
            type="button"
            className="chat-attach-btn"
            title="Đính kèm ảnh xe để AI nhận diện"
            disabled={sending}
            onClick={() => fileInputRef.current?.click()}
          >
            📷
          </button>
          <textarea
            aria-label="Câu hỏi"
            rows={2}
            maxLength={1000}
            value={question}
            disabled={sending}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={(e) => composerKeyDown(e, sending)}
            placeholder={
              selectedFile
                ? 'Nhập thêm câu hỏi về chiếc xe trong ảnh (tùy chọn)...'
                : 'Ví dụ: Tôi cần xe 7 chỗ dưới 1,2 tỷ hoặc bấm 📷 gửi ảnh xe...'
            }
          />
          <button disabled={sending || (!question.trim() && !selectedFile)}>Gửi →</button>
        </form>
      </section>
    </div>
  )
}

export default function ChatPage() {
  const { user, loading, error, refresh } = useOrdersSession()
  if (loading) return <LoadingSkeleton />
  return <>{error && <div className="page" role="status">Không kết nối được tài khoản. Bạn vẫn có thể tư vấn xe. <button className="mini-button" onClick={() => void refresh()}>Thử lại dịch vụ tài khoản</button></div>}{user?.role === 'Customer' ? <UnifiedAssistantChat key={user.id} /> : <GuestChat />}</>
}
