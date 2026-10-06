import { useState, useRef, type ChangeEvent, type DragEvent, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { apiPostForm } from '../../shared/api/client'
import { LoadingSkeleton } from '../../shared/components/LoadingSkeleton'

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

// Danh sách các mẫu xe test nhanh có sẵn trong dataset
const SAMPLE_CARS = [
  {
    name: 'Honda CR-V',
    path: 'images/car_34_3/Honda$$CR-V$$2007$$Black$$34_3$$671$$image_19.jpg',
  },
  {
    name: 'Toyota RAV4',
    path: 'images/car_92_34/Toyota$$RAV4$$2011$$Beige$$92_34$$341$$image_2.jpg',
  },
  {
    name: 'Toyota Corolla',
    path: 'images/car_92_11/Toyota$$Corolla$$2003$$Black$$92_11$$45$$image_0.jpg',
  },
  {
    name: 'Honda Civic',
    path: 'images/car_34_2/Honda$$Civic$$2009$$Black$$34_2$$740$$image_6.jpg',
  },
  {
    name: 'Mazda 3',
    path: 'images/car_57_11/Mazda$$Mazda3$$2008$$Black$$57_11$$1233$$image_41.jpg',
  },
]

export default function ImageSearchPage() {
  const navigate = useNavigate()
  const [selectedFile, setSelectedFile] = useState<File | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [topK, setTopK] = useState(5)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searchData, setSearchData] = useState<ImageSearchResult | null>(null)
  const [isDragging, setIsDragging] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleFile(file: File) {
    if (!file.type.startsWith('image/')) {
      setError('Vui lòng chọn tệp định dạng hình ảnh (.jpg, .png, .webp).')
      return
    }
    setError('')
    setSelectedFile(file)
    const reader = new FileReader()
    reader.onload = () => setPreviewUrl(reader.result as string)
    reader.readAsDataURL(file)
  }

  function onFileInputChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  function onDragOver(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(true)
  }

  function onDragLeave(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragging(false)
    const file = e.dataTransfer.files?.[0]
    if (file) handleFile(file)
  }

  async function loadSampleImage(sample: typeof SAMPLE_CARS[0]) {
    try {
      setLoading(true)
      setError('')
      const fullUrl = `/api/image-service/${sample.path}`
      const resp = await fetch(fullUrl)
      if (!resp.ok) throw new Error('Không thể tải ảnh mẫu từ server')
      const blob = await resp.blob()
      const file = new File([blob], `${sample.name}.jpg`, { type: 'image/jpeg' })
      handleFile(file)
      // Tự động tìm kiếm ngay với ảnh mẫu
      await executeSearch(file, topK)
    } catch (err) {
      setError('Lỗi tải ảnh mẫu. Vui lòng đảm bảo Image Service đang chạy.')
    } finally {
      setLoading(false)
    }
  }

  async function executeSearch(fileToSearch: File, k: number) {
    setLoading(true)
    setError('')
    setSearchData(null)
    try {
      const formData = new FormData()
      formData.append('file', fileToSearch)
      formData.append('top_k', String(k))

      const data = await apiPostForm<ImageSearchResult>(
        '/api/image-service/search/image',
        formData
      )
      setSearchData(data)
    } catch (err: any) {
      setError('Không thể kết nối đến Dịch vụ Tìm kiếm ảnh (Image Service). Hãy chắc chắn cổng 8000 đang chạy.')
    } finally {
      setLoading(false)
    }
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!selectedFile) {
      setError('Vui lòng chọn hoặc tải lên một hình ảnh xe.')
      return
    }
    void executeSearch(selectedFile, topK)
  }

  function handleReset() {
    setSelectedFile(null)
    setPreviewUrl(null)
    setSearchData(null)
    setError('')
    if (fileInputRef.current) fileInputRef.current.value = ''
  }

  return (
    <div className="page image-search-page">
      <header className="image-search-header">
        <span className="section-kicker">AI Visual Intelligence (CLIP + FAISS)</span>
        <h1>Tìm kiếm mẫu xe bằng hình ảnh</h1>
        <p>
          Tải lên ảnh một chiếc xe ô tô bất kỳ, mô hình CLIP ViT-B/32 sẽ trích xuất vector đặc trưng 512 chiều 
          và chỉ mục FAISS sẽ so sánh để nhận diện đúng mẫu xe và thông số chỉ trong vài mili-giây.
        </p>
      </header>

      {/* Preset sample buttons */}
      <section className="sample-presets">
        <span>Thử nhanh với ảnh mẫu có sẵn:</span>
        <div className="preset-buttons">
          {SAMPLE_CARS.map((s) => (
            <button
              key={s.name}
              type="button"
              className="mini-button preset-btn"
              onClick={() => void loadSampleImage(s)}
              disabled={loading}
            >
              🚗 {s.name}
            </button>
          ))}
        </div>
      </section>

      {/* Upload Box */}
      <form onSubmit={handleSubmit} className="image-upload-section">
        <div
          className={`image-dropzone ${isDragging ? 'dragging' : ''} ${previewUrl ? 'has-image' : ''}`}
          onDragOver={onDragOver}
          onDragLeave={onDragLeave}
          onDrop={onDrop}
          onClick={() => !previewUrl && fileInputRef.current?.click()}
        >
          <input
            type="file"
            ref={fileInputRef}
            style={{ display: 'none' }}
            accept="image/jpeg,image/png,image/webp"
            onChange={onFileInputChange}
          />

          {previewUrl ? (
            <div className="preview-container">
              <img src={previewUrl} alt="Ảnh cần tìm" className="preview-img" />
              <div className="preview-overlay">
                <button
                  type="button"
                  className="mini-button"
                  onClick={(e) => {
                    e.stopPropagation()
                    fileInputRef.current?.click()
                  }}
                >
                  Đổi ảnh khác
                </button>
                <button
                  type="button"
                  className="mini-button danger"
                  onClick={(e) => {
                    e.stopPropagation()
                    handleReset()
                  }}
                >
                  Xóa
                </button>
              </div>
            </div>
          ) : (
            <div className="dropzone-content">
              <span className="dropzone-icon">📷</span>
              <strong>Kéo thả ảnh xe vào đây hoặc bấm để chọn tệp</strong>
              <small>Hỗ trợ định dạng JPG, PNG, WebP (Tối đa 10MB)</small>
            </div>
          )}
        </div>

        <div className="search-controls">
          <label>
            Số lượng xe hiển thị (Top-K):
            <select
              value={topK}
              onChange={(e) => setTopK(Number(e.target.value))}
              disabled={loading}
            >
              <option value={3}>Top 3</option>
              <option value={5}>Top 5 (Khuyến nghị)</option>
              <option value={8}>Top 8</option>
            </select>
          </label>

          <button
            type="submit"
            className="button primary"
            disabled={loading || !selectedFile}
          >
            {loading ? 'Đang nhận diện vector...' : '🔍 Tìm kiếm xe tương đồng'}
          </button>
        </div>
      </form>

      {error && (
        <div className="alert-error" role="alert">
          <strong>Lỗi:</strong> {error}
        </div>
      )}

      {/* Loading state */}
      {loading && (
        <div style={{ margin: '30px 0' }}>
          <LoadingSkeleton />
          <p style={{ textAlign: 'center', color: '#173f38', marginTop: 12 }}>
            Đang trích xuất đặc trưng CLIP và tìm kiếm lân cận trên FAISS Index...
          </p>
        </div>
      )}

      {/* Results Section */}
      {searchData && (
        <section className="search-results-section">
          {/* Metrics Toolbar */}
          <div className="metrics-banner">
            <div className="metric-item">
              <small>Độ tin cậy</small>
              <strong className={`badge ${searchData.confidence}`}>
                {searchData.confidence === 'high'
                  ? '🟢 Cao (High)'
                  : searchData.confidence === 'medium'
                  ? '🟡 Trung bình'
                  : '🔴 Thấp (Uncertain)'}
              </strong>
            </div>

            <div className="metric-item">
              <small>Độ trễ truy hồi</small>
              <strong>⚡ {searchData.latency_ms ?? 0} ms</strong>
            </div>

            <div className="metric-item">
              <small>Biên độ chênh lệch (Margin)</small>
              <strong>+{Math.round(searchData.margin * 1000) / 1000}</strong>
            </div>

            <div className="metric-item">
              <small>Mô hình trích xuất</small>
              <strong>CLIP ViT-B/32 (512-dim)</strong>
            </div>
          </div>

          {searchData.uncertain && (
            <div className="alert-warning" role="status">
              ⚠️ <strong>Cảnh báo ngoài miền / Góc chụp khó:</strong> Hệ thống nhận thấy độ tương đồng thấp 
              hoặc chênh lệch không rõ rệt. Kết quả dưới đây có thể không phản ánh đúng 100% mẫu xe thực tế.
            </div>
          )}

          <h2 className="results-heading">
            Các mẫu xe khớp nhất ({searchData.results.length} xe duy nhất):
          </h2>

          <div className="image-matches-grid">
            {searchData.results.map((match, idx) => {
              const similarityPercent = Math.round(match.similarity * 1000) / 10
              return (
                <article key={match.car_id} className="match-card">
                  <div className="match-rank-badge">#{idx + 1}</div>

                  <div className="match-image-wrap">
                    <img
                      src={`/api/image-service/${match.best_image}`}
                      alt={match.display_name || match.model || 'Xe'}
                      onError={(e) => {
                        // Fallback placeholder if image not loaded
                        ;(e.target as HTMLImageElement).src =
                          'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="200" height="150" viewBox="0 0 200 150"><rect fill="%23e8efe9" width="200" height="150"/><text fill="%23173f38" font-family="sans-serif" font-size="14" dy="10.5" font-weight="bold" x="50%" y="50%" text-anchor="middle">Ảnh xe</text></svg>'
                      }}
                    />
                  </div>

                  <div className="match-card-content">
                    <span className="match-brand">{match.brand}</span>
                    <h3 className="match-name">{match.display_name || match.model}</h3>

                    <div className="similarity-bar-container">
                      <div className="similarity-labels">
                        <span>Độ tương đồng</span>
                        <strong>{similarityPercent}%</strong>
                      </div>
                      <div className="progress-track">
                        <div
                          className="progress-fill"
                          style={{
                            width: `${Math.min(100, Math.max(0, similarityPercent))}%`,
                          }}
                        />
                      </div>
                    </div>

                    <div className="match-actions">
                      <Link
                        to={`/cars/${encodeURIComponent(match.car_id)}`}
                        className="button secondary mini"
                      >
                        Thông số xe →
                      </Link>

                      <button
                        type="button"
                        className="button primary mini"
                        onClick={() =>
                          navigate(
                            `/chat?question=${encodeURIComponent(
                              `Tư vấn chi tiết và thông số mẫu xe ${match.display_name || match.model}`
                            )}`
                          )
                        }
                      >
                        💬 Hỏi AI về xe này
                      </button>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
