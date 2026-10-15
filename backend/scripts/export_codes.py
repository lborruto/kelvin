"""Write web/src/lib/i18n/api-codes.json from the backend's code catalogue.

Run after adding or changing an error or label code:
`cd backend && uv run python scripts/export_codes.py`.
Offline: it reads only the backend's own tables (no Overkiz, no MyElectricalData).
"""

from pathlib import Path

from kelvin.catalogue import catalogue, dump

OUT = Path(__file__).resolve().parents[2] / "web" / "src" / "lib" / "i18n" / "api-codes.json"

if __name__ == "__main__":
    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(dump(catalogue()), encoding="utf-8")
    print(f"wrote {OUT}")
