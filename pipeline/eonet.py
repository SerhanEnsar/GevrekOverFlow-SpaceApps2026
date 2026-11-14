"""Snapshot of NASA EONET wildfire events for the web app's fire bar (90 days / 1 year).

The 1-year EONET response is ~7 MB; the app only needs id, title, date, position and size,
so they are written compactly to web/data/global/fires.json. The last 30 days are also
fetched live in the browser, so the snapshot only has to be refreshed now and then.

  python pipeline/eonet.py --days 365
"""
import argparse
import datetime as dt
import json
from pathlib import Path

import requests

EONET = "https://eonet.gsfc.nasa.gov/api/v3/events"
ACRE_HA = 0.404686


def _point(g: dict) -> tuple[float, float]:
    if g["type"] == "Point":
        return g["coordinates"][0], g["coordinates"][1]
    ring = g["coordinates"][0]                     # Polygon: mean of the outer ring (without the closing point)
    pts = ring[:-1] if ring[0] == ring[-1] else ring
    return sum(p[0] for p in pts) / len(pts), sum(p[1] for p in pts) / len(pts)


def compact_events(events: list[dict]) -> list[list]:
    """EONET events -> [id, title, date, lon, lat, ha] rows (latest geometry), newest first."""
    rows = []
    for e in events:
        g = max(e["geometry"], key=lambda x: x["date"])
        lon, lat = _point(g)
        mag, unit = g.get("magnitudeValue"), g.get("magnitudeUnit")
        ha = None if mag is None else round(mag * ACRE_HA) if unit == "acres" else round(mag)
        rows.append([e["id"], e["title"], g["date"][:10], round(lon, 4), round(lat, 4), ha])
    return sorted(rows, key=lambda r: (r[2], r[0]), reverse=True)


def write_fires(rows: list[list], out: Path, generated: str) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps({"generated": generated, "fields": ["id", "title", "date", "lon", "lat", "ha"],
                               "events": rows}, separators=(",", ":"), ensure_ascii=False))
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=365)
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "web/data/global/fires.json")
    args = ap.parse_args()
    r = requests.get(EONET, params={"category": "wildfires", "status": "all", "days": args.days, "limit": 50000},
                     timeout=300)
    r.raise_for_status()
    rows = compact_events(r.json()["events"])
    out = write_fires(rows, args.out, str(dt.date.today()))
    print(f"{out} ({len(rows)} events, {out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
