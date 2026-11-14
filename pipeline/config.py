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
        # Same track/direction/frame groups with pre- and post-fire scenes (from CMR scan)
        "geometry_groups": ["108D070", "129A020", "028A020", "036D070"],
        "default_group": "108D070",
    },
}


def bbox_wkt(bbox):
    w, s, e, n = bbox
    return f"POLYGON(({w} {s},{e} {s},{e} {n},{w} {n},{w} {s}))"
