import re
import unicodedata
from decimal import Decimal
from app.application.rag.contracts import QueryAnalysis, RagFilters


def normalize(value: str) -> str:
    value = unicodedata.normalize("NFD", value.lower().replace("đ", "d"))
    return " ".join("".join(c for c in value if unicodedata.category(c) != "Mn").split())


def merge_filters(parsed: RagFilters, explicit: RagFilters | None) -> RagFilters:
    values = parsed.model_dump(by_alias=False)
    if explicit:
        changes = explicit.model_dump(by_alias=False, exclude_unset=True, exclude_none=True)
        values.update(changes)
        for bound in ("min", "max"):
            if f"{bound}_price" in changes and f"{bound}_price_inclusive" not in changes:
                values[f"{bound}_price_inclusive"] = True
    return RagFilters(**values)


def matches_filters(car, filters: RagFilters) -> bool:
    for key in ("brand", "body_type", "fuel_type", "transmission", "seats"):
        wanted, actual = getattr(filters, key), getattr(car, key)
        if wanted is not None and normalize(str(wanted)) != normalize(str(actual)):
            return False
    price = car.price_vnd_from if car.price_source_id else None
    for bound in ("min", "max"):
        value = getattr(filters, f"{bound}_price")
        if value is not None:
            if price is None:
                return False
            inclusive = getattr(filters, f"{bound}_price_inclusive")
            if bound == "min" and (price < value or (price == value and not inclusive)):
                return False
            if bound == "max" and (price > value or (price == value and not inclusive)):
                return False
    return True


async def analyze(question: str, catalogue, classifier=None) -> QueryAnalysis:
    question = " ".join(question.split())
    q = normalize(question)
    result = QueryAnalysis(question=question)
    filters = {}
    brands = sorted({c.brand for c in catalogue}, key=len, reverse=True)
    mentioned_brands = [b for b in brands if re.search(r"(?<!\w)" + re.escape(normalize(b)) + r"(?!\w)", q)]
    if len(mentioned_brands) == 1:
        filters["brand"] = mentioned_brands[0]
    synonyms = {
        "body_type": {"SUV": ["suv", "gam cao"], "Sedan": ["sedan"], "Hatchback": ["hatchback"],
                      "MPV": ["mpv"], "Pickup": ["pickup", "ban tai"]},
        "fuel_type": {"Petrol": ["xang"], "Diesel": ["diesel", "may dau"],
                      "Electric": ["xe dien", "electric"], "Hybrid": ["hybrid", "lai xang dien"]},
        "transmission": {"Automatic": ["so tu dong", "automatic"], "Manual": ["so san", "manual"], "CVT": ["cvt"]},
        "city": {"Hanoi": ["ha noi", "hanoi"], "Ho Chi Minh City": ["ho chi minh", "tp.hcm", "tphcm", "sai gon"],
                 "Da Nang": ["da nang"], "Hai Phong": ["hai phong"], "Can Tho": ["can tho"]},
    }
    for field, mapping in synonyms.items():
        candidates = [(m.start(), m.end(), v) for v, words in mapping.items() for w in words
                      for m in re.finditer(r"(?<!\w)" + re.escape(w) + r"(?!\w)", q)]
        selected_aliases = []
        for start, end, value in sorted(candidates, key=lambda item: -(item[1] - item[0])):
            if not any(start < b and end > a for a, b, _ in selected_aliases):
                selected_aliases.append((start, end, value))
        values = list(dict.fromkeys(v for _, _, v in selected_aliases))
        if len(values) == 1:
            filters[field] = values[0]
        elif len(values) > 1:
            result.ambiguities.append(f"Có nhiều điều kiện {field}; vui lòng chọn một.")
    seats = re.findall(r"\b(\d{1,2})\s*(?:cho|ghe)\b", q)
    if seats:
        if len(set(seats)) > 1 or int(seats[0]) == 0:
            result.ambiguities.append("Vui lòng xác định số chỗ cần tìm.")
        else:
            filters["seats"] = int(seats[0])
    amount = r"(\d{1,3}(?:[.,]\d{3}){2,}|\d+(?:[.,]\d+)?)\s*(ty|trieu|tr|vnd|dong)?\b"
    def money(number, unit):
        factor = {"ty": 10**9, "trieu": 10**6, "tr": 10**6}.get(unit, 1)
        if number.count(".") + number.count(",") > 1 or (unit in {"dong", "vnd", None} and re.fullmatch(r"\d{1,3}[.,]\d{3}", number)):
            number = number.replace(".", "").replace(",", "")
        return int(Decimal(number.replace(",", ".")) * factor)
    interval = re.search(r"(?:tu|khoang)\s*" + amount + r"\s*(?:den|[-–])\s*" + amount, q)
    if interval and (interval.group(2) or interval.group(4)):
        a, u, b, v = interval.groups()
        filters.update(min_price=money(a, u or v), max_price=money(b, v or u))
    for field, patterns in (
        ("max", [(r"(?:khong qua|toi da|<=)\s*", True), (r"(?:duoi|it hon|<)\s*", False)]),
        ("min", [(r"(?:it nhat|toi thieu|>=)\s*", True), (r"(?:tren|hon|>)\s*", False)]),
    ):
        matches = []
        for pattern, inclusive in patterns:
            for m in re.finditer(pattern + amount, q):
                # Units are mandatory unless the question explicitly supplies a budget
                # and a full VND amount. Seats/hp/km/year are never currency.
                trailing = q[m.end():].lstrip()
                if re.match(r"(?:cho|ghe|hp|km|mm|nam|thang)\b", trailing):
                    continue
                if m.group(2) or (any(w in q for w in ("ngan sach", "gia")) and money(m.group(1), None) >= 1000000):
                    matches.append((money(*m.groups()), inclusive))
        if matches:
            if len(set(matches)) > 1:
                result.ambiguities.append("Có nhiều giới hạn giá khác nhau.")
            filters[f"{field}_price"], filters[f"{field}_price_inclusive"] = matches[0]
    result.filters = RagFilters(**filters)
    if result.filters.min_price is not None and result.filters.max_price is not None:
        if result.filters.min_price > result.filters.max_price or (result.filters.min_price == result.filters.max_price and
                not (result.filters.min_price_inclusive and result.filters.max_price_inclusive)):
            result.ambiguities.append("Khoảng giá không có giá trị phù hợp.")

    matches = []
    for c in catalogue:
        model_name = re.sub(r"\s+(?:19|20)\d{2}\b", "", c.display_name)
        short_name = re.sub(r"^" + re.escape(c.brand) + r"\s+", "", model_name, flags=re.I)
        for name in {c.display_name, model_name, short_name, *c.aliases}:
            n = normalize(name)
            if len(n) >= 3:
                for m in re.finditer(r"(?<!\w)" + re.escape(n) + r"(?!\w)", q):
                    matches.append((m.start(), m.end(), c.car_id))
    selected = []
    for start, end, cid in sorted(matches, key=lambda item: (-(item[1] - item[0]), item[0], item[2])):
        overlapping = [(a, b, c) for a, b, c in selected if start < b and end > a]
        if not overlapping:
            selected.append((start, end, cid))
        elif any(a == start and b == end and c != cid for a, b, c in overlapping):
            result.ambiguities.append("Tên xe khớp nhiều mẫu; vui lòng ghi rõ hãng và model.")
    result.car_ids = list(dict.fromkeys(cid for _, _, cid in sorted(selected)))
    if "so sanh" in q or "compare" in q:
        result.intent = "compare_cars"
        if len(result.car_ids) < 2:
            result.ambiguities.append("Vui lòng nêu ít nhất hai mẫu xe để so sánh.")
        if len(result.car_ids) > 3:
            result.ambiguities.append("MVP hỗ trợ so sánh tối đa ba mẫu xe.")
        result.filters.brand = None  # A brand mentioned as a subject is not a filter across compared cars.
    elif "dai ly" in q:
        result.intent = "find_dealer"
    elif "bao hanh" in q:
        result.intent = "ask_warranty"
    elif any(w in q for w in ("tim xe", "tim ", "loc xe", "ngan sach", "tu van")):
        result.intent = "find_car"
    elif re.search(r"\b(gia|bao nhieu tien)\b", q) and (result.car_ids or not any(w in q for w in ("duoi", "gia dinh"))):
        result.intent = "ask_price"
    elif any(w in q for w in ("thong so", "dong co", "kich thuoc", "cong suat", "tieu hao", "xe nay", "trong anh", "trong hinh")) or result.car_ids:
        result.intent = "ask_specification"
    elif filters or any(w in q for w in ("tim xe", "tu van", "gia dinh", "ngan sach", "suv", "sedan", "cho", "xe dien")):
        result.intent = "find_car"
    elif classifier:
        try:
            result.intent = await classifier.classify(question)
        except (ValueError, TimeoutError, OSError):
            pass
    if result.car_ids and result.intent != "find_car" and not any(w in q for w in ("tim xe", "loc xe", "ngan sach")):
        # Attribute questions about a named model must not filter that model away.
        for field in ("body_type", "seats", "fuel_type", "transmission", "min_price", "max_price"):
            setattr(result.filters, field, None)
    if catalogue and not result.car_ids and result.intent in {"ask_price", "ask_specification", "ask_warranty"}:
        residue = q
        for brand in mentioned_brands:
            residue = re.sub(r"(?<!\w)" + re.escape(normalize(brand)) + r"(?!\w)", " ", residue)
        neutral = set("xe o to hang cua gia bao nhieu tien co la khong nao hien nay tham khao thong so ky thuat dong cong suat kich thuoc bao hanh lau nam thang duoc chinh sach tai viet ban phien cho toi hoi ve cac model trong anh hinh nay gi".split())
        unknown = [w for w in re.findall(r"[\w-]+", residue) if w not in neutral and not w.isdigit()]
        if unknown:
            result.ambiguities.append("Chưa xác định được mẫu xe trong catalogue; vui lòng ghi rõ tên model có dữ liệu.")
    if re.search(r"\b(?:19|20)\d{2}\b|\bphien ban\b|\bban\s+(?:g|e|l|rs|luxury)\b", q):
        result.limitations.append("Dữ liệu ở cấp model, chưa xác minh năm/phiên bản cụ thể.")
    return result
