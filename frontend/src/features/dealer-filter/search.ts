import type { Dealer } from '../../entities/dealer/model'
import { normalizeText } from '../car-search/catalog'

export function cityLabel(value: string) {
  const key = normalizeText(value).replace(/[.,]/g, '')
  if (['hanoi', 'ha noi'].includes(key)) return 'Hà Nội'
  if (key === 'da nang') return 'Đà Nẵng'
  if (['ho chi minh city', 'ho chi minh', 'tp ho chi minh', 'tp hcm', 'hcmc'].includes(key)) return 'TP. Hồ Chí Minh'
  return value
}
export function filterDealers(dealers: Dealer[], params: URLSearchParams) {
  const brand = params.get('brand') || '', city = params.get('city') || '', query = normalizeText(params.get('query') || '')
  return dealers.filter(dealer => (!brand || dealer.supportedBrands.includes(brand))
    && (!city || normalizeText(cityLabel(dealer.city)) === normalizeText(cityLabel(city)))
    && (!query || normalizeText([dealer.name, dealer.address, dealer.city, cityLabel(dealer.city), ...dealer.supportedBrands].join(' ')).includes(query)))
    .sort((a, b) => (params.get('sort') === 'city_asc' ? cityLabel(a.city).localeCompare(cityLabel(b.city), 'vi') : 0) || a.name.localeCompare(b.name, 'vi'))
}
export function dealerWebsite(value?: string | null) {
  if (!value) return null
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) ? url.href : null } catch { return null }
}
