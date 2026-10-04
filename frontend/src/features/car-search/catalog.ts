import type { Car } from '../../entities/car/model'

export const groups = [['brand', 'Hãng'], ['bodyType', 'Kiểu xe'], ['fuelType', 'Nhiên liệu'], ['transmission', 'Hộp số'], ['marketStatus', 'Trạng thái thị trường']] as const
export type Group = typeof groups[number][0]
export const normalizeText = (text: string) => text.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim()
export function groupValue(car: Car, key: Group) { return (key === 'marketStatus' ? car.marketStatusVn : car[key]) || '' }
export function priceError(min: string, max: string) {
  if ([min, max].some(x => x !== '' && (!Number.isSafeInteger(Number(x)) || Number(x) < 0))) return 'Giá phải là số nguyên VND không âm.'
  if (min !== '' && max !== '' && Number(min) > Number(max)) return 'Giá tối thiểu không được lớn hơn giá tối đa.'
  return ''
}
export function updateQuery(params: URLSearchParams, key: string, values: string[]) {
  const next = new URLSearchParams(params)
  next.delete(key)
  values.filter(Boolean).forEach(value => next.append(key, value))
  if (key !== 'page') next.set('page', '1')
  return next
}
export function selectCars(cars: Car[], params: URLSearchParams) {
  const query = normalizeText(params.get('query') || '')
  const min = params.get('minPrice') || '', max = params.get('maxPrice') || ''
  const invalidPrice = priceError(min, max)
  const seats = Number(params.get('seats'))
  const filtered = cars.filter(car => {
    if (query && !normalizeText([car.displayName, car.brand, ...car.aliases].join(' ')).includes(query)) return false
    if (groups.some(([key]) => { const values = params.getAll(key).filter(Boolean); return values.length > 0 && !values.some(v => normalizeText(v) === normalizeText(groupValue(car, key))) })) return false
    if (seats > 0 && car.seats !== seats) return false
    if (!invalidPrice && (min !== '' || max !== '')) {
      if (car.priceVndFrom == null) return false
      if (min !== '' && car.priceVndFrom < Number(min)) return false
      if (max !== '' && car.priceVndFrom > Number(max)) return false
    }
    return true
  })
  const rank = (car: Car) => normalizeText(car.displayName) === query ? 0 : normalizeText(car.displayName).startsWith(query) ? 1 : 2
  const sort = params.get('sort') || 'relevance'
  filtered.sort((a, b) => {
    const name = a.displayName.localeCompare(b.displayName, 'vi')
    if (sort === 'price_asc' || sort === 'price_desc') {
      if (a.priceVndFrom == null || b.priceVndFrom == null) return a.priceVndFrom == null ? b.priceVndFrom == null ? name : 1 : -1
      return (a.priceVndFrom - b.priceVndFrom) * (sort === 'price_desc' ? -1 : 1) || name
    }
    return sort === 'name_asc' || !query ? name : rank(a) - rank(b) || name
  })
  const requestedSize = Number(params.get('pageSize'))
  const pageSize = [12, 24, 48].includes(requestedSize) ? requestedSize : 12
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize))
  const requestedPage = Number(params.get('page'))
  const page = Math.min(pageCount, Math.max(1, Number.isSafeInteger(requestedPage) ? requestedPage : 1))
  return { items: filtered.slice((page - 1) * pageSize, page * pageSize), total: filtered.length, page, pageSize, pageCount, invalidPrice }
}
