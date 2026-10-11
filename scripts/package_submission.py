"""Package current source and evidence without local credentials/build caches."""
import hashlib
import json
from pathlib import Path
import subprocess
import zipfile
ROOT = Path(__file__).resolve().parents[1]


def main():
    tracked = subprocess.check_output(['git', 'ls-files', '-z', '--cached', '--others', '--exclude-standard'], cwd=ROOT)
    paths = sorted(set(p.decode('utf-8') for p in tracked.split(b'\0') if p))
    output = ROOT / '.local/submission/AutoWise-source.zip'
    output.parent.mkdir(parents=True, exist_ok=True)
    manifest = []
    with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as archive:
        for name in paths:
            source = ROOT / name
            if source.is_symlink():
                raise ValueError('Symlinks are not supported in the submission archive')
            path = source.resolve()
            if not path.is_relative_to(ROOT) or not path.is_file():
                continue
            if path.name == '.env' or path.name.endswith('.tsbuildinfo') or any(p in
                    {'.git', '.local', '.venv', '__pycache__', 'node_modules', 'bin', 'obj', 'test-results', 'playwright-report'} for p in path.parts):
                continue
            raw = path.read_bytes()
            manifest.append(dict(path=name, bytes=len(raw), sha256=hashlib.sha256(raw).hexdigest()))
            archive.writestr('AutoWise/' + name, raw)
        archive.writestr('AutoWise/SUBMISSION-MANIFEST.json', json.dumps(manifest, indent=2))
    report = dict(archive=str(output), files=len(manifest), sha256=hashlib.sha256(output.read_bytes()).hexdigest(),
                  git_head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                  working_tree_dirty=bool(subprocess.check_output(['git', 'status', '--porcelain'], cwd=ROOT, text=True).strip()),
                  scope='Current source snapshot with exact file manifest; Git identity and dirty state recorded separately')
    output.with_suffix('.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))


if __name__ == '__main__':
    main()
