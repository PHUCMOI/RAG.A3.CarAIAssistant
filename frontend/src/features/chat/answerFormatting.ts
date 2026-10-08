// Presentation only: preserve values and qualifications from the verified answer.
export function formatAnswer(content: string) {
  const output: string[] = []
  let subject = ''
  let carSubject = ''
  let fenced = false
  for (const line of content.replace(/\r\n/g, '\n').split('\n')) {
    if (/^\s*```/.test(line)) { fenced = !fenced; output.push(line); continue }
    if (fenced || /^\s*(?:#|[-*+]\s|\d+[.)]\s|\||>)/.test(line)) { output.push(line); subject = ''; continue }
    const attribute = line.match(/^(.{1,100}?) — ([^:]{1,45}): (.+)$/)
    const price = line.match(/^(.{1,100}?) có giá tham khảo từ (.+)\.$/)
    const seats = line.match(/^(.{1,100}?) có (\d+ chỗ)\.$/)
    const name = attribute?.[1] || price?.[1] || seats?.[1]
    if (name) {
      carSubject = name
      if (subject !== name) { output.push('', `### ${name}`); subject = name }
      output.push(`${attribute?.[2] || (price ? 'Giá tham khảo từ' : 'Số chỗ')}: ${attribute?.[3] || price?.[2] || seats?.[2]}`)
      continue
    }
    if (/^(Thông số tham khảo của|Giá tham khảo của|Thông tin bảo hành của|Bảo hành tham khảo của) .+\.$/.test(line)) {
      carSubject = line.replace(/^(Thông số tham khảo của|Giá tham khảo của|Thông tin bảo hành của|Bảo hành tham khảo của) /, '').replace(/\.$/, '')
      output.push('', `### ${line.slice(0, -1)}`); subject = ''; continue
    }
    if (/^(Đây là giá tham khảo|Thông số trong database|Cần xác nhận điều kiện bảo hành)/.test(line)) {
      output.push('', `> ${line}`); subject = ''; continue
    }
    if (/^(Được ghi nhận phân phối|Từng phân phối chính hãng|Có mặt qua nhập khẩu|Chưa xác minh tình trạng thị trường)/.test(line)) {
      output.push('', `> ${carSubject ? carSubject + ': ' : ''}${line}`); subject = ''; continue
    }
    if (/^.{1,100}: (Được ghi nhận phân phối|Từng phân phối chính hãng|Có mặt qua nhập khẩu|Chưa xác minh tình trạng thị trường)/.test(line)) {
      output.push('', `> ${line}`); subject = ''; continue
    }
    output.push(line)
    if (line.trim()) subject = ''
  }
  return output.join('\n')
}

function carFacts(content: string) {
  const names = new Set<string>()
  let fenced = false
  for (const line of content.split('\n')) {
    if (/^\s*```/.test(line)) { fenced = !fenced; continue }
    if (fenced) continue
    const name = line.match(/^(.{1,100}?) — [^:]{1,45}: .+$/)?.[1]
      || line.match(/^(.{1,100}?) có (?:giá tham khảo từ .+|\d+ chỗ)\.$/)?.[1]
      || line.match(/^(?:Thông số tham khảo của|Giá tham khảo của|Thông tin bảo hành của|Bảo hành tham khảo của) (.+)\.$/)?.[1]
    if (name) names.add(name)
  }
  if (!names.size) return null
  const lines = formatAnswer(content).split('\n')
  const facts = new Map<string, Map<string, string[]>>()
  const consumed = new Set<number>()
  let subject: string | undefined
  let heading = -1
  for (let index = 0; index < lines.length; index++) {
    const title = lines[index].match(/^### (.+)$/)?.[1]
    if (title) {
      subject = [...names].find(name => title === name || ['Thông số tham khảo của ', 'Giá tham khảo của ', 'Thông tin bảo hành của ', 'Bảo hành tham khảo của '].some(prefix => title === prefix + name))
      heading = index
      continue
    }
    const field = lines[index].match(/^([\p{L}][\p{L}\d ()/–-]{1,44}):\s+(.+)$/u)
    if (subject && field) {
      const values = facts.get(subject) || new Map<string, string[]>()
      const label = ({ 'Giá từ': 'Giá tham khảo từ', 'Thời hạn': 'Thời hạn bảo hành', 'Giới hạn quãng đường': 'Giới hạn bảo hành' } as Record<string, string>)[field[1]] || field[1]
      const value = formatFactValue(label, field[2])
      const existing = values.get(label) || []
      if (!existing.includes(value)) existing.push(value)
      values.set(label, existing); facts.set(subject, values)
      consumed.add(index); consumed.add(heading)
    } else if (lines[index].trim()) subject = undefined
  }
  if (!facts.size) return null
  const cars = [...facts.keys()]
  const labels = [...new Set([...facts.values()].flatMap(fields => [...fields.keys()]))]
  return { cars, rows: labels.map(label => ({ label, values: cars.map(car => facts.get(car)!.get(label)?.join(' / ') || 'Chưa có dữ liệu trong câu trả lời') })), remaining: lines.filter((_, index) => !consumed.has(index)).join('\n') }
}

export function formatFactValue(label: string, value: string) {
  const clean = value.trim().replace(/\.+$/, '')
  if (/giá/i.test(label) && /^\d[\d.,]*\s+VND$/i.test(clean)) {
    const digits = clean.replace(/\s+VND$/i, '').replace(/[.,]/g, '')
    return `${digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.')} ₫`
  }
  if (/ngày/i.test(label) && /^\d{4}-\d{2}-\d{2}$/.test(clean)) return clean.split('-').reverse().join('/')
  if (/giới hạn/i.test(label) && /^\d+ km$/.test(clean)) return clean.replace(/\d+/, digits => digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.'))
  return clean
}

export function comparisonFacts(content: string) {
  const result = carFacts(content)
  return result && result.cars.length > 1 ? result : null
}

export function singleCarFacts(content: string) {
  const result = carFacts(content)
  if (!result || result.cars.length !== 1) return null
  const recognition = result.remaining.match(/^Xe gần giống nhất trong ảnh: \*\*(.+?)\*\* \(độ tương đồng ([\d.,]+)%\)\.?$/m)
  const normalize = (value: string) => value.trim().replace(/\.+$/, '').replace(/\s+/g, ' ')
  const values = new Set(result.rows.flatMap(row => row.values.map(normalize)))
  const remaining = (recognition ? result.remaining.replace(recognition[0], '') : result.remaining).split('\n').filter(line => !values.has(normalize(line))).join('\n')
  return { ...result, similarity: recognition?.[2], remaining }
}
