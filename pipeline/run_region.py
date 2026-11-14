"""End-to-end: cropped GeoTIFFs -> time cubes -> web bundle.

Usage (after fetch.py --download and subset.py):
  python pipeline/run_region.py --region mugla --group 036D070
"""
import argparse
import re
from collections import defaultdict
from pathlib import Path

from config import CUBE, REGIONS, WEB_DATA
from cube import build_cube
from export import write_web_bundle
from fetch import scene_records
from geometry import comparable_calendar, group_scenes
from speckle import boxcar_db

_TIF_RE = re.compile(r"(\d{4}-\d{2}-\d{2})_(HH|HV)\.tif$")


def collect_tifs(folder: Path) -> dict[str, dict[str, Path]]:
    tifs: dict[str, dict[str, Path]] = defaultdict(dict)
    for p in folder.glob("*.tif"):
        m = _TIF_RE.search(p.name)
        if m:
            tifs[m.group(1)][m.group(2)] = p
    return {d: pols for d, pols in tifs.items() if {"HH", "HV"} <= set(pols)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="mugla", choices=REGIONS)
    ap.add_argument("--group")
    args = ap.parse_args()
    region = REGIONS[args.region]
    group = args.group or region["default_group"]

    tifs = collect_tifs(CUBE / args.region / group)
    if not tifs:
        raise SystemExit(f"No HH+HV GeoTIFFs in {CUBE / args.region / group}. Run subset.py first.")
    print(f"{len(tifs)} dates: {', '.join(sorted(tifs))}")

    cube20 = build_cube(tifs, region["bbox"], res_deg=0.0002)
    cube40 = build_cube(tifs, region["bbox"], res_deg=0.0004)
    for c in (cube20, cube40):
        for t in range(len(c.dates)):
            c.hh[t], c.hv[t] = boxcar_db(c.hh[t]), boxcar_db(c.hv[t])

    calendar = comparable_calendar(group_scenes(scene_records(region)), region["event_date"])
    out = write_web_bundle(cube20, cube40, calendar, args.region, WEB_DATA / args.region, geometry=group)
    size = sum(p.stat().st_size for p in out.rglob("*") if p.is_file()) / 1024**2
    print(f"bundle → {out} ({size:.1f} MB)")


if __name__ == "__main__":
    main()
