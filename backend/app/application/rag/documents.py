import hashlib
import json
from app.application.rag.contracts import Document

STATUS = {"official_current": "Được ghi nhận phân phối chính hãng theo dữ liệu đã kiểm tra.",
          "official_historical": "Từng phân phối chính hãng; chưa xác nhận đang bán.",
          "present_via_import": "Có mặt qua nhập khẩu; không khẳng định phân phối chính hãng."}
ENUMS = {"Petrol": "Xăng", "Diesel": "Dầu", "Electric": "Điện", "Hybrid": "Hybrid",
         "Automatic": "Tự động", "Manual": "Số sàn", "SUV": "SUV", "Pickup": "Bán tải"}
CONDITIONS = {
    "Basic new-vehicle warranty; whichever limit comes first. Extended programs have separate conditions.": "Bảo hành xe mới cơ bản, giới hạn nào đến trước áp dụng trước. Chương trình gia hạn có điều kiện riêng.",
    "Standard reference policy; whichever limit comes first. Confirm eligibility by VIN and sale date.": "Chính sách tham khảo tiêu chuẩn, giới hạn nào đến trước áp dụng trước. Xác nhận theo VIN và ngày bán.",
    "Applies to Mazda vehicles sold in Vietnam from 2023-10-01; whichever limit comes first.": "Áp dụng cho xe Mazda bán tại Việt Nam từ 01/10/2023; giới hạn nào đến trước áp dụng trước.",
    "Applies from 2023-10-01; whichever limit comes first. Model-specific exclusions may apply.": "Áp dụng từ 01/10/2023; giới hạn nào đến trước áp dụng trước. Có thể có ngoại lệ theo model.",
    "Reference policy for locally assembled Hyundai passenger vehicles distributed by Hyundai Thanh Cong; imported vehicles may differ.": "Chính sách tham khảo cho xe du lịch Hyundai lắp ráp trong nước do Hyundai Thành Công phân phối; xe nhập khẩu có thể khác.",
    "Standard new-vehicle warranty; selected models may receive up to 60 months or 150,000 km. Confirm by model and VIN.": "Bảo hành xe mới tiêu chuẩn; một số model có thể được 60 tháng hoặc 150.000 km. Xác nhận theo model và VIN.",
    "Standard manufacturer warranty; extended warranty is a separate program.": "Bảo hành tiêu chuẩn của hãng; bảo hành mở rộng là chương trình riêng.",
    "New-vehicle warranty; whichever limit comes first. Confirm eligibility by sale date and VIN.": "Bảo hành xe mới, giới hạn nào đến trước áp dụng trước. Xác nhận theo ngày bán và VIN.",
    "Standard automobile warranty; whichever limit comes first. Hybrid components and extended coverage use separate limits.": "Bảo hành ô tô tiêu chuẩn, giới hạn nào đến trước áp dụng trước. Linh kiện hybrid và bảo hành mở rộng có giới hạn riêng.",
    "whichever limit comes first": "Giới hạn nào đến trước áp dụng trước.",
    "Confirm eligibility by VIN and sale date.": "Xác nhận điều kiện áp dụng theo VIN và ngày bán.",
}


def make_document(document_id, car_id, section, lines, facts, metadata, source_id=None):
    metadata = dict(metadata, schemaVersion=1, templateVersion="vi-v1", facts=facts,
                    sourceIds=sorted({v["sourceId"] for v in facts.values() if v.get("sourceId")}))
    content = "\n".join(lines)
    payload = json.dumps([document_id, "vi-v1", content, metadata], sort_keys=True, ensure_ascii=False, default=str)
    return Document(document_id, car_id, section, content, source_id, metadata,
                    hashlib.sha256(payload.encode("utf-8")).hexdigest())


def build_documents(cars, warranties, dealers):
    documents = []
    for c in sorted(cars, key=lambda c: c.car_id):
        common = {"entityType": "car", "entityId": c.car_id, "brand": c.brand, "displayName": c.display_name,
                  "bodyType": c.body_type, "fuelType": c.fuel_type, "transmission": c.transmission,
                  "seats": c.seats, "marketStatusVn": c.market_status_vn}
        identity = {"display_name": {"value": c.display_name, "sourceId": c.presence_source_id}}
        overview = dict(identity, market_status_vn={"value": c.market_status_vn, "sourceId": c.presence_source_id})
        documents.append(make_document(f"car:{c.car_id}:overview:v1", c.car_id, "overview",
            [f"Xe: {c.display_name}. Hãng: {c.brand}.", f"Tên khác: {', '.join(c.aliases) or 'Chưa có dữ liệu'}.",
             STATUS.get(c.market_status_vn, "Chưa xác minh tình trạng thị trường.")], overview,
            dict(common, marketStatusVn=c.market_status_vn), c.presence_source_id))
        lines, facts = [f"Thông số tham khảo của {c.display_name}."], {}
        for field, label, unit in [("body_type", "Kiểu xe", None), ("seats", "Số chỗ", "chỗ"),
            ("fuel_type", "Nhiên liệu", None), ("transmission", "Hộp số", None), ("engine", "Động cơ", None),
            ("engine_power_hp", "Công suất", "hp"), ("length_mm", "Dài", "mm"), ("width_mm", "Rộng", "mm"),
            ("height_mm", "Cao", "mm"), ("wheelbase_mm", "Chiều dài cơ sở", "mm")]:
            value = getattr(c, field)
            lines.append(f"{label}: {ENUMS.get(value, value) if value is not None else 'Chưa có dữ liệu'}{(' ' + unit) if value is not None and unit else ''}.")
            if value is not None:
                facts[field] = {"value": value, "unit": unit, "sourceId": None}
        lines.append("Thông số trong database chủ yếu từ DVM-CAR thị trường Anh; không xác nhận phiên bản kỹ thuật tại Việt Nam. Trường chưa có nguồn riêng chỉ dẫn tới bản ghi dữ liệu.")
        documents.append(make_document(f"car:{c.car_id}:specifications:v1", c.car_id, "specifications", lines, facts, common))
        price_facts, lines = {}, [f"Giá tham khảo của {c.display_name}."]
        if c.price_vnd_from is not None and c.price_source_id:
            price_facts = {"price_vnd_from": {"value": c.price_vnd_from, "unit": "VND", "sourceId": c.price_source_id}}
            lines.append(f"Giá từ: {c.price_vnd_from} VND.")
            if c.price_as_of:
                price_facts["price_as_of"] = {"value": c.price_as_of, "sourceId": c.price_source_id}
                lines.append(f"Ngày giá tham khảo: {c.price_as_of}.")
            lines.append("Đây là giá tham khảo từ dữ liệu, không phải báo giá đại lý theo thời gian thực.")
        else:
            lines.append("Chưa có dữ liệu giá Việt Nam có nguồn.")
        lines.append(STATUS.get(c.market_status_vn, "Chưa xác minh tình trạng thị trường."))
        documents.append(make_document(f"car:{c.car_id}:price:v1", c.car_id, "price", lines, price_facts,
            dict(common, priceVndFrom=c.price_vnd_from if c.price_source_id else None, marketStatusVn=c.market_status_vn), c.price_source_id))
        policies = [w for w in warranties if w.car_id == c.car_id] or [w for w in warranties if w.car_id is None and w.brand_name == c.brand]
        policy = sorted(policies, key=lambda w: w.warranty_id)[0] if policies else None
        documents.append(warranty_document(f"warranty:car:{c.car_id}:v1", c.car_id, c.display_name, policy, common))
    for w in sorted(warranties, key=lambda w: w.warranty_id):
        if w.car_id is None:
            documents.append(warranty_document(f"warranty:brand:{w.brand_name.lower()}:v1", None,
                w.brand_name, w, {"entityType": "warranty", "entityId": w.warranty_id, "brand": w.brand_name}))
    for d in sorted(dealers, key=lambda d: d.dealer_id):
        facts = {key: {"value": getattr(d, key), "sourceId": d.source_id} for key in ("name", "address", "city", "phone", "website") if getattr(d, key) is not None}
        documents.append(make_document(f"dealer:{d.dealer_id}:profile:v1", None, "dealer",
            [f"Đại lý: {d.name}. Hãng: {', '.join(d.supported_brands)}.", f"Thành phố: {d.city}. Địa chỉ: {d.address}.",
             f"Điện thoại: {d.phone or 'Chưa có dữ liệu'}. Website: {d.website or 'Chưa có dữ liệu'}.", f"Ngày kiểm tra: {d.checked_at}."],
            facts, {"entityType": "dealer", "entityId": d.dealer_id, "brands": d.supported_brands, "city": d.city}, d.source_id))
    return documents


def warranty_document(document_id, car_id, name, w, metadata):
    lines, facts = [f"Bảo hành tham khảo của {name}."], {}
    if w and w.source_id:
        for field, label, unit in (("duration_months", "Thời hạn", "tháng"), ("distance_limit_km", "Giới hạn quãng đường", "km")):
            value = getattr(w, field)
            if value is not None:
                lines.append(f"{label}: {value} {unit}.")
                facts[field] = {"value": value, "unit": unit, "sourceId": w.source_id}
        if w.conditions:
            translated = CONDITIONS.get(w.conditions, "Điều kiện nguồn (nguyên văn): " + w.conditions)
            lines.append(translated)
            facts["conditions"] = {"value": translated, "sourceId": w.source_id}
        if w.car_id is None:
            lines.append("Đây là chính sách theo hãng; cần xác nhận áp dụng cho xe, VIN và ngày bán cụ thể.")
    else:
        lines.append("Chưa có dữ liệu bảo hành có nguồn.")
    metadata = dict(metadata, policyConditions=facts.get("conditions", {}).get("value"),
                    policyScope="car" if w and w.car_id else "brand")
    return make_document(document_id, car_id, "warranty", lines, facts, metadata, w.source_id if w else None)
