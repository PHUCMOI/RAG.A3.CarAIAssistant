export function LoadingSkeleton({ label = 'Đang tải dữ liệu…' }: { label?: string }) {
  return <div className="state-card loading-state"><span className="spinner" />{label}</div>
}
