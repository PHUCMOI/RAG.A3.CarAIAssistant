import { expect, it } from 'vitest'
import { carQuestionPayload } from '../src/features/chat/carContext'

const cars = [{ carId: 'car_34_3', displayName: 'Honda CR-V' }]
it('carries the remembered image car into a follow-up without restricting comparisons', () => {
  expect(carQuestionPayload('Xe đó giá bao nhiêu?', cars)).toEqual({ question: 'Xe đó giá bao nhiêu? (Xe đang trao đổi: Honda CR-V)', carIds: ['car_34_3'] })
  expect(carQuestionPayload('So sánh xe đó với Toyota RAV4.', cars)).toEqual({ question: 'So sánh xe đó với Toyota RAV4. (Xe đang trao đổi: Honda CR-V)' })
  expect(carQuestionPayload('Toyota RAV4 giá bao nhiêu?', cars)).toEqual({ question: 'Toyota RAV4 giá bao nhiêu?' })
  expect(carQuestionPayload('Xe đó giá bao nhiêu?')).toEqual({ question: 'Xe đó giá bao nhiêu?' })
})

it('replays the previous comparison on a short confirmation', () => {
  expect(carQuestionPayload('đúng', undefined, 'so sánh tucson và xe hrv')).toEqual({ question: 'so sánh tucson và xe hrv' })
})
