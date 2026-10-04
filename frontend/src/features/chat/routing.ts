export function isOrderQuestion(text: string, orderContext = false) {
  const t = text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
  if (/\baw-[a-z0-9-]+\b|\bdon\b|order|thanh toan|tien coc|khoan coc|giao dich|hoan tien|doi lich|lich giao|giao xe|nhan xe|ban giao|giay to|ho so|phieu ho tro|nhan vien ho tro/.test(t)) return true;
  return orderContext && /tien do|trang thai|con phai|con no|da tra|da thu|bao nhieu|khi nao|buoc tiep|can lam gi|bao hanh|con thieu|thi sao/.test(t);
}
