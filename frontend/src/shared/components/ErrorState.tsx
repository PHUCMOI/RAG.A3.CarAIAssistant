export function ErrorState({ message = 'Không thể tải dữ liệu.', onRetry }: { message?: string; onRetry?: () => void }) {
  return <div className="state-card"><strong>Có lỗi xảy ra</strong><p>{message}</p>{onRetry && <button className="button secondary" onClick={onRetry}>Thử lại</button>}</div>
}
