import type { CatalogContext } from './storage'

export function carQuestionPayload(question: string, contexts?: CatalogContext[], previousQuestion?: string) {
  const normalized = question.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd')
  if (/^(dung|dung roi|vang|ok|chinh xac|yes)[.! ]*$/.test(normalized) && previousQuestion) {
    return { question: previousQuestion, ...(contexts?.length ? { carIds: contexts.map(c => c.carId) } : {}) }
  }
  const refersToCar = /xe (do|nay)|mau (do|nay)|trong anh|trong hinh/.test(normalized)
  if (!refersToCar || !contexts?.length) return { question }
  const contextualQuestion = `${question} (Xe đang trao đổi: ${contexts[0].displayName})`
  // A comparison needs both the remembered car and the explicitly named car;
  // restricting carIds to the remembered one would remove the other subject.
  return /so sanh|compare/.test(normalized)
    ? { question: contextualQuestion }
    : { question: contextualQuestion, carIds: [contexts[0].carId] }
}
