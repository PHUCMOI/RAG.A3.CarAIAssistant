import os
import sys
from pathlib import Path
import uvicorn

# Ensure the backend directory is in sys.path
backend_dir = Path(__file__).resolve().parent
if str(backend_dir) not in sys.path:
    sys.path.insert(0, str(backend_dir))

from app.core.config import get_settings

if __name__ == "__main__":
    settings = get_settings()
    port = int(os.getenv("PORT", settings.port))
    host = os.getenv("HOST", settings.host)

    print(f"Starting AutoWise API server on http://{host}:{port}")
    print(f"API Docs available at http://localhost:{port}/docs and http://localhost:{port}/swagger")

    is_dev = os.getenv("ENVIRONMENT", "development").lower() == "development"
    reload_flag = os.getenv("RELOAD", "true" if is_dev else "false").lower() in ("true", "1")

    uvicorn.run(
        "app.main:app",
        host=host,
        port=port,
        reload=reload_flag,
    )
