"""Write the web data bundle (P13). Contract: see README / web/js/data.js.

  manifest.json   region metadata, dates, grid, dB scale, file paths
  frames/<d>.webp RGB composite per date (20 m grid)
  change/<d>.webp change vs the previous comparable date (20 m grid)
  multidate.webp  HV of (last pre-event, first post-event, last date) as RGB
  timeseries.bin  uint8[dates][HH, HV][height][width] on the 40 m grid; 0 = no data
  calendar.json   comparable-date calendar (all geometry groups)
"""
import json
from pathlib import Path

import numpy as np
from PIL import Image

from change import change_rgba, log_ratio
from config import REGIONS
from cube import Cube
from frames import multidate_rgb, rgb_composite

DB_OFFSET, DB_STEP = -30.0, 0.15          # dB = offset + step * v, v in 1..255; 0 = no data


def encode_db(db: np.ndarray) -> np.ndarray:
    v = np.round((np.asarray(db, np.float64) - DB_OFFSET) / DB_STEP)
    v = np.clip(np.nan_to_num(v, nan=0.0), 1, 255)
    v[~np.isfinite(np.asarray(db, np.float64))] = 0
    return v.astype(np.uint8)


def decode_db(u: np.ndarray) -> np.ndarray:
    u = np.asarray(u)
    return np.where(u == 0, np.nan, DB_OFFSET + DB_STEP * u.astype(np.float32))


def _webp(rgba: np.ndarray, path: Path) -> Path:
    path.parent.mkdir(parents=True, exist_ok=True)
    Image.fromarray(rgba, "RGBA").save(path, "WEBP", quality=82, method=6)
    return path


def write_web_bundle(cube20: Cube, cube40: Cube, calendar: dict, region_key: str, out_dir: Path,
                     geometry: str) -> Path:
    out_dir = Path(out_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    region = REGIONS[region_key]
    event = region["event_date"]
    dates = cube20.dates

    frames, change = {}, {}
    for t, d in enumerate(dates):
        rel = f"frames/{d}.webp"
        _webp(rgb_composite(cube20.hh[t], cube20.hv[t]), out_dir / rel)
        frames[d] = rel
        if t > 0:
            rel = f"change/{d}.webp"
            _webp(change_rgba(log_ratio(cube20.hv[t - 1], cube20.hv[t])), out_dir / rel)
            change[d] = rel

    pre = [i for i, d in enumerate(dates) if d < event]
    post = [i for i, d in enumerate(dates) if d >= event]
    if pre and post:
        _webp(multidate_rgb(cube20.hv[pre[-1]], cube20.hv[post[0]], cube20.hv[-1]), out_dir / "multidate.webp")

    ts = np.stack([np.stack([encode_db(cube40.hh[t]), encode_db(cube40.hv[t])]) for t in range(len(cube40.dates))])
    (out_dir / "timeseries.bin").write_bytes(ts.tobytes(order="C"))
    (out_dir / "calendar.json").write_text(json.dumps(calendar, indent=1))

    manifest = {
        "region": region_key,
        "label": region["label"],
        "bbox": list(cube40.bbox),
        "event_date": event,
        "geometry": geometry,
        "dates": cube40.dates,
        "grid": {"width": int(cube40.hh.shape[2]), "height": int(cube40.hh.shape[1])},
        "db_scale": {"offset": DB_OFFSET, "step": DB_STEP},
        "frames": frames,
        "change": change,
        "multidate": "multidate.webp" if pre and post else None,
        "sources": ["NISAR L2 GCOV (NASA-ISRO), ASF DAAC"],
    }
    (out_dir / "manifest.json").write_text(json.dumps(manifest, indent=1, ensure_ascii=False))
    return out_dir
