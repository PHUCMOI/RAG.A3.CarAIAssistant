export interface SourceReference {
  recordId: string
  label: string
  carId: string | null
}

export interface Source {
  sourceId: string
  title: string
  url: string
  sourceType: string
  supports: string | null
  checkedAt: string
  references: Record<'cars' | 'prices' | 'warranties' | 'dealers' | 'documents', SourceReference[]>
}
