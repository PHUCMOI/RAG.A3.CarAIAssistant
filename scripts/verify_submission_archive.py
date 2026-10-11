"""Verify a packaged source snapshot, required files, hashes and safe paths."""
import hashlib
import argparse
import json
from pathlib import Path, PurePosixPath
import zipfile

ROOT = Path(__file__).resolve().parents[1]
REQUIRED = [
    'docker-compose.yml', 'docker-compose.bedrock.yml', '.env.example',
    'backend/requirements-rag.txt', 'backend/app/infrastructure/ai/natural_answers.py',
    'backend/app/infrastructure/ai/answer_grounding.py',
    'frontend/package-lock.json', 'database/007_text_rag.sql',
    'eval/ground_truth_submission.jsonl', 'eval/submission_ground_truth_audit.json',
    'image_service/indexes/image.index', 'image_service/indexes/image_meta.json',
    'docs/submission/technical-report.md', 'docs/submission/human-review-template.csv',
    'docs/submission/failure-analysis.md', 'docs/submission/evidence/final-smoke.json',
]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--require-complete', action='store_true',
                        help='Require all 200 release cases before verifying a final submission archive')
    args = parser.parse_args()
    archive_path = ROOT / '.local/submission/AutoWise-source.zip'
    with zipfile.ZipFile(archive_path) as archive:
        names = archive.namelist()
        if len(set(names)) != len(names) or archive.testzip():
            raise ValueError('Duplicate or corrupt archive entries')
        for name in names:
            path = PurePosixPath(name)
            if path.is_absolute() or '..' in path.parts or path.parts[0] != 'AutoWise' or '\\' in name:
                raise ValueError(f'Unsafe archive path: {name}')
            if path.name == '.env' or path.suffix.lower() in {'.pem', '.pfx', '.key'}:
                raise ValueError(f'Credential file in archive: {name}')
        manifest = json.loads(archive.read('AutoWise/SUBMISSION-MANIFEST.json'))
        expected = {'AutoWise/' + row['path'] for row in manifest}
        if set(names) != expected | {'AutoWise/SUBMISSION-MANIFEST.json'}:
            raise ValueError('Manifest does not cover exact archive contents')
        for row in manifest:
            raw = archive.read('AutoWise/' + row['path'])
            if len(raw) != row['bytes'] or hashlib.sha256(raw).hexdigest() != row['sha256']:
                raise ValueError(f"Manifest hash mismatch: {row['path']}")
        missing = [name for name in REQUIRED if 'AutoWise/' + name not in expected]
        if missing or not any(name.endswith('.pptx') and '/docs/submission/slides/' in name for name in names):
            raise ValueError(f'Missing deliverables: {missing}')
        ground_truth = archive.read('AutoWise/eval/ground_truth_submission.jsonl')
        ground_truth_hash = hashlib.sha256(ground_truth).hexdigest()
        evidence = 'AutoWise/docs/submission/evidence/'
        progress = {}
        for stem in ('live-evaluation', 'postfix-evaluation', 'referencefix-evaluation', 'release-evaluation',
                     'auditfix-evaluation', 'reference-repair-evaluation'):
            summary_name = evidence + stem + '.summary.json'
            if summary_name not in expected:
                continue
            summary = json.loads(archive.read(summary_name))
            rows = json.loads(archive.read(evidence + stem + '.responses.json'))
            ids = [row['id'] for row in rows]
            if (summary['ground_truth_sha256'] != ground_truth_hash or summary['completed_cases'] != len(rows)
                    or len(ids) != len(set(ids)) or not set(ids).issubset(summary['selected_ids'])
                    or sum(s['cases'] for s in summary['splits'].values()) != len(rows)
                    or sum(s['errors'] for s in summary['splits'].values()) != sum(bool(r['error']) for r in rows)):
                raise ValueError(f'Inconsistent evaluation checkpoint: {stem}')
            progress[stem] = dict(completed=len(rows), selected=summary['selected_cases'])
        if args.require_complete:
            release = progress.get('release-evaluation')
            if release != dict(completed=200, selected=200):
                raise ValueError('Final archive requires a completed 200-case release evaluation')
    report = dict(passed=True, files=len(manifest), evaluation_progress=progress,
                  sha256=hashlib.sha256(archive_path.read_bytes()).hexdigest(),
                  scope='Exact archive hash/manifest/path and required artifact presence; not execution or human review')
    output = archive_path.with_name('archive-verification.json')
    output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
