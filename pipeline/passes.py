"""Recent NISAR pass footprints for the globe view (G7).

Writes a small GeoJSON of where NISAR acquired GCOV scenes in the last N days,
from the NASA CMR catalogue (no login needed). The browser loads this file
instead of the multi-megabyte CMR response.

Usage:
  python pipeline/passes.py --days 12 --out web/data/global/passes.geojson
"""
import argparse
import datetime as dt
import json
from pathlib import Path

import requests

CMR = "https://cmr.earthdata.nasa.gov/search/granules.json"
COLLECTIONS = ["NISAR_L2_GCOV_V1", "NISAR_UR_L2"]


def _ring_from_cmr(polygon: str) -> list[list[float]]:
    v = [float(x) for x in polygon.split()]
    return [[v[i + 1], v[i]] for i in range(0, len(v) - 1, 2)]  # lat lon -> lon lat


def _reduce(ring: list[list[float]], max_points: int) -> list[list[float]]:
    body = ring[:-1] if ring[0] == ring[-1] else ring
    if len(body) > max_points:
        step = len(body) / max_points
        body = [body[int(i * step)] for i in range(max_points)]
    return body + [body[0]]


def footprints_from_cmr(entries: list[dict], max_points: int = 12) -> list[dict]:
    """CMR granule entries -> GeoJSON Polygon features with a 'date' property."""
    features = []
    for e in entries:
        polys = e.get("polygons")
        if not polys:
            continue
        ring = _ring_from_cmr(polys[0][0])
        lons = [p[0] for p in ring]
        if max(lons) - min(lons) > 180:  # crosses the antimeridian; skip rather than draw across the globe
            continue
        features.append({
            "type": "Feature",
            "geometry": {"type": "Polygon", "coordinates": [_reduce(ring, max_points)]},
            "properties": {"date": e["time_start"][:10]},
        })
    return features


def clean_features(features: list[dict], start: str) -> list[dict]:
    """Drop granules that started before `start` (CMR returns anything overlapping the window),
    keep one feature per footprint (the latest date) and round coordinates to 3 decimals (~100 m)."""
    by_geom: dict[str, dict] = {}
    for f in features:
        if f["properties"]["date"] < start:
            continue
        ring = [[round(x, 3), round(y, 3)] for x, y in f["geometry"]["coordinates"][0]]
        g = {"type": "Feature", "properties": dict(f["properties"]),
             "geometry": {"type": "Polygon", "coordinates": [ring]}}
        key = json.dumps(ring)
        if key not in by_geom or by_geom[key]["properties"]["date"] < g["properties"]["date"]:
            by_geom[key] = g
    return sorted(by_geom.values(), key=lambda f: f["properties"]["date"])


def write_passes(features: list[dict], out: Path) -> Path:
    out.parent.mkdir(parents=True, exist_ok=True)
    fc = {"type": "FeatureCollection", "features": sorted(features, key=lambda f: f["properties"]["date"])}
    out.write_text(json.dumps(fc, separators=(",", ":")))
    return out


def fetch_entries(days: int, end: dt.date) -> list[dict]:
    start = end - dt.timedelta(days=days)
    entries = []
    for short_name in COLLECTIONS:
        page = 1
        while True:
            r = requests.get(CMR, params={
                "short_name": short_name, "page_size": 2000, "page_num": page,
                "temporal": f"{start}T00:00:00Z,{end}T23:59:59Z",
            }, timeout=120)
            r.raise_for_status()
            batch = r.json()["feed"]["entry"]
            entries += batch
            if len(batch) < 2000:
                break
            page += 1
    return entries


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--days", type=int, default=12)   # one full NISAR repeat cycle
    ap.add_argument("--end", type=dt.date.fromisoformat, default=dt.date.today())
    ap.add_argument("--out", type=Path, default=Path(__file__).resolve().parent.parent / "web/data/global/passes.geojson")
    args = ap.parse_args()
    start = str(args.end - dt.timedelta(days=args.days))
    features = clean_features(footprints_from_cmr(fetch_entries(args.days, args.end)), start)
    out = write_passes(features, args.out)
    print(f"{out} ({out.stat().st_size // 1024} KB)")


if __name__ == "__main__":
    main()
