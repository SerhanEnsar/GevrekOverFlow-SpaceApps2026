"""Search and download NISAR GCOV scenes for a region.

Usage:
  python pipeline/fetch.py --region mugla --list                 # no login needed
  python pipeline/fetch.py --region mugla --group 108D070 --download [--limit 2]

Download needs a NASA Earthdata Login. Credentials are read from the
EARTHDATA_USERNAME / EARTHDATA_PASSWORD environment variables or from
~/.netrc (machine urs.earthdata.nasa.gov). They are never stored by this script.
"""
import argparse
import netrc
import os
import re
import sys
from collections import defaultdict

import asf_search as asf

from config import RAW, REGIONS, bbox_wkt

NAME_RE = re.compile(r"GCOV_(\d{3})_(\d{3})_([AD])_(\d{3})")


def geometry_key(file_name: str) -> str | None:
    """'NISAR_L2_PR_GCOV_035_021_D_071_...' -> '021D071' (track, direction, frame)."""
    m = NAME_RE.search(file_name)
    return f"{m.group(2)}{m.group(3)}{m.group(4)}" if m else None


def search(region: dict):
    results = asf.search(
        dataset="NISAR",
        processingLevel="GCOV",
        intersectsWith=bbox_wkt(region["bbox"]),
        start=region["search_start"],
        end=region["search_end"],
        maxResults=2000,
    )
    groups = defaultdict(dict)  # geometry -> {date: product}; keeps one product per date
    for p in results:
        name = p.properties.get("fileName") or p.properties.get("sceneName", "")
        key = geometry_key(name)
        if not key:
            continue
        date = p.properties["startTime"][:10]
        # Prefer validated (V1) over provisional when both exist for the same date
        prev = groups[key].get(date)
        if prev is None or "_PR_" in (prev.properties.get("fileName") or ""):
            groups[key][date] = p
    return groups


def print_groups(groups, event_date):
    print(f"{'geometry':10} {'pre':>4} {'post':>4}  dates (| marks the event {event_date})")
    for key in sorted(groups, key=lambda k: -len(groups[k])):
        dates = sorted(groups[key])
        pre = [d for d in dates if d < event_date]
        post = [d for d in dates if d >= event_date]
        print(f"{key:10} {len(pre):>4} {len(post):>4}  {' '.join(pre)} | {' '.join(post)}")


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
    ap.add_argument("--group", help="geometry key, e.g. 108D070")
    ap.add_argument("--download", action="store_true")
    ap.add_argument("--dates", nargs="*", help="only these dates (YYYY-MM-DD)")
    ap.add_argument("--limit", type=int, help="download at most N scenes")
    args = ap.parse_args()

    region = REGIONS[args.region]
    groups = search(region)
    if args.list or not args.download:
        print_groups(groups, region["event_date"])
        if not args.download:
            return

    key = args.group or region["default_group"]
    if key not in groups:
        sys.exit(f"Geometry group {key} not found. Run with --list.")
    items = sorted(groups[key].items())
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
