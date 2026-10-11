"""Verify the Compose SQL initialization sequence in an isolated disposable container."""
import json
import argparse
import hashlib
import os
import re
import sys
from pathlib import Path
import subprocess
import time
from uuid import uuid4
ROOT = Path(__file__).resolve().parents[1]
FILES = ['000_extensions.sql', '001_schema.sql', 'seed.sql', '002_add_descriptions.sql',
         '003_enrich_missing_data.sql', '004_seed_dealers.sql', '005_use_curated_image_paths.sql',
         '006_verify_seed.sql', '007_text_rag.sql']


def run(*args, check=True):
    return subprocess.run(['docker', *args], check=check, capture_output=True, text=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--backend-source', type=Path,
                        help='Run backend tests from this extracted source against the fresh database')
    args = parser.parse_args()
    backend_source = args.backend_source.resolve() if args.backend_source else None
    if backend_source and not (backend_source / 'backend/tests/conftest.py').is_file():
        raise ValueError('Backend source must contain backend/tests/conftest.py')
    seed_root = backend_source or ROOT
    name = 'autowise-seed-check-' + uuid4().hex[:12]
    command = ['run', '-d', '--name', name,
               '-e', 'POSTGRES_USER=car_rag', '-e', 'POSTGRES_DB=car_rag',
               '-e', 'POSTGRES_PASSWORD=isolated-test-only']
    command += ['-p', '127.0.0.1::5432'] if backend_source else ['--network', 'none']
    for i, filename in enumerate(FILES):
        command += ['--mount', f'type=bind,source={seed_root / "database" / filename},target=/docker-entrypoint-initdb.d/{i:03d}_{filename},readonly']
    command.append('pgvector/pgvector:pg17')
    created = False
    try:
        run(*command)
        created = True
        deadline = time.monotonic() + 60
        result = None
        while time.monotonic() < deadline:
            # TCP becomes available only after the entrypoint's temporary seed server exits.
            result = run('exec', name, 'psql', '-h', '127.0.0.1', '-U', 'car_rag', '-d', 'car_rag',
                         '-At', '-c', 'SELECT (SELECT count(*) FROM cars), (SELECT count(*) FROM car_images), (SELECT count(*) FROM dealers), (SELECT count(*) FROM warranties), (SELECT count(*) FROM sources), (SELECT count(*) FROM documents)', check=False)
            if result.returncode == 0:
                break
            state = run('inspect', name, '--format', '{{.State.Running}}').stdout.strip()
            if state != 'true':
                raise RuntimeError(run('logs', name).stderr[-4000:])
            time.sleep(1)
        if result is None or result.returncode != 0:
            raise RuntimeError('Isolated PostgreSQL did not finish initialization in 60 seconds')
        counts = list(map(int, result.stdout.strip().split('|')))
        if counts != [50, 215, 22, 9, 61, 0]:
            raise ValueError(f'Unexpected fresh seed counts: {counts}')
        report = dict(passed=True, counts=dict(zip(['cars', 'images', 'dealers', 'warranties', 'sources', 'documents'], counts)),
                      initialization_files=FILES, isolation='No host ports, no network, own temporary container and anonymous volume',
                      scope='Fresh SQL initialization; not full new-machine deployment or live model download')
        report['initialization_hashes'] = {filename: hashlib.sha256((seed_root / 'database' / filename).read_bytes()).hexdigest()
                                          for filename in FILES}
        target = ROOT / 'docs/submission/evidence/fresh-database.json'
        if backend_source:
            binding = json.loads(run('inspect', name, '--format', '{{json .NetworkSettings.Ports}}').stdout)['5432/tcp'][0]
            if binding['HostIp'] != '127.0.0.1':
                raise ValueError('Test database must be bound only to localhost')
            env = dict(os.environ, TEST_DATABASE_URL='postgresql://car_rag:isolated-test-only@127.0.0.1:' + binding['HostPort'] + '/car_rag')
            tests = subprocess.run([sys.executable, '-m', 'pytest', 'backend/tests', '-q'],
                                   cwd=backend_source, env=env, capture_output=True, text=True, timeout=180)
            output = tests.stdout + tests.stderr
            log_path = ROOT / 'docs/submission/evidence/fresh-source-backend-tests.txt'
            log_path.write_text(output, encoding='utf-8')
            if tests.returncode:
                raise RuntimeError('Extracted-source backend tests failed; inspect ' + str(log_path))
            match = re.search(r'(\d+) passed', output)
            if not match:
                raise ValueError('No successful test count in pytest output')
            report['backend_tests'] = dict(passed=int(match.group(1)), source=str(backend_source),
                                           log=log_path.name, python=sys.executable)
            manifest_path = backend_source / 'SUBMISSION-MANIFEST.json'
            if manifest_path.exists():
                manifest = json.loads(manifest_path.read_text(encoding='utf-8'))
                for row in manifest:
                    entry = backend_source / row['path']
                    if hashlib.sha256(entry.read_bytes()).hexdigest() != row['sha256']:
                        raise ValueError('Extracted source differs from manifest: ' + row['path'])
                report['source_manifest_sha256'] = hashlib.sha256(manifest_path.read_bytes()).hexdigest()
            report['isolation'] = 'Own temporary database/volume; random port bound to localhost only'
            report['scope'] = 'Extracted-source backend tests and fresh SQL initialization; host Python dependencies reused; not full deployment'
            target = ROOT / 'docs/submission/evidence/fresh-source-database.json'
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_text(json.dumps(report, indent=2), encoding='utf-8')
        print(json.dumps(report, indent=2))
    finally:
        if created:
            # Only this exact generated container and its anonymous volumes are removed.
            run('rm', '-f', '-v', name)


if __name__ == '__main__':
    main()
