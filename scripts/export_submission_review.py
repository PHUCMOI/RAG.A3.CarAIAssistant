"""Export a blank human-review worksheet; never infer reviewer approval."""
import csv
import argparse
import json
import hashlib
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def main():
    folder = ROOT / 'docs/submission'
    parser = argparse.ArgumentParser()
    parser.add_argument('--responses', type=Path, default=folder / 'evidence/live-evaluation.responses.json')
    parser.add_argument('--output', type=Path, default=folder / 'human-review-template.csv')
    args = parser.parse_args()
    cases = [json.loads(line) for line in (ROOT / 'eval/ground_truth_submission.jsonl').read_text(encoding='utf-8').splitlines() if line.strip()]
    responses_path = args.responses
    responses = {r['id']: r for r in json.loads(responses_path.read_text(encoding='utf-8'))} if responses_path.exists() else {}
    responses_hash = hashlib.sha256(responses_path.read_bytes()).hexdigest() if responses_path.exists() else ''
    output = args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    if output.exists():
        with output.open(encoding='utf-8-sig', newline='') as handle:
            review_fields = ('reviewed_by', 'reviewed_at', 'ground_truth_correct', 'supported_claims',
                             'total_claims', 'correct_required_facts', 'total_required_facts',
                             'faithfulness', 'completeness', 'review_notes')
            if any(any(row.get(field) for field in review_fields) or row.get('review_status') != 'pending'
                   for row in csv.DictReader(handle)):
                raise ValueError('Review worksheet contains human edits; preserve it and export to a separate file')
    rows = []
    for case in cases:
        response = responses.get(case['id'], {})
        rows.append(dict(id=case['id'], response_source=responses_path.name,
            response_archive_sha256=responses_hash,
            assigned_reviewer=(case['assigned_member'] % 4) + 1,
            question=case['question'], image=case.get('image', ''),
            expected_intent=case['intent'], expected_status=case['expected_status'],
            relevant_context_ids=json.dumps(case['relevant_context_ids'], ensure_ascii=False),
            required_answer_facts=json.dumps(case['required_answer_facts'], ensure_ascii=False),
            response_recorded=bool(response), runtime_error=response.get('error', ''), answer=response.get('answer', ''),
            retrieved_context_ids=response.get('retrieved_context_ids', ''),
            answer_context_ids=response.get('answer_context_ids', ''),
            citations=response.get('citations', ''),
            data_review_hint=('Check UK specifications, Vietnam reference price and image model year independently; '
                              'do not assume the same generation/trim.'
                              if 'car_36_4' in case.get('expected_car_ids', []) else ''),
            review_status='pending', reviewed_by='', reviewed_at='', ground_truth_correct='',
            supported_claims='', total_claims='', correct_required_facts='', total_required_facts='',
            faithfulness='', completeness='', review_notes=''))
    with output.open('w', encoding='utf-8-sig', newline='') as handle:
        writer = csv.DictWriter(handle, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)
    print(f'{len(rows)} pending review rows exported to {output}')


if __name__ == '__main__':
    main()
