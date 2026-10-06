import { Fragment, useEffect, useRef, useState, type FormEvent, type RefObject } from 'react'
import { composerKeyDown } from './ChatUtilities'

function inline(value: string) {
  return value.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : <Fragment key={index}>{part}</Fragment>)
}

// Render a small, safe subset of Markdown. HTML remains text; no raw HTML or arbitrary links.
export function AnswerContent({ content }: { content: string }) {
  const lines = content.replace(/\r\n/g, '\n').split('\n')
  const blocks = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
      const cells = (text: string) => text.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim())
      const headers = cells(line); const rows: string[][] = []; i++
      while (lines[i + 1]?.includes('|') && lines[i + 1].trim()) rows.push(cells(lines[++i]))
      blocks.push(<div className="assistant-table" key={i}><table><thead><tr>{headers.map((cell, index) => <th key={index} scope="col">{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{headers.map((_, column) => <td key={column}>{inline(row[column] || '')}</td>)}</tr>)}</tbody></table></div>)
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h3 key={i}>{inline(line.replace(/^#{1,6}\s+/, ''))}</h3>)
    } else if (/^\s*([-*+] |\d+[.)] )/.test(line)) {
      const ordered = /^\s*\d/.test(line); const items = [line]
      while (lines[i + 1] && (ordered ? /^\s*\d+[.)] / : /^\s*[-*+] /).test(lines[i + 1])) items.push(lines[++i])
      const children = items.map((item, index) => <li key={index}>{inline(item.replace(/^\s*(?:[-*+]|\d+[.)])\s+/, ''))}</li>)
      blocks.push(ordered ? <ol key={i}>{children}</ol> : <ul key={i}>{children}</ul>)
    } else {
      const paragraph = [line]
      while (lines[i + 1]?.trim() && !/^\s*(?:#{1,6}\s|[-*+] |\d+[.)] )/.test(lines[i + 1]) && !(lines[i + 1].includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 2] || ''))) paragraph.push(lines[++i])
      blocks.push(<p key={i}>{inline(paragraph.join('\n'))}</p>)
    }
  }
  return <div className="assistant-answer">{blocks}</div>
}

export function CopyAnswer({ content }: { content: string }) {
  const [status, setStatus] = useState('')
  useEffect(() => { if (!status) return; const timer = setTimeout(() => setStatus(''), 2500); return () => clearTimeout(timer) }, [status])
  async function copy() {
    try { await navigator.clipboard.writeText(content); setStatus('Đã sao chép') }
    catch { setStatus('Không thể sao chép. Hãy chọn nội dung để sao chép thủ công.') }
  }
  return <div className="assistant-message-actions"><button type="button" onClick={() => void copy()} aria-label="Sao chép câu trả lời">Sao chép</button><span role="status">{status}</span></div>
}

export function FailedQuestion({ content, error, busy, onRetry }: { content: string; error: string; busy: boolean; onRetry: () => void }) {
  return <article className="order-chat-message user assistant-failed"><strong>Bạn · Chưa gửi thành công</strong><p>{content}</p><div role="alert"><small>{error}</small><button type="button" className="mini-button" disabled={busy} onClick={onRetry}>Gửi lại câu hỏi</button></div></article>
}

export function ChatComposer({ value, onChange, busy, onSubmit, sendLabel, placeholder, notice, inputRef }: { value: string; onChange: (value: string) => void; busy: boolean; onSubmit: (event: FormEvent) => void; sendLabel: string; placeholder: string; notice: string; inputRef?: RefObject<HTMLTextAreaElement | null> }) {
  const internal = useRef<HTMLTextAreaElement>(null)
  const input = inputRef || internal
  useEffect(() => {
    const element = input.current
    if (element) { element.style.height = 'auto'; element.style.height = `${Math.min(132, Math.max(44, element.scrollHeight))}px` }
  }, [value])
  return <><form className="assistant-composer" onSubmit={onSubmit}><textarea ref={input} aria-label="Câu hỏi" aria-describedby="assistant-input-help" rows={1} maxLength={1000} value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => composerKeyDown(e, busy)} placeholder={placeholder} /><button aria-label={sendLabel} title={busy ? 'Đang chờ câu trả lời' : 'Gửi câu hỏi'} disabled={busy || !value.trim()}>↑</button></form><div className="assistant-composer-meta"><p id="assistant-input-help" className="assistant-composer-help">Enter để gửi · Shift + Enter để xuống dòng. {notice}</p>{value.length >= 800 && <span className="assistant-character-count" role="status">{value.length}/1.000 ký tự</span>}</div></>
}
