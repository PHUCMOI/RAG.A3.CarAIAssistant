export function EmptyState({ title, description }: { title: string; description: string }) {
  return <div className="state-card"><strong>{title}</strong><p>{description}</p></div>
}
