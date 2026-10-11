"""Record runtime image identity and source hashes without configuration secrets."""
from datetime import datetime, timezone
import argparse
import hashlib
import json
from pathlib import Path
import subprocess

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, default=ROOT / 'docs/submission/evidence/runtime-identity.json')
    args = parser.parse_args()
    command = ['docker', 'compose', '-f', 'docker-compose.yml', '-f', 'docker-compose.bedrock.yml', 'ps', '--format', 'json']
    raw = subprocess.check_output(command, cwd=ROOT, text=True)
    services = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        item = json.loads(line)
        identity = subprocess.check_output(['docker', 'inspect', '--format', '{{.Image}}', item['ID']], text=True).strip()
        services.append(dict(service=item['Service'], image=item['Image'], image_id=identity,
                             state=item['State'], health=item.get('Health', ''), created_at=item['CreatedAt']))
    source = []
    for folder in ('backend/app', 'image_service/app', 'services/owner-features/src', 'frontend/src'):
        if not (ROOT / folder).is_dir():
            raise ValueError(f'Missing source folder: {folder}')
        for path in sorted((ROOT / folder).rglob('*')):
            if path.is_file() and path.suffix in {'.py', '.cs', '.ts', '.tsx', '.json', '.csproj'} and not any(p in {'bin', 'obj', '__pycache__'} for p in path.parts):
                source.append(dict(path=path.relative_to(ROOT).as_posix(), sha256=hashlib.sha256(path.read_bytes()).hexdigest()))
    report = dict(recorded_at=datetime.now(timezone.utc).isoformat(),
                  git_head=subprocess.check_output(['git', 'rev-parse', 'HEAD'], cwd=ROOT, text=True).strip(),
                  scope='Working tree source hashes and current Docker image identities; source includes uncommitted changes',
                  services=services, source=source)
    output = args.output
    output.parent.mkdir(parents=True, exist_ok=True)
    output.write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(f'{len(services)} service identities and {len(source)} source hashes saved')


if __name__ == '__main__':
    main()
