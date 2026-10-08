export function isOrderQuestion(text: string, orderContext = false) {
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  if (/\baw-[a-z0-9-]+\b|\bdon\b|order|thanh toan|tien coc|khoan coc|giao dich|hoan tien|doi lich|lich giao|giao xe|nhan xe|ban giao|giay to|ho so|phieu ho tro|nhan vien ho tro/.test(t)) return true;
  if (/con phai tra|con no|da tra|da thu/.test(t)) return true;
  if (/thong tin ca nhan|doi mat khau|bao mat|yeu cau mua|lich hen|lai thu|yeu thich|thong bao/.test(t)) return true;
  if (/xe (do|nay)|trong anh|trong hinh|tu van|so sanh|gia xe|mau xe|ngan sach|toyota|honda|mazda|hyundai|kia|vinfast|ford|mercedes|bmw/.test(t)) return false;
  if (/tien do|trang thai/.test(t)) return true;
  return orderContext && /tien do|trang thai|con phai|con no|da tra|da thu|bao nhieu|khi nao|buoc tiep|can lam gi|bao hanh|con thieu|thi sao/.test(t);
}
import { apiPost } from '../../shared/api/client'

export type QuestionUnderstanding = { question: string; route: 'catalogue' | 'orders' | 'clarification'; needsClarification: boolean; clarification?: string | null }
export function understandQuestion(question: string, context: object) {
  return apiPost<QuestionUnderstanding, { question: string; context: object }>('/api/chat/understand', { question, context })
}
