"""Sequential HTTP evaluation with independent retrieval and answer evidence."""
import argparse
import base64
import csv
from datetime import datetime, timezone
import hashlib
import json
import mimetypes
import statistics
import sys
import time
from pathlib import Path
import httpx
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from eval.text_metrics import retrieval_metrics


def evaluate_case(client, case, api_url, image_api_url):
    start = time.perf_counter()
    row = dict(id=case['id'], split=case['split'], input_type=case.get('input_type', 'text'),
        intent_correct=None, status_correct=None, http_status_correct=None, context_precision_at_5=None,
        context_recall_at_5=None, image_recall_at_1=None, image_recall_at_5=None, image_mrr_at_5=None,
        faithfulness=None, answer_completeness=None, human_review='pending', error='')
    try:
        image = case.get('image')
        image_ranking = []
        if image:
            path = (ROOT / image).resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():
                raise ValueError('Image fixture must exist inside the project')
            raw = path.read_bytes()
            if case.get('image_sha256') and hashlib.sha256(raw).hexdigest() != case['image_sha256']:
                raise ValueError('Image fixture hash does not match ground truth')
            mime = mimetypes.guess_type(path.name)[0] or 'image/jpeg'
            if case.get('expected_car_ids'):
                search = client.post(image_api_url.rstrip('/') + '/search/image',
                    files={'file': (path.name, raw, mime)}, data={'top_k': '5'})
                search.raise_for_status()
                image_ranking = [r['car_id'] for r in search.json()['results']]
                expected = set(case['expected_car_ids'])
                rank = next((i for i, cid in enumerate(image_ranking, 1) if cid in expected), None)
                row.update(image_recall_at_1=int(bool(image_ranking) and image_ranking[0] in expected),
                    image_recall_at_5=int(rank is not None), image_mrr_at_5=1 / rank if rank else 0.0)
            response = client.post(api_url.rstrip('/') + '/api/chat/turns', json={
                'question': case['question'], 'imageBase64': base64.b64encode(raw).decode('ascii'), 'mimeType': mime})
        else:
            response = client.post(api_url.rstrip('/') + '/api/chat', json={'question': case['question']})
        row['http_status'] = response.status_code
        row['http_status_correct'] = int(response.status_code == case.get('expected_http_status', 200))
        response.raise_for_status()
        data = response.json()
        retrieved = data['retrievedContextIds']
        if not isinstance(retrieved, list) or any(not isinstance(cid, str) for cid in retrieved):
            raise ValueError('Invalid ranked retrieval context IDs')
        metrics = retrieval_metrics(retrieved, case['relevant_context_ids'])
        row.update(intent_correct=int(data['intent'] == case['intent']),
            context_precision_at_5=metrics['precision'], context_recall_at_5=metrics['recall'],
            status_correct=int(data['status'] == case['expected_status']), generation_mode=data['generationMode'],
            retrieval_mode=data.get('retrieval'), grounded=data['grounded'], answer=data['answer'],
            retrieved_context_ids=json.dumps(retrieved), answer_context_ids=json.dumps([e['contextId'] for e in data.get('evidence', [])]),
            image_ranked_car_ids=json.dumps(image_ranking), citations=json.dumps(data['citations'], ensure_ascii=False),
            required_answer_facts=json.dumps(case['required_answer_facts'], ensure_ascii=False))
    except (httpx.HTTPError, KeyError, ValueError, OSError) as exc:
        row['error'] = type(exc).__name__
        if isinstance(exc, httpx.HTTPStatusError):
            row['http_status'] = exc.response.status_code
    row['response_seconds'] = time.perf_counter() - start
    return row


def save_report(rows, output, metadata):
    output.parent.mkdir(parents=True, exist_ok=True)
    fields = list(dict.fromkeys(key for row in rows for key in row))
    with output.open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    groups = {}
    for row in rows:
        groups.setdefault(row['split'], []).append(row)
    summary = dict(metadata, completed_cases=len(rows), human_review='pending',
        metric_scope='Ranked retrieval context IDs; answer evidence is recorded separately.', splits={})
    for split, group in groups.items():
        summary['splits'][split] = dict(cases=len(group), errors=sum(bool(r['error']) for r in group), humanReview='pending')
        for field in ('intent_correct', 'status_correct', 'http_status_correct', 'context_precision_at_5',
                      'context_recall_at_5', 'image_recall_at_1', 'image_recall_at_5', 'image_mrr_at_5', 'response_seconds'):
            values = [r.get(field) for r in group if r.get(field) is not None and
                      (field == 'http_status_correct' or field.startswith('image_') or not r['error'])]
            summary['splits'][split][field] = statistics.mean(values) if values else None
            summary['splits'][split][field + '_samples'] = len(values)
    output.with_suffix('.summary.json').write_text(json.dumps(summary, indent=2), encoding='utf-8')
    output.with_suffix('.responses.json').write_text(json.dumps(rows, ensure_ascii=False, indent=2), encoding='utf-8')
    return summary


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--api-url', default='http://localhost:5080')
    parser.add_argument('--image-api-url', default='http://localhost:8000')
    parser.add_argument('--ground-truth', type=Path, default=ROOT / 'eval/ground_truth_text.jsonl')
    parser.add_argument('--output', type=Path, default=ROOT / 'eval/results_text.csv')
    parser.add_argument('--split', choices=['development', 'evaluation', 'all'], default='evaluation')
    parser.add_argument('--ids', help='Comma-separated IDs for focused diagnostics')
    parser.add_argument('--resume', action='store_true', help='Keep completed cases, including failures, from matching JSON checkpoint')
    args = parser.parse_args()
    raw = args.ground_truth.read_bytes()
    cases = [json.loads(line) for line in raw.decode('utf-8-sig').splitlines() if line.strip()]
    wanted = set(args.ids.split(',')) if args.ids else None
    cases = [q for q in cases if (args.split == 'all' or q['split'] == args.split) and (wanted is None or q['id'] in wanted)]
    if not cases or len({q['id'] for q in cases}) != len(cases):
        parser.error('Expected nonempty uniquely identified cases')
    metadata = dict(started_at=datetime.now(timezone.utc).isoformat(), ground_truth_sha256=hashlib.sha256(raw).hexdigest(),
        selected_cases=len(cases), selected_ids=[q['id'] for q in cases], split=args.split,
        labels_reviewed=all(q.get('review_status') == 'reviewed' for q in cases), runtime='live HTTP PostgreSQL/E5/Bedrock')
    rows = []
    if args.resume:
        prior = json.loads(args.output.with_suffix('.summary.json').read_text(encoding='utf-8'))
        if any(prior.get(k) != metadata[k] for k in ('ground_truth_sha256', 'selected_ids')):
            parser.error('Checkpoint belongs to different ground truth/cases')
        metadata['started_at'] = prior['started_at']
        metadata['resumed_at'] = datetime.now(timezone.utc).isoformat()
        rows = json.loads(args.output.with_suffix('.responses.json').read_text(encoding='utf-8'))
        row_ids = [r['id'] for r in rows]
        if len(set(row_ids)) != len(row_ids) or not set(row_ids).issubset(metadata['selected_ids']):
            parser.error('Checkpoint rows contain duplicate or unselected cases')
    done = {r['id'] for r in rows}
    with httpx.Client(timeout=240) as client:
        for case in cases:
            if case['id'] in done:
                continue
            row = evaluate_case(client, case, args.api_url, args.image_api_url)
            rows.append(row)
            save_report(rows, args.output, metadata)
            print(json.dumps({'id': case['id'], 'completed': len(rows), 'total': len(cases), 'error': row['error'],
                              'seconds': round(row['response_seconds'], 2)}), flush=True)
    summary = save_report(rows, args.output, metadata)
    print(json.dumps(summary, indent=2))
    return 1 if any(row['error'] for row in rows) else 0


if __name__ == '__main__':
    raise SystemExit(main())
