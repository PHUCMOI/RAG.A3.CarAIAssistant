import { useEffect, useState, useRef, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { apiPostForm } from '../../shared/api/client'
import { ImageIcon } from '../../shared/components/ImageIcon'
import './image-search.css'

export interface CarImageMatch {
  car_id: string
  brand?: string
  model?: string
  display_name?: string
  similarity: number
  best_image: string
}
export interface ImageSearchResult {
  results: CarImageMatch[]
  confidence: 'high' | 'medium' | 'low'
  uncertain: boolean
  margin: number
  latency_ms?: number
}
const SAMPLE_CARS = [
  { name: 'Honda CR-V', path: 'images/car_34_3/Honda$$CR-V$$2007$$Black$$34_3$$671$$image_19.jpg' },
  { name: 'Toyota RAV4', path: 'images/car_92_34/Toyota$$RAV4$$2011$$Beige$$92_34$$341$$image_2.jpg' },
  { name: 'Toyota Corolla', path: 'images/car_92_11/Toyota$$Corolla$$2003$$Black$$92_11$$45$$image_0.jpg' },
  { name: 'Honda Civic', path: 'images/car_34_2/Honda$$Civic$$2009$$Black$$34_2$$740$$image_6.jpg' },
  { name: 'Mazda 3', path: 'images/car_57_11/Mazda$$Mazda3$$2008$$Black$$57_11$$1233$$image_41.jpg' },
]
const placeholder = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 240"><rect width="400" height="240" fill="#edf2e8"/><path d="M110 145h180l-15-38h-32l-20-25h-49l-22 25h-27z" fill="none" stroke="#94a48c" stroke-width="5"/><circle cx="148" cy="147" r="12" fill="#94a48c"/><circle cx="250" cy="147" r="12" fill="#94a48c"/></svg>')

export default function ImageSearchPage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [topK, setTopK] = useState(5)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [failedSample, setFailedSample] = useState<typeof SAMPLE_CARS[number] | null>(null)
  const [searchData, setSearchData] = useState<ImageSearchResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const locked = useRef(false)
  const mounted = useRef(true)
  const resultsTitle = useRef<HTMLHeadingElement>(null)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  useEffect(() => {
    if (!selectedFile) { setPreviewUrl(null); return }
    const url = URL.createObjectURL(selectedFile)
    setPreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [selectedFile])

  function handleFile(file: File) {
    if (locked.current) return
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
      setError('Chọn ảnh JPG, PNG hoặc WebP để tìm xe.'); return
    }
    setError(''); setFailedSample(null); setSelectedFile(file); setSearchData(null)
  }
  function onFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    if (file) handleFile(file)
    event.target.value = ''
  }
  function onDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault(); setIsDragging(false)
    const file = event.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }
  async function requestSearch(file: File, k: number) {
    const form = new FormData(); form.append('file', file); form.append('top_k', String(k))
    const data = await apiPostForm<ImageSearchResult>('/api/image-service/search/image', form)
    if (mounted.current) { setSearchData(data); requestAnimationFrame(() => resultsTitle.current?.focus()) }
  }
  async function executeSearch(file: File) {
    if (locked.current) return
    locked.current = true; setLoading(true); setError(''); setFailedSample(null); setSearchData(null)
    try { await requestSearch(file, topK) }
    catch { if (mounted.current) setError('Chưa thể tìm kiếm ảnh lúc này. Ảnh của bạn vẫn được giữ; hãy thử lại.') }
    finally { locked.current = false; if (mounted.current) setLoading(false) }
  }
  async function loadSampleImage(sample: typeof SAMPLE_CARS[number]) {
    if (locked.current) return
    locked.current = true; setLoading(true); setError(''); setFailedSample(null); setSearchData(null)
    try {
      const response = await fetch(`/api/image-service/${sample.path}`)
      if (!response.ok) throw new Error('Sample unavailable')
      const blob = await response.blob()
      const file = new File([blob], `${sample.name}.jpg`, { type: 'image/jpeg' })
      if (!mounted.current) return
      setSelectedFile(file)
      await requestSearch(file, topK)
    } catch { if (mounted.current) { setFailedSample(sample); setError('Chưa thể tìm kiếm với ảnh mẫu. Hãy thử lại hoặc chọn ảnh của bạn.') } }
    finally { locked.current = false; if (mounted.current) setLoading(false) }
  }
  function submit(event: FormEvent) { event.preventDefault(); if (selectedFile) void executeSearch(selectedFile) }
  function reset() {
    if (locked.current) return
    setSelectedFile(null); setSearchData(null); setError(''); setFailedSample(null)
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return <div className="page image-search-page">
    <header className="image-search-header">
      <div><span className="section-kicker">KHÁM PHÁ XE BẰNG ẢNH</span><h1>Thấy chiếc xe bạn thích?</h1><p>Gửi một bức ảnh, khám phá những mẫu xe tương đồng và hỏi AutoWise để tìm hiểu thêm.</p></div>
      <Link to="/cars" className="image-catalog-link">Khám phá danh sách xe <span aria-hidden="true">↗</span></Link>
    </header>
    <div className="image-search-layout">
      <aside className="image-search-input">
        <form onSubmit={submit} className="image-upload-section" aria-label="Tìm xe bằng ảnh">
          <div className="image-panel-heading"><span className="image-step">01</span><div><h2>Ảnh xe của bạn</h2><p>Ảnh rõ nét giúp tìm xe chính xác hơn.</p></div></div>
          <input type="file" ref={fileInputRef} hidden accept="image/jpeg,image/png,image/webp" onChange={onFileInputChange} disabled={loading} />
          <div className={`image-dropzone ${isDragging ? 'dragging' : ''} ${previewUrl ? 'has-image' : ''}`} onDragOver={event => { event.preventDefault(); if (!loading) setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={onDrop}>
            {previewUrl ? <div className="preview-container"><img src={previewUrl} alt="Ảnh xe cần tìm" className="preview-img" /></div> : <div className="dropzone-content"><span className="dropzone-icon"><ImageIcon /></span><strong>Kéo thả ảnh xe vào đây</strong><span>hoặc chọn ảnh từ thiết bị của bạn</span><button type="button" className="button primary" disabled={loading} onClick={() => fileInputRef.current?.click()}>Chọn ảnh xe</button><small>JPG, PNG hoặc WebP</small></div>}
          </div>
          {selectedFile && <div className="image-file-summary"><div><strong>{selectedFile.name}</strong><small>{(selectedFile.size / 1024).toLocaleString('vi-VN', { maximumFractionDigits: 0 })} KB · Sẵn sàng tìm kiếm</small></div><button type="button" className="image-text-button" disabled={loading} onClick={() => fileInputRef.current?.click()}>Đổi ảnh</button><button type="button" className="image-text-button" disabled={loading} onClick={reset} aria-label="Xóa ảnh đã chọn">Xóa</button></div>}
          <div className="search-controls"><label htmlFor="image-result-count">Số kết quả hiển thị</label><select id="image-result-count" value={topK} onChange={event => { setTopK(Number(event.target.value)); setSearchData(null) }} disabled={loading}><option value={3}>3 mẫu xe</option><option value={5}>5 mẫu xe</option><option value={8}>8 mẫu xe</option></select></div>
          <button type="submit" className="button primary image-search-submit" disabled={loading || !selectedFile}>{loading ? 'Đang tìm mẫu xe…' : 'Tìm xe tương đồng →'}</button>
          {error && <div className="image-search-error" role="alert"><p>{error}</p>{(selectedFile || failedSample) && <button type="button" className="image-text-button" disabled={loading} onClick={() => { if (failedSample) void loadSampleImage(failedSample); else if (selectedFile) void executeSearch(selectedFile) }}>Thử lại tìm kiếm</button>}</div>}
          <p className="image-upload-tip">Nên chọn ảnh có một chiếc xe, thấy rõ thân xe và hạn chế vật che khuất.</p>
        </form>
        <section className="sample-presets" aria-label="Ảnh mẫu"><h3>Chưa có ảnh? Thử ảnh mẫu</h3><p>Chọn một mẫu xe để xem cách tìm kiếm hoạt động.</p><div className="preset-buttons">{SAMPLE_CARS.map(sample => <button key={sample.name} type="button" className="preset-btn" disabled={loading} onClick={() => void loadSampleImage(sample)}>{sample.name}<span aria-hidden="true">↗</span></button>)}</div></section>
      </aside>
      <section className="search-results-section" aria-label="Kết quả tìm kiếm ảnh" aria-busy={loading}>
        <div className="image-results-heading"><div><span className="section-kicker">GỢI Ý CHO BẠN</span><h2 ref={resultsTitle} tabIndex={-1}>{searchData ? `${searchData.results.length} mẫu xe tương đồng` : 'Tìm chiếc xe trong ảnh'}</h2></div>{searchData && <span className={`image-confidence ${searchData.confidence}`}>Mức tin cậy: {searchData.confidence === 'high' ? 'Cao' : searchData.confidence === 'medium' ? 'Trung bình' : 'Thấp'}</span>}</div>
        {loading ? <div className="image-results-empty" role="status"><span className="image-search-spinner" aria-hidden="true" /><h3>Đang tìm xe tương đồng</h3><p>Đang đối chiếu ảnh của bạn với các mẫu xe trong danh sách.</p></div> : !searchData ? <div className="image-results-empty"><span className="image-empty-icon"><ImageIcon /></span><h3>Một bức ảnh, thêm nhiều lựa chọn</h3><p>Chọn ảnh ở bên trái để xem những mẫu xe có ngoại hình tương đồng.</p><div className="image-empty-steps"><span><b>1</b>Chọn ảnh xe</span><span><b>2</b>Xem kết quả</span><span><b>3</b>Hỏi trợ lý AI</span></div><Link to="/chat">Bạn đã biết tên xe? Hỏi AutoWise →</Link></div> : <>
          {searchData.uncertain && <div className="image-search-warning" role="status"><strong>Chưa đủ rõ để nhận diện chắc chắn</strong><p>Các mẫu xe dưới đây là gợi ý tham khảo. Thử ảnh rõ hơn hoặc góc chụp khác để cải thiện kết quả.</p></div>}
          {!searchData.results.length && <div className="image-results-empty"><h3>Chưa tìm thấy mẫu xe phù hợp</h3><p>Hãy đổi ảnh hoặc thử một ảnh mẫu. Bạn cũng có thể tìm xe theo tên và hãng.</p><Link to="/cars" className="button secondary">Khám phá xe</Link></div>}
          <div className="image-matches-grid">{searchData.results.map((match, index) => {
            const name = match.display_name || [match.brand, match.model].filter(Boolean).join(' ') || 'Mẫu xe chưa có tên'
            const similarity = Number.isFinite(match.similarity) ? Math.round(Math.min(1, Math.max(0, match.similarity)) * 1000) / 10 : null
            const chatParams = new URLSearchParams({ car: match.car_id, carName: name })
            return <article key={match.car_id} className="match-card">
              <div className="match-image-wrap"><span className="match-rank-badge">{index === 0 ? 'Tương đồng nhất' : `Gợi ý ${index + 1}`}</span><img src={match.best_image ? `/api/image-service/${match.best_image}` : placeholder} alt={name} loading="lazy" onError={event => { event.currentTarget.onerror = null; event.currentTarget.src = placeholder }} /></div>
              <div className="match-card-content"><span className="match-brand">{match.brand || 'Chưa có hãng xe'}</span><h3 className="match-name">{name}</h3><div className="similarity-bar-container"><div className="similarity-labels"><span>Độ tương đồng hình ảnh</span><strong>{similarity === null ? 'Chưa có dữ liệu' : `${similarity.toLocaleString('vi-VN')}%`}</strong></div><div className="progress-track" aria-hidden="true"><div className="progress-fill" style={{ width: `${similarity ?? 0}%` }} /></div></div><div className="match-actions"><Link to={`/cars/${encodeURIComponent(match.car_id)}`} className="button secondary">Xem chi tiết</Link><Link to={`/chat?${chatParams}`} className="button primary">Hỏi AI <span aria-hidden="true">↗</span></Link></div></div>
            </article>
          })}</div>
          {!!searchData.results.length && <p className="image-results-note">Độ tương đồng phản ánh ngoại hình trong ảnh, không phải xác suất nhận diện chính xác.{searchData.latency_ms != null && ` Thời gian xử lý: ${Math.round(searchData.latency_ms).toLocaleString('vi-VN')} ms.`}</p>}
        </>}
      </section>
    </div>
  </div>
}
