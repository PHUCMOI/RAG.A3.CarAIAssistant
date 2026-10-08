import { Fragment, useEffect, useRef, useState, type FormEvent, type RefObject, type ReactNode } from 'react'
import { composerKeyDown } from './ChatUtilities'
import { formatAnswer, comparisonFacts, singleCarFacts } from './answerFormatting'
import type { CatalogContext } from './storage'

function inline(value: string) {
  return value.split(/(\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g).map((part, index) => part.startsWith('**') && part.endsWith('**') ? <strong key={index}>{part.slice(2, -2)}</strong> : part.startsWith('*') && part.endsWith('*') ? <em key={index}>{part.slice(1, -1)}</em> : part.startsWith('`') && part.endsWith('`') ? <code key={index}>{part.slice(1, -1)}</code> : <Fragment key={index}>{part}</Fragment>)
}

// Render a small, safe subset of Markdown. HTML remains text; no raw HTML or arbitrary links.
export function AnswerContent({ content, contexts, natural = false }: { content: string; contexts?: CatalogContext[]; natural?: boolean }) {
  const comparison = natural ? null : comparisonFacts(content)
  const single = natural || comparison ? null : singleCarFacts(content) || (contexts?.length === 1 && contexts[0].description ? { cars: [contexts[0].displayName], rows: [], remaining: formatAnswer(content), similarity: undefined } : null)
  const selected = single ? contexts?.find(context => context.displayName === single.cars[0]) : undefined
  const description = selected?.description
  const features = Object.entries(selected?.specifications || {}).filter(([label]) => !single?.rows.some(row => row.label === label))
  const lines = (natural ? content : comparison ? comparison.remaining : single ? single.remaining : formatAnswer(content)).split('\n')
  const price = single?.rows.find(row => row.label === 'Giá tham khảo từ')
  const blocks = []
  const notes = new Map<string, string>()
  const field = (line: string) => line.match(/^([\p{L}][\p{L}\d ()/–-]{1,44}):\s+(.+)$/u)
  const startsBlock = (index: number) => /^\s*(?:#{1,6}\s|[-*+•] |\d+[.)] |>|```|---+$)/.test(lines[index] || '') || !!field(lines[index] || '') || ((lines[index] || '').includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[index + 1] || ''))
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    if (!line.trim()) continue
    if (/^\s*```/.test(line)) {
      const code: string[] = []
      while (i + 1 < lines.length && !/^\s*```/.test(lines[i + 1])) code.push(lines[++i])
      if (i + 1 < lines.length) i++
      blocks.push(<pre key={i}><code>{code.join('\n')}</code></pre>)
    } else if (/^\s*>/.test(line)) {
      const note = line.replace(/^\s*>\s?/, '').trim()
      if (note) notes.set(note.replace(/\s+/g, ' '), note)
    } else if (/^\s*---+\s*$/.test(line)) {
      blocks.push(<hr key={i} />)
    } else if (field(line)) {
      const entries = [field(line)!]
      while (i + 1 < lines.length) {
        if (field(lines[i + 1])) { entries.push(field(lines[++i])!); continue }
        if (!lines[i + 1].trim() && field(lines[i + 2] || '')) { i++; entries.push(field(lines[++i])!); continue }
        break
      }
      blocks.push(<dl className="assistant-answer-facts" key={i}>{entries.map((entry, index) => <div key={index}><dt>{inline(entry[1])}</dt><dd>{inline(entry[2])}</dd></div>)}</dl>)
    } else if (line.includes('|') && /^\s*\|?\s*:?-{3,}/.test(lines[i + 1] || '')) {
      const cells = (text: string) => text.trim().replace(/^\||\|$/g, '').split('|').map(cell => cell.trim())
      const headers = cells(line); const rows: string[][] = []; i++
      while (lines[i + 1]?.includes('|') && lines[i + 1].trim()) rows.push(cells(lines[++i]))
      blocks.push(<div className="assistant-table" key={i}><table><thead><tr>{headers.map((cell, index) => <th key={index} scope="col">{inline(cell)}</th>)}</tr></thead><tbody>{rows.map((row, index) => <tr key={index}>{headers.map((_, column) => <td key={column}>{inline(row[column] || '')}</td>)}</tr>)}</tbody></table></div>)
    } else if (/^#{1,6}\s/.test(line)) {
      blocks.push(<h3 key={i}>{inline(line.replace(/^#{1,6}\s+/, ''))}</h3>)
    } else if (/^\s*([-*+•] |\d+[.)] )/.test(line)) {
      const ordered = /^\s*\d/.test(line); const items = [line]
      while (lines[i + 1] && (ordered ? /^\s*\d+[.)] / : /^\s*[-*+•] /).test(lines[i + 1])) items.push(lines[++i])
      const children = items.map((item, index) => <li key={index}>{inline(item.replace(/^\s*(?:[-*+•]|\d+[.)])\s+/, ''))}</li>)
      blocks.push(ordered ? <ol key={i}>{children}</ol> : <ul key={i}>{children}</ul>)
    } else {
      const paragraph = [line]
      while (lines[i + 1]?.trim() && !startsBlock(i + 1)) paragraph.push(lines[++i])
      blocks.push(<p key={i}>{inline(paragraph.join('\n'))}</p>)
    }
  }
  return <div className={`assistant-answer${natural ? ' assistant-answer-natural' : ''}`}>{single && <section className="assistant-car-result" aria-label="Thông tin xe">
    <p className="assistant-car-intro">{selected?.summary ? inline(selected.summary.replace(single.cars[0], `**${single.cars[0]}**`)) : <> {single.similarity ? 'Xe gần giống nhất trong ảnh là ' : 'Thông tin về '}<strong>{single.cars[0]}</strong>.</>}</p>
    {single.similarity && <p className="assistant-match-score">Độ tương đồng {single.similarity.replace('.', ',')}% với ảnh trong catalogue.</p>}
    {description && <details className="assistant-car-description"><summary>Mô tả từ catalogue</summary><p>{description}</p></details>}
    {(features.length > 0 || single.rows.some(row => row !== price && !/giá|bảo hành/i.test(row.label))) && <><h3>Đặc điểm xe</h3><ul>{features.map(([label, value]) => <li key={label}><strong>{label}:</strong> {value}</li>)}{single.rows.filter(row => row !== price && !/giá|bảo hành/i.test(row.label)).map(row => <li key={row.label}><strong>{row.label}:</strong> {inline(row.values[0])}</li>)}</ul></>}
    {price && <div className="assistant-car-price"><h3>Giá tham khảo của {single.cars[0]}</h3><p>Từ <strong>{inline(price.values[0])}</strong></p>{single.rows.filter(row => row !== price && /giá/i.test(row.label)).map(row => <p key={row.label}>{row.label}: <span>{inline(row.values[0])}</span>.</p>)}</div>}
    {single.rows.some(row => /bảo hành/i.test(row.label)) && <><h3>Thông tin bảo hành</h3><ul>{single.rows.filter(row => /bảo hành/i.test(row.label)).map(row => <li key={row.label}><strong>{row.label}:</strong> {inline(row.values[0])}</li>)}</ul></>}
  </section>}{comparison && <div className="assistant-table assistant-comparison" tabIndex={0} role="region" aria-label="So sánh xe"><table><thead><tr><th scope="col">Tiêu chí</th>{comparison.cars.map(car => <th scope="col" key={car}>{inline(car)}</th>)}</tr></thead><tbody>{contexts?.some(context => context.description && comparison.cars.includes(context.displayName)) && <tr><th scope="row">Giới thiệu xe</th>{comparison.cars.map(car => <td key={car}>{contexts.find(context => context.displayName === car)?.description || 'Catalogue chưa có mô tả'}</td>)}</tr>}{comparison.rows.map(row => <tr key={row.label}><th scope="row">{inline(row.label)}</th>{row.values.map((value, index) => <td key={index}>{inline(value)}</td>)}</tr>)}</tbody></table></div>}{blocks}{notes.size > 0 && <aside className="assistant-answer-note" aria-label="Lưu ý"><span>Lưu ý</span>{[...notes.values()].map((note, index) => <p key={index}>{inline(note)}</p>)}</aside>}</div>
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

export function ChatComposer({ value, onChange, busy, onSubmit, sendLabel, placeholder, notice, inputRef, attachment, tools, canSend = false }: { value: string; onChange: (value: string) => void; busy: boolean; onSubmit: (event: FormEvent) => void; sendLabel: string; placeholder: string; notice: string; attachment?: ReactNode; tools?: ReactNode; canSend?: boolean; inputRef?: RefObject<HTMLTextAreaElement | null> }) {
  const internal = useRef<HTMLTextAreaElement>(null)
  const input = inputRef || internal
  useEffect(() => {
    const element = input.current
    if (element) { element.style.height = 'auto'; element.style.height = `${Math.min(132, Math.max(44, element.scrollHeight))}px` }
  }, [value])
  return <>{attachment}<form className="assistant-composer" onSubmit={onSubmit}>{tools && <div className="assistant-composer-tools">{tools}</div>}<textarea ref={input} aria-label="Câu hỏi" aria-describedby="assistant-input-help" rows={1} maxLength={1000} value={value} onChange={e => onChange(e.target.value)} onKeyDown={e => composerKeyDown(e, busy)} placeholder={placeholder} /><button aria-label={sendLabel} title={busy ? 'Đang chờ câu trả lời' : 'Gửi câu hỏi'} disabled={busy || (!value.trim() && !canSend)}>↑</button></form><div className="assistant-composer-meta"><p id="assistant-input-help" className="assistant-composer-help">Enter để gửi · Shift + Enter để xuống dòng. {notice}</p>{value.length >= 800 && <span className="assistant-character-count" role="status">{value.length}/1.000 ký tự</span>}</div></>
}
