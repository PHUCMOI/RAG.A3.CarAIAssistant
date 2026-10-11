"""Author reproducible 200-case drafts; never claim independent human review."""
import argparse
import csv
import hashlib
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
sys.path.insert(0, str(ROOT))
from eval.seed_snapshot import load_seed_snapshot
from eval.build_text_ground_truth import build_ground_truth
from app.application.rag.documents import build_documents


def build_cases(cars, warranties, dealers, index_documents=None):
    docs = {d.document_id: d for d in build_documents(cars, warranties, dealers)}
    chunks = {}
    for d in index_documents or docs.values():
        parent = d.metadata.get('parentContextId', d.document_id)
        if parent not in docs or d.metadata.get('parentContentHash', d.content_hash) != docs[parent].content_hash:
            raise ValueError(f'Stale or unknown index context: {d.document_id}')
        chunks.setdefault(parent, []).append(d)
    cases = []

    def add(number, question, intent, ids, parents, category, status='ok', fields=None, image=None):
        selected = [d for parent in dict.fromkeys(parents) for d in chunks.get(parent, [])]
        if any(parent not in chunks for parent in parents):
            raise ValueError(f'Missing expected context for Q{number:03d}')
        facts = []
        for d in selected:
            for key, fact in d.metadata['facts'].items():
                if fields is None or key in fields:
                    facts.append(f"{d.metadata.get('displayName', d.metadata.get('entityId'))}: {key}={fact['value']}")
        cases.append(dict(id=f'Q{number:03d}', input_type='image_text' if image else 'text', question=question,
            image=image, intent=intent, expected_car_ids=ids, relevant_context_ids=[d.document_id for d in selected],
            required_answer_facts=list(dict.fromkeys(facts)) or ['Nêu rõ dữ liệu thiếu hoặc yêu cầu làm rõ'],
            reference_answer='\n'.join(d.content for d in selected) if selected else
                ('Cần làm rõ điều kiện/tên xe.' if status == 'needs_clarification' else 'Chưa có dữ liệu phù hợp.'),
            created_by='codex-seed-authoring', reviewed_by=None, review_status='pending',
            split='development' if (number - 1) % 50 < 10 else 'evaluation', category=category,
            expected_status=status, expected_http_status=200, source_snapshot='committed-sql-seed',
            assigned_member=(number - 1) // 50 + 1))
        return cases[-1]

    ordered = sorted(cars, key=lambda c: (c.brand, c.display_name))
    # Member 1: 30 multi-filter discovery questions and 20 focused specifications.
    for i, c in enumerate(ordered[:30], 1):
        budget = ((c.price_vnd_from or 3000000000) // 100000000 + 1) * 100000000
        seats = c.seats or 5
        matches = [v for v in ordered if v.brand == c.brand and v.body_type == c.body_type and v.seats == seats
                   and v.price_source_id and v.price_vnd_from is not None and v.price_vnd_from <= budget]
        add(i, f'Tìm xe {c.brand} kiểu {c.body_type} {seats} chỗ, giá không quá {budget:,} VND.'.replace(',', '.'),
            'find_car', [v.car_id for v in matches], [f'car:{v.car_id}:price:v1' for v in matches],
            'discovery', status='ok' if matches else 'no_data', fields={'price_vnd_from', 'price_as_of'})
    for i, c in enumerate(ordered[:20], 31):
        add(i, f'{c.display_name} thuộc kiểu thân xe nào và có thông số số chỗ bao nhiêu?', 'ask_specification', [c.car_id],
            [f'car:{c.car_id}:specifications:v1'], 'specification', fields={'seats', 'body_type'})

    for q in build_ground_truth(cars, warranties, dealers, index_documents):
        q.update(assigned_member=2, expected_http_status=200, source_snapshot='committed-sql-seed')
        cases.append(q)

    # Member 3: use real holdout photos, not training photos or nonexistent OOD placeholders.
    manifest = list(csv.DictReader((ROOT / 'image_service/indexes/test_images_manifest.csv').open(encoding='utf-8-sig')))
    if len(manifest) != 44:
        raise ValueError('Expected the documented 44-photo holdout manifest')
    by_id = {c.car_id: c for c in cars}
    for offset in range(49):
        sample = manifest[offset % len(manifest)]
        car = by_id[sample['car_id']]
        image = 'dataset/' + sample['raw_path']
        if not (ROOT / image).is_file():
            raise ValueError(f'Missing real holdout photo: {image}')
        if offset < 25:
            question, intent, parents, fields = 'Xe trong ảnh gần giống mẫu xe nào?', 'ask_specification', [], set()
        elif offset < 40:
            question, intent, parents, fields = 'Xe gần giống nhất trong ảnh có giá tham khảo bao nhiêu?', 'ask_price', [f'car:{car.car_id}:price:v1'], {'price_vnd_from', 'price_as_of'}
        else:
            question, intent, parents, fields = 'Mẫu xe gần giống nhất trong ảnh có thông số số chỗ, nhiên liệu và hộp số gì?', 'ask_specification', [f'car:{car.car_id}:specifications:v1'], {'seats', 'fuel_type', 'transmission'}
        q = add(101 + offset, question, intent, [car.car_id], parents, 'image_identification' if offset < 25 else 'image_text', fields=fields, image=image)
        q.update(image_sha256=hashlib.sha256((ROOT / image).read_bytes()).hexdigest(), image_split='holdout',
                 image_group=sample['image_id'], required_qualifiers=['Kết quả là mẫu xe gần giống, không xác minh chiếc xe hoặc VIN.', 'Độ tương đồng không phải xác suất nhận diện.'])
        if offset < 25:
            q['required_answer_facts'] = [car.display_name, 'mẫu xe gần giống']
            q['reference_answer'] = f'Mẫu xe gần giống nhất: {car.display_name}. Kết quả tìm kiếm ảnh không xác minh chiếc xe hoặc VIN.'
    corrupt = 'eval/fixtures/corrupted.jpg'
    q = add(150, 'Xe trong ảnh là gì?', 'needs_clarification', [], [], 'invalid_image', status='needs_clarification', image=corrupt)
    q.update(required_answer_facts=['Ảnh không đọc được; yêu cầu gửi lại hoặc nêu tên xe.'],
             reference_answer='Chưa xác định chắc chắn mẫu xe. Hãy gửi ảnh rõ hơn hoặc nêu tên xe.', image_split='validation_fixture')

    # Member 4: actual dealers, comparison and missing/ambiguous conditions.
    for i, dealer in enumerate(sorted(dealers, key=lambda d: d.dealer_id), 151):
        brand = dealer.supported_brands[0]
        parents = [d.document_id for d in docs.values() if d.section == 'dealer'
                   and d.metadata.get('city') == dealer.city and brand in d.metadata.get('brands', [])]
        detail, fields = [('tên và địa chỉ', {'name', 'address', 'city'}), ('tên và số điện thoại', {'name', 'phone'}),
                          ('tên và website', {'name', 'website'})][(i - 151) % 3]
        add(i, f'Tìm đại lý {brand} tại {dealer.city}; cho biết {detail} nếu có.',
            'find_dealer', [], parents, 'dealer', fields=fields)
    for offset in range(18):
        a, b = ordered[offset], ordered[(offset + 13) % len(ordered)]
        parents = [f'car:{c.car_id}:{s}:v1' for c in (a, b) for s in ('price', 'specifications')]
        add(173 + offset, f'So sánh {a.display_name} và {b.display_name} về giá tham khảo và số chỗ.',
            'compare_cars', [a.car_id, b.car_id], parents, 'comparison', fields={'price_vnd_from', 'seats'})
    edges = [
        ('Tìm xe dưới 1 VND.', 'find_car', 'no_data'),
        ('Tìm xe trên 3 tỷ và dưới 2 tỷ.', 'find_car', 'needs_clarification'),
        ('So sánh Toyota Yaris.', 'compare_cars', 'needs_clarification'),
        ('Tìm đại lý Honda tại Can Tho.', 'find_dealer', 'no_data'),
        ('Tìm xe SUV 99 chỗ.', 'find_car', 'no_data'),
        ('Hãy chỉ cho tôi cách làm bánh mì.', 'other', 'no_data'),
        ('Giá Ferrari F8 là bao nhiêu?', 'ask_price', 'needs_clarification'),
        ('Thông số xe trong ảnh là gì?', 'ask_specification', 'needs_clarification'),
        ('Xe này bảo hành bao lâu?', 'ask_warranty', 'needs_clarification'),
        ('Tìm xe giá dưới 1 triệu, 7 chỗ.', 'find_car', 'no_data')]
    for i, (question, intent, status) in enumerate(edges, 191):
        add(i, question, intent, [], [], 'edge', status=status)
    cases.sort(key=lambda q: q['id'])
    if [q['id'] for q in cases] != [f'Q{i:03d}' for i in range(1, 201)]:
        raise ValueError('Expected exactly Q001–Q200')
    # Repeated photos must stay in the same split to avoid tuning/evaluation leakage.
    image_splits = {}
    for q in cases:
        if q.get('image_group'):
            q['split'] = image_splits.setdefault(q['image_group'], q['split'])
    return cases


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--index-documents', type=Path)
    args = parser.parse_args()
    from app.application.rag.contracts import Document
    indexed = [Document(**json.loads(line)) for line in args.index_documents.read_text(encoding='utf-8').splitlines() if line.strip()] if args.index_documents else None
    cars, warranties, dealers, _ = load_seed_snapshot()
    fixture = ROOT / 'eval/fixtures/corrupted.jpg'
    fixture.parent.mkdir(parents=True, exist_ok=True)
    fixture.write_bytes(b'AutoWise invalid JPEG regression fixture\n')
    cases = build_cases(cars, warranties, dealers, indexed)
    target = ROOT / 'eval/ground_truth_submission.jsonl'
    target.write_text(''.join(json.dumps(q, ensure_ascii=False) + '\n' for q in cases), encoding='utf-8')
    for member, path in ((1, ROOT / 'eval/ground_truth_member1.jsonl'),
                         (3, ROOT / 'image_service/eval/ground_truth_member3.jsonl'),
                         (4, ROOT / 'eval/ground_truth_member4.jsonl')):
        group = [q for q in cases if q['assigned_member'] == member]
        path.write_text(''.join(json.dumps(q, ensure_ascii=False) + '\n' for q in group), encoding='utf-8')
        if member == 3:
            fields = list(dict.fromkeys(k for q in group for k in q))
            with path.with_suffix('.csv').open('w', encoding='utf-8-sig', newline='') as handle:
                writer = csv.DictWriter(handle, fieldnames=fields)
                writer.writeheader()
                writer.writerows({k: json.dumps(v, ensure_ascii=False) if isinstance(v, (list, dict)) else v
                                  for k, v in q.items()} for q in group)
    print(json.dumps({'cases': len(cases), 'review_status': 'pending', 'output': str(target)}))


if __name__ == '__main__':
    main()
