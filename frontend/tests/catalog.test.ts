import { describe, it, expect } from 'vitest'
import { selectCars, updateQuery, priceError } from '../src/features/car-search/catalog'
import { toggleSelection } from '../src/features/car-compare/hooks'
import { car } from './fixtures'
const cars = [car('1', { displayName: 'Đô thị', priceVndFrom: 100, brand: 'Toyota' }), car('2', { displayName: 'Honda Đô thị', priceVndFrom: 200, brand: 'Honda', seats: 7 }), car('3', { displayName: 'Đô thị Plus', priceVndFrom: null, brand: 'Mazda' })]
describe('catalogue', () => {
  it('matches accents and ranks exact name before prefix and substring', () => expect(selectCars(cars, new URLSearchParams('query=DO THI')).items.map(c => c.carId)).toEqual(['1', '3', '2']))
  it('uses OR within groups and AND across groups', () => expect(selectCars(cars, new URLSearchParams('brand=Toyota&brand=Honda&seats=7')).items.map(c => c.carId)).toEqual(['2']))
  it('keeps unknown prices without a price range', () => expect(selectCars(cars, new URLSearchParams()).total).toBe(3))
  it.each(['price_asc', 'price_desc'])('sorts null prices last with %s', sort => expect(selectCars(cars, new URLSearchParams({ sort })).items.at(-1)?.carId).toBe('3'))
  it('excludes unknown prices when filtering, including zero', () => {
    expect(selectCars(cars, new URLSearchParams('minPrice=0')).total).toBe(2)
    expect(selectCars(cars, new URLSearchParams('maxPrice=150')).items.map(c => c.carId)).toEqual(['1'])
  })
  it('validates price ranges', () => { expect(priceError('-1', '')).not.toBe(''); expect(priceError('200', '100')).not.toBe(''); expect(priceError('1.5', '')).not.toBe(''); expect(priceError('0', '0')).toBe('') })
  it('paginates and clamps invalid page values', () => {
    const many = Array.from({ length: 25 }, (_, i) => car(String(i)))
    expect(selectCars(many, new URLSearchParams('page=2')).items).toHaveLength(12)
    expect(selectCars(many, new URLSearchParams('page=999')).items).toHaveLength(1)
    expect(selectCars(many, new URLSearchParams('page=-2&pageSize=3')).page).toBe(1)
    expect(selectCars(many, new URLSearchParams('pageSize=24')).items).toHaveLength(24)
  })
  it('preserves repeated URL filters and resets page only for filter changes', () => {
    const params = new URLSearchParams('brand=Honda&brand=Toyota&page=3')
    expect(updateQuery(params, 'fuelType', ['Petrol']).get('page')).toBe('1')
    expect(updateQuery(params, 'page', ['2']).getAll('brand')).toEqual(['Honda', 'Toyota'])
    expect(params.get('page')).toBe('3')
  })
  it('prevents the fourth comparison selection and allows removal', () => {
    expect(toggleSelection(['1', '2', '3'], '4').ids).toEqual(['1', '2', '3'])
    expect(toggleSelection(['1', '2', '3'], '4').message).not.toBe('')
    expect(toggleSelection(['1', '2', '3'], '2').ids).toEqual(['1', '3'])
  })
})
