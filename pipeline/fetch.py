"""Search and download NISAR GCOV scenes for a region.

Usage:
  python pipeline/fetch.py --region mugla --list                 # no login needed
  python pipeline/fetch.py --region mugla --calendar web/data/mugla/calendar.json
  python pipeline/fetch.py --region mugla --group 108D070 --download [--limit 2]

Download needs a NASA Earthdata Login. Credentials are read from the
EARTHDATA_USERNAME / EARTHDATA_PASSWORD environment variables or from
~/.netrc (machine urs.earthdata.nasa.gov). They are never stored by this script.
"""
import argparse
import json
import netrc
import os
import sys
from pathlib import Path

import asf_search as asf
from shapely.geometry import box, shape

from config import RAW, REGIONS, bbox_wkt
from geometry import comparable_calendar, group_scenes

# A scene must cover at least this share of the AOI to count as comparable.
MIN_AOI_COVERAGE = 0.9


def scene_records(region: dict) -> list[dict]:
    """Search NISAR GCOV scenes intersecting the region; one record per product."""
    aoi = box(*region["bbox"])
    results = asf.search(
        dataset="NISAR",
        processingLevel="GCOV",
        intersectsWith=bbox_wkt(region["bbox"]),
        start=region["search_start"],
        end=region["search_end"],
        maxResults=2000,
    )
    records = []
    for p in results:
        name = p.properties.get("fileName") or p.properties.get("sceneName", "")
        footprint = shape(p.geometry)
        records.append({
            "file_name": name,
            "date": p.properties["startTime"][:10],
            "covers_aoi": footprint.intersection(aoi).area / aoi.area >= MIN_AOI_COVERAGE,
            "product": p,
        })
    return records


def print_calendar(calendar: dict):
    print(f"{'geometry':10} {'pre':>4} {'post':>4}  dates (| marks the event {calendar['event_date']})")
    for g in calendar["groups"]:
        print(f"{g['geometry']:10} {len(g['pre']):>4} {len(g['post']):>4}  {' '.join(g['pre'])} | {' '.join(g['post'])}")


def earthdata_session():
    user = os.environ.get("EARTHDATA_USERNAME")
    pwd = os.environ.get("EARTHDATA_PASSWORD")
    if not (user and pwd):
        try:
            auth = netrc.netrc().authenticators("urs.earthdata.nasa.gov")
            if auth:
                user, _, pwd = auth
        except (FileNotFoundError, netrc.NetrcParseError):
            pass
    if not (user and pwd):
        sys.exit(
            "Earthdata Login not found. Set EARTHDATA_USERNAME/EARTHDATA_PASSWORD "
            "or add 'machine urs.earthdata.nasa.gov login <user> password <pass>' to ~/.netrc"
        )
    return asf.ASFSession().auth_with_creds(user, pwd)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--region", default="mugla", choices=REGIONS)
    ap.add_argument("--list", action="store_true", help="list geometry groups and dates")
    ap.add_argument("--calendar", type=Path, help="write the comparable-date calendar JSON here")
    ap.add_argument("--group", help="geometry key, e.g. 108D070")
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--dates", nargs="*", help="only these dates (YYYY-MM-DD)")
    ap.add_argument("--limit", type=int, help="download at most N scenes")
    args = ap.parse_args()

    region = REGIONS[args.region]
    groups = group_scenes(scene_records(region))
    calendar = comparable_calendar(groups, region["event_date"])
    if args.calendar:
        args.calendar.parent.mkdir(parents=True, exist_ok=True)
        args.calendar.write_text(json.dumps(calendar, indent=1))
        print(f"calendar → {args.calendar}")
    if args.list or not (args.download or args.calendar):
        print_calendar(calendar)
    if not args.download:
        return

    key = args.group or region["default_group"]
    if key not in groups:
        sys.exit(f"Geometry group {key} not found. Run with --list.")
    items = sorted((d, r["product"]) for d, r in groups[key].items())
    if args.dates:
        items = [(d, p) for d, p in items if d in set(args.dates)]
    if args.limit:
        items = items[: args.limit]

    out = RAW / args.region / key
    out.mkdir(parents=True, exist_ok=True)
    session = earthdata_session()
    for date, product in items:
        name = product.properties["fileName"]
        if (out / name).exists():
            print(f"skip {date} (exists)")
            continue
        print(f"download {date} {name}")
        # Only the main .h5 (browse PNGs are listed as additional files)
        product.download(path=str(out), session=session, fileType=asf.FileDownloadType.DEFAULT_FILE)
    print(f"done → {out}")


if __name__ == "__main__":
    main()
