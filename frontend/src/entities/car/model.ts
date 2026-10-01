export type Car = {
  carId: string
  genmodelId: string
  brand: string
  displayName: string
  description: string
  aliases: string[]
  marketStatusVn: string
  bodyType?: string | null
  fuelType?: string | null
  transmission?: string | null
  seats?: number | null
  engine?: string | null
  priceVndFrom?: number | null
  priceAsOf?: string | null
  priceSourceId?: string | null
  warrantyMonths?: number | null
  warrantyDistanceKm?: number | null
  presenceSourceId: string
  missingFields: string[]
  imageCount: number
}

export type CarListResponse = { count: number; items: Car[] }
