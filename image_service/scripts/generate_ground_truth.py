"""Generate 50 Ground Truth samples (Q101–Q150) for Member 3.

Công việc I:
- 25 mẫu nhận diện ảnh thuần túy (Q101 -> Q125)
- 15 mẫu ảnh kèm câu hỏi văn bản (Q126 -> Q140)
- 10 mẫu trường hợp khó / edge cases (Q141 -> Q150)
Xuất ra image_service/eval/ground_truth_member3.jsonl và image_service/eval/ground_truth_member3.csv.
"""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")

SERVICE_DIR = Path(__file__).resolve().parents[1]
PROJECT_ROOT = Path(__file__).resolve().parents[2]

EVAL_DIR = SERVICE_DIR / "eval"
EVAL_DIR.mkdir(parents=True, exist_ok=True)

CARS_JSON = SERVICE_DIR / "data" / "cars.json"
if not CARS_JSON.exists():
    CARS_JSON = PROJECT_ROOT / "data" / "cars.json"


def generate_ground_truth():
    with open(CARS_JSON, "r", encoding="utf-8") as f:
        cars = json.load(f)
    car_by_id = {c["car_id"]: c for c in cars}

    samples = []

    # 1. 25 Mẫu nhận diện ảnh thuần túy (Q101 - Q125)
    pure_image_cars = [
        ("car_92_44", "images/car_92_44/Toyota$$Yaris$$2000$$Blue$$92_44$$1362$$image_0.jpg"),
        ("car_92_30", "images/car_92_30/Toyota$$Prius$$2006$$Black$$92_30$$100$$image_2.jpg"),
        ("car_92_34", "images/car_92_34/Toyota$$RAV4$$2010$$Blue$$92_34$$405$$image_4.jpg"),
        ("car_92_19", "images/car_92_19/Toyota$$Hilux$$2007$$Black$$92_19$$201$$image_0.jpg"),
        ("car_92_21", "images/car_92_21/Toyota$$Land Cruiser$$2003$$Blue$$92_21$$168$$image_21.jpg"),
        ("car_92_11", "images/car_92_11/Toyota$$Corolla$$2000$$Blue$$92_11$$77$$image_1.jpg"),
        ("car_92_2",  "images/car_92_2/Toyota$$Alphard$$2003$$Black$$92_2$$45$$image_0.jpg"),
        ("car_34_3",  "images/car_34_3/Honda$$CR-V$$2000$$Black$$34_3$$1387$$image_0.jpg"),
        ("car_34_11", "images/car_34_11/Honda$$Jazz$$2003$$Black$$34_11$$11$$image_0.jpg"),
        ("car_34_2",  "images/car_34_2/Honda$$Civic$$2000$$Black$$34_2$$683$$image_0.jpg"),
        ("car_34_8",  "images/car_34_8/Honda$$HR-V$$2000$$Black$$34_8$$104$$image_0.jpg"),
        ("car_34_1",  "images/car_34_1/Honda$$Accord$$2000$$Black$$34_1$$127$$image_0.jpg"),
        ("car_57_10", "images/car_57_10/Mazda$$Mazda2$$2007$$Black$$57_10$$121$$image_0.jpg"),
        ("car_57_11", "images/car_57_11/Mazda$$Mazda3$$2003$$Black$$57_11$$1026$$image_0.jpg"),
        ("car_57_13", "images/car_57_13/Mazda$$Mazda6$$2002$$Black$$57_13$$1003$$image_0.jpg"),
        ("car_57_6",  "images/car_57_6/Mazda$$CX-3$$2015$$Blue$$57_6$$100$$image_0.jpg"),
        ("car_57_7",  "images/car_57_7/Mazda$$CX-5$$2012$$Black$$57_7$$100$$image_0.jpg"),
        ("car_36_8",  "images/car_36_8/Hyundai$$i10$$2008$$Black$$36_8$$1000$$image_0.jpg"),
        ("car_36_20", "images/car_36_20/Hyundai$$Santa Fe$$2001$$Black$$36_20$$1007$$image_0.jpg"),
        ("car_36_24", "images/car_36_24/Hyundai$$Tucson$$2004$$Black$$36_24$$1015$$image_0.jpg"),
        ("car_43_9",  "images/car_43_9/Kia$$Rio$$2001$$Black$$43_9$$100$$image_0.jpg"),
        ("car_43_7",  "images/car_43_7/Kia$$Picanto$$2004$$Black$$43_7$$1000$$image_0.jpg"),
        ("car_43_13", "images/car_43_13/Kia$$Sportage$$2000$$Black$$43_13$$1001$$image_0.jpg"),
        ("car_43_11", "images/car_43_11/Kia$$Sorento$$2003$$Black$$43_11$$1006$$image_0.jpg"),
        ("car_43_1",  "images/car_43_1/Kia$$Carens$$2000$$Black$$43_1$$100$$image_0.jpg"),
    ]

    for i, (cid, img_path) in enumerate(pure_image_cars):
        qid = f"Q{101 + i}"
        car = car_by_id[cid]
        name = car.get("display_name") or f"{car.get('brand')} {car.get('model')}"
        brand = car["brand"]
        body = car["body_type"]
        price = f"{int(car['price_vnd_from']):,} VND".replace(",", ".") if car.get("price_vnd_from") else "chưa có giá niêm yết"

        samples.append({
            "id": qid,
            "query_type": "image_only",
            "image_path": f"dataset/{img_path}",
            "question": "Xe trong ảnh là mẫu xe gì?",
            "expected_intent": "identify_car",
            "expected_car_ids": [cid],
            "relevant_context_ids": [f"{cid}_specs_warranty"],
            "required_answer_facts": [name, brand, body],
            "reference_answer": f"Chiếc xe trong ảnh là {name} ({brand}), thuộc dòng xe {body}. Xe có giá bán tham khảo khoảng {price}.",
            "creator": "Thành viên 3",
            "reviewer": "Thành viên 2",
            "difficulty": "easy",
            "notes": "Nhận diện góc chụp phía trước tiêu chuẩn",
        })

    # 2. 15 Mẫu ảnh kết hợp câu hỏi văn bản (Q126 - Q140)
    multimodal_specs = [
        ("car_57_7", "images/car_57_7/Mazda$$CX-5$$2012$$Black$$57_7$$100$$image_0.jpg",
         "Xe này bảo hành bao lâu?", "ask_warranty",
         ["36 tháng", "100.000 km", "Mazda CX-5"],
         "Mẫu xe Mazda CX-5 trong ảnh có thời gian bảo hành chính hãng là 36 tháng hoặc 100.000 km tùy điều kiện nào đến trước."),
        
        ("car_34_3", "images/car_34_3/Honda$$CR-V$$2000$$Black$$34_3$$1387$$image_0.jpg",
         "Xe trong hình có giá bán khởi điểm là bao nhiêu?", "ask_price",
         ["1.039.000.000 VND", "Honda CR-V"],
         "Mẫu xe Honda CR-V trong hình có giá bán tham khảo khởi điểm từ 1.039.000.000 VND tại thị trường Việt Nam."),

        ("car_92_21", "images/car_92_21/Toyota$$Land Cruiser$$2003$$Blue$$92_21$$168$$image_21.jpg",
         "Mẫu xe này có mấy chỗ ngồi và sử dụng nhiên liệu gì?", "ask_specification",
         ["7 chỗ", "Diesel", "Toyota Land Cruiser"],
         "Chiếc Toyota Land Cruiser trong ảnh được trang bị 7 chỗ ngồi và sử dụng nhiên liệu Diesel."),

        ("car_36_20", "images/car_36_20/Hyundai$$Santa Fe$$2001$$Black$$36_20$$1007$$image_0.jpg",
         "Mẫu SUV này giá lăn bánh hoặc giá tham khảo bao nhiêu?", "ask_price",
         ["1.069.000.000 VND", "Hyundai Santa Fe"],
         "Xe Hyundai Santa Fe trong hình có mức giá niêm yết tham khảo từ 1.069.000.000 VND."),

        ("car_43_10", "images/car_43_10/Kia$$Sedona$$2000$$Black$$43_10$$100$$image_0.jpg",
         "Xe này chở được bao nhiêu người?", "ask_seats",
         ["7 chỗ", "Kia Carnival"],
         "Mẫu xe Kia Carnival (Sedona) trong ảnh có cấu hình 7 chỗ ngồi rộng rãi cho gia đình."),

        ("car_92_19", "images/car_92_19/Toyota$$Hilux$$2007$$Black$$92_19$$201$$image_0.jpg",
         "Mẫu bán tải này dùng động cơ gì?", "ask_specification",
         ["3.0L", "171 HP", "Toyota Hilux"],
         "Chiếc bán tải Toyota Hilux trong ảnh trang bị khối động cơ 3.0L công suất 171 mã lực."),

        ("car_34_2", "images/car_34_2/Honda$$Civic$$2000$$Black$$34_2$$683$$image_0.jpg",
         "Mẫu xe này có chính sách bảo hành thế nào?", "ask_warranty",
         ["36 tháng", "100.000 km", "Honda Civic"],
         "Mẫu xe Honda Civic trong hình được bảo hành chính hãng trong 36 tháng hoặc 100.000 km."),

        ("car_57_11", "images/car_57_11/Mazda$$Mazda3$$2003$$Black$$57_11$$1026$$image_0.jpg",
         "Xe này giá bán bao nhiêu và dùng hộp số gì?", "ask_specification",
         ["569.000.000 VND", "Manual", "Mazda3"],
         "Mẫu xe Mazda3 trong ảnh có mức giá khởi điểm 569.000.000 VND và sử dụng hộp số sàn/tự động tùy phiên bản."),

        ("car_36_8", "images/car_36_8/Hyundai$$i10$$2008$$Black$$36_8$$1000$$image_0.jpg",
         "Xe này có thích hợp đi phố không và giá bao nhiêu?", "ask_price",
         ["360.000.000 VND", "Hatchback", "Hyundai Grand i10"],
         "Hyundai Grand i10 là mẫu hatchback cỡ nhỏ rất thích hợp đi trong đô thị, giá bán khởi điểm chỉ từ 360.000.000 VND."),

        ("car_92_2", "images/car_92_2/Toyota$$Alphard$$2003$$Black$$92_2$$45$$image_0.jpg",
         "Xe sang này có giá bao nhiêu?", "ask_price",
         ["4.415.000.000 VND", "Toyota Alphard", "MPV"],
         "Đây là dòng MPV hạng sang Toyota Alphard, có giá tham khảo khoảng 4.415.000.000 VND tại Việt Nam."),

        ("car_43_13", "images/car_43_13/Kia$$Sportage$$2000$$Black$$43_13$$1001$$image_0.jpg",
         "Xe trong hình là SUV mấy chỗ và của hãng nào?", "ask_specification",
         ["5 chỗ", "Kia", "Sportage"],
         "Chiếc xe trong ảnh là Kia Sportage, mẫu SUV 5 chỗ của thương hiệu Kia Hàn Quốc."),

        ("car_57_10", "images/car_57_10/Mazda$$Mazda2$$2007$$Black$$57_10$$121$$image_0.jpg",
         "Bảo hành của chiếc Mazda này như thế nào?", "ask_warranty",
         ["36 tháng", "100.000 km", "Mazda2"],
         "Mẫu xe Mazda2 trong ảnh có chế độ bảo hành 36 tháng hoặc 100.000 km."),

        ("car_34_8", "images/car_34_8/Honda$$HR-V$$2000$$Black$$34_8$$104$$image_0.jpg",
         "Mẫu xe Honda này có giá từ bao nhiêu?", "ask_price",
         ["669.000.000 VND", "Honda HR-V"],
         "Honda HR-V trong ảnh có giá bán niêm yết khởi điểm từ 669.000.000 VND."),

        ("car_92_30", "images/car_92_30/Toyota$$Prius$$2006$$Black$$92_30$$100$$image_2.jpg",
         "Xe trong ảnh dùng động cơ xăng hay hybrid điện?", "ask_specification",
         ["Hybrid", "Petrol/Electric", "Toyota Prius"],
         "Chiếc Toyota Prius trong ảnh là dòng xe công nghệ Hybrid kết hợp động cơ xăng và mô tơ điện."),

        ("car_92_44", "images/car_92_44/Toyota$$Yaris$$2000$$Blue$$92_44$$1362$$image_0.jpg",
         "Xe này bảo hành bao nhiêu km?", "ask_warranty",
         ["100.000 km", "Toyota Yaris"],
         "Mẫu Toyota Yaris được áp dụng chính sách bảo hành 100.000 km hoặc 36 tháng.")
    ]

    for j, (cid, img_path, question, intent, facts, ref_ans) in enumerate(multimodal_specs):
        qid = f"Q{126 + j}"
        samples.append({
            "id": qid,
            "query_type": "multimodal",
            "image_path": f"dataset/{img_path}",
            "question": question,
            "expected_intent": intent,
            "expected_car_ids": [cid],
            "relevant_context_ids": [f"{cid}_specs_warranty"],
            "required_answer_facts": facts,
            "reference_answer": ref_ans,
            "creator": "Thành viên 3",
            "reviewer": "Thành viên 2",
            "difficulty": "medium",
            "notes": "Kết hợp nhận diện ảnh xe và trả lời thuộc tính RAG",
        })

    # 3. 10 Mẫu trường hợp khó (Edge Cases: Q141 - Q150)
    edge_cases = [
        ("Q141", "dataset/images/car_57_7/Mazda$$CX-5$$2012$$Black$$57_7$$100$$image_0.jpg",
         "Xe này có phải Mazda CX-8 không?", "compare_cars", ["car_57_7"],
         ["Không phải", "Mazda CX-5", "5 chỗ"],
         "Chiếc xe trong ảnh là Mazda CX-5 (5 chỗ), không phải dòng xe Mazda CX-8 (7 chỗ lớn hơn).",
         "hard", "Góc nhìn dễ gây nhầm lẫn giữa hai mẫu cùng gia đình thiết kế KODO"),

        ("Q142", "dataset/images/car_92_21/Toyota$$Land Cruiser$$2003$$Blue$$92_21$$168$$image_21.jpg",
         "Xe này có phải Toyota Fortuner không?", "compare_cars", ["car_92_21"],
         ["Không phải", "Land Cruiser", "SUV cỡ lớn"],
         "Đây là mẫu xe việt dã cao cấp Toyota Land Cruiser, không phải Toyota Fortuner.",
         "hard", "Phân biệt xe cùng hãng Toyota khác phân khúc"),

        ("Q143", "dataset/images/car_92_34/Toyota$$RAV4$$2010$$Blue$$92_34$$405$$image_4.jpg",
         "Đây có phải xe Toyota Corolla Cross không?", "compare_cars", ["car_92_34"],
         ["Không phải", "Toyota RAV4"],
         "Chiếc xe trong hình là Toyota RAV4 thế hệ nhập khẩu, có kiểu dáng tương tự nhưng khác với Toyota Corolla Cross.",
         "hard", "Hai dòng crossover cùng kích thước của Toyota"),

        ("Q144", "dataset/images/car_36_8/Hyundai$$i10$$2008$$Black$$36_8$$1000$$image_0.jpg",
         "Xe này có phải Kia Morning không?", "compare_cars", ["car_36_8"],
         ["Hyundai Grand i10", "không phải Kia Morning"],
         "Chiếc xe trong ảnh là Hyundai Grand i10, không phải Kia Morning mặc dù cùng phân khúc hatchback cỡ A.",
         "hard", "Cặp xe đô thị Hàn Quốc dễ nhầm lẫn nhất"),

        ("Q145", "dataset/images/car_92_9/placeholder.jpg",
         "Toyota Camry trong cơ sở dữ liệu có ảnh không?", "ask_specification", ["car_92_9"],
         ["chưa có ảnh", "Toyota Camry"],
         "Mẫu Toyota Camry hiện đã có thông tin thông số và giá trong hệ thống nhưng chưa có tập ảnh kiểm chứng.",
         "hard", "Xe trong danh mục nhưng missing verified images"),

        ("Q146", "dataset/images/car_87_10/placeholder.jpg",
         "Suzuki Swift có giá bao nhiêu?", "ask_price", ["car_87_10"],
         ["Suzuki Swift", "559.900.000 VND"],
         "Mẫu Suzuki Swift có giá tham khảo từ 559.900.000 VND (chưa có ảnh kiểm chứng trong tập dữ liệu).",
         "hard", "Xe thiếu ảnh trong corpus"),

        ("Q147", "dataset/images/unknown/ferrari_f8.jpg",
         "Xe trong hình là xe gì?", "unknown_car", [],
         ["không có trong cơ sở dữ liệu", "siêu xe"],
         "Hệ thống không nhận diện chắc chắn xe này do mẫu xe chưa có trong cơ sở dữ liệu 50 mẫu xe thông dụng tại Việt Nam.",
         "hard", "Mẫu xe ngoài danh sách (Out-of-Distribution / Unknown car)"),

        ("Q148", "dataset/images/unknown/interior_cockpit.jpg",
         "Nội thất này của xe nào?", "identify_car", [],
         ["ảnh nội thất", "không chắc chắn", "cần ảnh ngoại thất"],
         "Ảnh chụp khoang nội thất/vô-lăng. Hệ thống nhận diện ngoại thất xe nên không thể xác định chính xác mẫu xe từ góc chụp này.",
         "hard", "Ảnh nội thất thay vì ngoại thất xe"),

        ("Q149", "dataset/images/unknown/bicycle.jpg",
         "Xe này giá bao nhiêu?", "unknown_object", [],
         ["không phải ô tô", "không nhận diện"],
         "Hình ảnh tải lên không phải là xe ô tô thuộc cơ sở dữ liệu hệ thống.",
         "hard", "Vật thể không phải ô tô (Non-car image)"),

        ("Q150", "dataset/images/unknown/corrupted.jpg",
         "Xe gì đây?", "invalid_image", [],
         ["ảnh lỗi", "không thể đọc"],
         "Tập tin ảnh bị lỗi hoặc không thể giải mã định dạng.",
         "hard", "Tập tin ảnh bị hỏng cấu trúc (Corrupted image test)")
    ]

    for qid, img_path, question, intent, exp_ids, facts, ref_ans, diff, notes in edge_cases:
        samples.append({
            "id": qid,
            "query_type": "edge_case",
            "image_path": img_path,
            "question": question,
            "expected_intent": intent,
            "expected_car_ids": exp_ids,
            "relevant_context_ids": [f"{cid}_specs_warranty" for cid in exp_ids],
            "required_answer_facts": facts,
            "reference_answer": ref_ans,
            "creator": "Thành viên 3",
            "reviewer": "Thành viên 2",
            "difficulty": diff,
            "notes": notes,
        })

    jsonl_path = EVAL_DIR / "ground_truth_member3.jsonl"
    with open(jsonl_path, "w", encoding="utf-8") as f:
        for s in samples:
            f.write(json.dumps(s, ensure_ascii=False) + "\n")

    csv_path = EVAL_DIR / "ground_truth_member3.csv"
    with open(csv_path, "w", encoding="utf-8-sig", newline="") as f:
        fieldnames = [
            "id", "query_type", "image_path", "question", "expected_intent",
            "expected_car_ids", "relevant_context_ids", "required_answer_facts",
            "reference_answer", "creator", "reviewer", "difficulty", "notes"
        ]
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        for s in samples:
            row = dict(s)
            row["expected_car_ids"] = ";".join(row["expected_car_ids"])
            row["relevant_context_ids"] = ";".join(row["relevant_context_ids"])
            row["required_answer_facts"] = ";".join(row["required_answer_facts"])
            writer.writerow(row)

    print(f"PASS: Đã tạo thành công {len(samples)} mẫu ground truth (Q101–Q150) tại:")
    print(f"  - JSONL: {jsonl_path}")
    print(f"  - CSV:   {csv_path}")


if __name__ == "__main__":
    generate_ground_truth()
