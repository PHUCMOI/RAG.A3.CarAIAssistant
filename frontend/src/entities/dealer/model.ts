export type Dealer = {
  dealerId: number
  name: string
  address: string
  city: string
  phone?: string | null
  website?: string | null
  supportedBrands: string[]
  sourceId?: string | null
  checkedAt: string
}
