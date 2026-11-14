"""Shared configuration for the test region (Muğla–Fethiye wildfire, 2026-07-28).

The system is designed to be region-agnostic: add a new entry to REGIONS and
pass --region <name> to the pipeline scripts.
"""
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATA = ROOT / "data"
RAW = DATA / "raw"          # downloaded NISAR .h5 (deleted after subsetting)
CUBE = DATA / "cube"        # AOI-cropped GeoTIFFs per date
WEB_DATA = ROOT / "web" / "data"

REGIONS = {
    "mugla": {
        "label": "Muğla – Fethiye, Türkiye",
        # west, south, east, north (EPSG:4326)
        "bbox": (29.30, 36.55, 29.60, 36.80),
        "event_date": "2026-07-28",          # NASA EONET event 1029896
        "eonet_id": "EONET_1029896",
        "search_start": "2026-06-01",
        "search_end": "2026-10-31",
        # Geometries covering >= 90 % of the AOI (see fetch.MIN_AOI_COVERAGE):
        # 036D070 (descending) and 028A020 (ascending) cover 100 %; 108D070 and
        # 129A020 cover only ~81 % / ~72 % and are therefore not comparable here.
        "geometry_groups": ["036D070", "028A020"],
        "default_group": "036D070",
    },
    "spain": {
        "label": "Guadalajara, Spain",
        "bbox": (-3.26, 40.97, -2.86, 41.27),
        "event_date": "2026-07-17",          # NASA EONET "Wildfire in Spain 1029540", 31,297 ha
        "eonet_point": (-3.058, 41.114),
        "search_start": "2026-06-01",
        "search_end": "2026-10-31",
        "geometry_groups": [],
        "default_group": None,
    },
}


def bbox_wkt(bbox):
    w, s, e, n = bbox
    return f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"
