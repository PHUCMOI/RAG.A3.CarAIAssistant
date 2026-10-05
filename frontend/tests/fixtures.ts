import type { Car } from '../src/entities/car/model'
export const car = (id: string, fields: Partial<Car> = {}): Car => ({ carId: id, genmodelId: id, brand: 'Toyota', displayName: `Xe ${id}`, description: 'Mẫu xe thử nghiệm', aliases: [], marketStatusVn: 'official', missingFields: [], imageCount: 0, presenceSourceId: 'source-presence', seats: 5, bodyType: 'SUV', ...fields })
export function json(body: unknown, status = 200) { return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }) }
