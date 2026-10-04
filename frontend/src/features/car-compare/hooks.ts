export function normalizeSelection(value: string): string[] {
  return [...new Set(value.split(',').map(id => id.trim()).filter(Boolean))].slice(0, 3)
}

export function readSavedComparison(): string[] {
  try {
    const saved: unknown = JSON.parse(localStorage.getItem('compareCars') || '[]')
    return Array.isArray(saved) ? normalizeSelection(saved.filter((id): id is string => typeof id === 'string').join(',')) : []
  } catch { return [] }
}

export function saveComparison(ids: string[]) {
  try { localStorage.setItem('compareCars', JSON.stringify(ids)) } catch { /* Selection still works through the URL. */ }
  window.dispatchEvent(new CustomEvent('comparison-changed', { detail: ids }))
}
import { useEffect, useState } from 'react'


export function toggleSelection(ids: string[], id: string) {
  if (ids.includes(id)) return { ids: ids.filter(value => value !== id), message: '' }
  if (ids.length === 3) return { ids, message: 'Chỉ có thể so sánh tối đa 3 xe. Hãy bỏ một xe trước khi thêm.' }
  return { ids: [...ids, id], message: '' }
}
export function useComparisonSelection() {
  const [ids, setIds] = useState(readSavedComparison)
  useEffect(() => {
    const local = (event: Event) => setIds((event as CustomEvent<string[]>).detail)
    const remote = (event: StorageEvent) => { if (event.key === 'compareCars' || event.key === null) setIds(readSavedComparison()) }
    window.addEventListener('comparison-changed', local)
    window.addEventListener('storage', remote)
    return () => { window.removeEventListener('comparison-changed', local); window.removeEventListener('storage', remote) }
  }, [])
  return [ids, (next: string[]) => { setIds(next); saveComparison(next) }] as const
}
