"""Structural/provenance audit; independent human label review remains required."""
import collections
import hashlib
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
sys.path.insert(0, str(ROOT))
from eval.seed_snapshot import load_seed_snapshot
from app.application.rag.documents import build_documents


def validate(cases, indexed=None):
    errors = []
    cars, warranties, dealers, _ = load_seed_snapshot()
    car_ids = {c.car_id for c in cars}
    contexts = {d.document_id for d in (indexed or build_documents(cars, warranties, dealers))}
    if [q['id'] for q in cases] != [f'Q{i:03d}' for i in range(1, 201)]:
        errors.append('Expected exactly Q001–Q200 in order')
    members = collections.Counter(q.get('assigned_member') for q in cases)
    if members != collections.Counter({1: 50, 2: 50, 3: 50, 4: 50}):
        errors.append('Expected 50 draft cases per assigned member')
    inputs = collections.Counter((q['question'], q.get('image')) for q in cases)
    if any(n > 1 for n in inputs.values()):
        errors.append('Duplicate question/image inputs')
    training = json.loads((ROOT / 'image_service/indexes/image_meta.json').read_text(encoding='utf-8'))
    train_hashes = {hashlib.sha256((ROOT / 'dataset' / r['image_path']).read_bytes()).hexdigest()
                    for r in training if (ROOT / 'dataset' / r['image_path']).is_file()}
    groups = {}
    for q in cases:
        if not set(q['expected_car_ids']) <= car_ids:
            errors.append(q['id'] + ': unknown car IDs')
        if not set(q['relevant_context_ids']) <= contexts:
            errors.append(q['id'] + ': contexts absent from snapshot')
        if q.get('review_status') == 'reviewed' and (not q.get('reviewed_by') or q['reviewed_by'] == q['created_by']):
            errors.append(q['id'] + ': independent reviewer required')
        if not q.get('required_answer_facts') or not q.get('reference_answer'):
            errors.append(q['id'] + ': empty answer labels')
        if q.get('image'):
            path = (ROOT / q['image']).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():
                errors.append(q['id'] + ': missing or outside-project image')
                continue
            digest = hashlib.sha256(path.read_bytes()).hexdigest()
            if q.get('image_sha256') and q['image_sha256'] != digest:
                errors.append(q['id'] + ': image hash mismatch')
            if q.get('image_split') == 'holdout' and digest in train_hashes:
                errors.append(q['id'] + ': holdout photo is present in training index')
            if q.get('image_group'):
                previous = groups.setdefault(digest, q['split'])
                if previous != q['split']:
                    errors.append(q['id'] + ': same photo occurs across development/evaluation')
    return dict(valid=not errors, errors=errors, cases=len(cases), assigned_members=dict(members),
                review_status_counts=dict(collections.Counter(q.get('review_status', 'missing') for q in cases)),
                independent_human_review_complete=all(q.get('review_status') == 'reviewed' for q in cases),
                unique_holdout_photos=len(groups), scope='Structural and seed/index consistency, not human fact verification')


if __name__ == '__main__':
    from app.application.rag.contracts import Document
    path = ROOT / 'eval/ground_truth_submission.jsonl'
    cases = [json.loads(l) for l in path.read_text(encoding='utf-8').splitlines() if l.strip()]
    snapshot = ROOT / 'data/documents.jsonl'
    indexed = [Document(**json.loads(l)) for l in snapshot.read_text(encoding='utf-8').splitlines() if l.strip()] if snapshot.is_file() else None
    report = validate(cases, indexed)
    target = ROOT / 'eval/submission_ground_truth_audit.json'
    target.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))
    raise SystemExit(0 if report['valid'] else 1)
