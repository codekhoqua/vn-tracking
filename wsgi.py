from __future__ import annotations

import os
import sys
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(BASE_DIR))

from dotenv import load_dotenv  # noqa: E402
load_dotenv(BASE_DIR / ".env")

from app import app  # noqa: E402,F401

if __name__ == "__main__":
    app.run(port=int(os.getenv("PORT", "8105")))
