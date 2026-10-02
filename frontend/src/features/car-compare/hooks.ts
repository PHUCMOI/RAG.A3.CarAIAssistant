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
}
