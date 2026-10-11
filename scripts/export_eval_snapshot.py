"""Export current indexed document IDs/hashes for reproducible evaluation labels."""
import asyncio
import json
import sys
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend'))
import asyncpg
from app.core.config import get_settings


async def main():
    conn = await asyncpg.connect(get_settings().get_postgres_dsn(), timeout=5)
    try:
        rows = await conn.fetch('SELECT document_id, car_id, source_id, section, content, metadata, content_hash FROM documents ORDER BY document_id')
        output = ROOT / 'data/documents.jsonl'
        output.parent.mkdir(exist_ok=True)
        docs = []
        for row in rows:
            doc = dict(row)
            if isinstance(doc['metadata'], str):
                doc['metadata'] = json.loads(doc['metadata'])
            docs.append(doc)
        output.write_text(''.join(json.dumps(d, ensure_ascii=False) + '\n' for d in docs), encoding='utf-8')
        print(json.dumps({'documents': len(docs), 'output': str(output)}))
    finally:
        await conn.close()


if __name__ == '__main__':
    asyncio.run(main())
