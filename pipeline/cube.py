"""Time cube on a common EPSG:4326 grid (P4).

Reprojects per-date HH/HV dB GeoTIFFs (each in its product UTM zone) onto one
lon/lat grid covering the region bbox, so every date lines up pixel by pixel.
"""
from dataclasses import dataclass
from pathlib import Path

import numpy as np
import rasterio
from rasterio.transform import from_bounds
from rasterio.warp import Resampling, reproject


@dataclass
class Cube:
    dates: list[str]
    hh: np.ndarray        # [t, y, x] float32 dB, NaN = no data
    hv: np.ndarray
    transform: object     # affine transform of the EPSG:4326 grid
    bbox: tuple           # (w, s, e, n)


def _grid(bbox, res_deg):
    w, s, e, n = bbox
    width, height = round((e - w) / res_deg), round((n - s) / res_deg)
    return width, height, from_bounds(w, s, e, n, width, height)


def _warp(path: Path, width: int, height: int, transform) -> np.ndarray:
    out = np.full((height, width), np.nan, np.float32)
    with rasterio.open(path) as src:
        reproject(
            source=rasterio.band(src, 1), destination=out,
            src_transform=src.transform, src_crs=src.crs, src_nodata=np.nan,
            dst_transform=transform, dst_crs="EPSG:4326", dst_nodata=np.nan,
            resampling=Resampling.bilinear,
        )
    return out


def build_cube(tifs: dict[str, dict[str, Path]], bbox, res_deg: float) -> Cube:
    """tifs[date]['HH'|'HV'] -> Cube with dates sorted ascending."""
    width, height, transform = _grid(bbox, res_deg)
    dates = sorted(tifs)
    hh = np.stack([_warp(tifs[d]["HH"], width, height, transform) for d in dates])
    hv = np.stack([_warp(tifs[d]["HV"], width, height, transform) for d in dates])
    return Cube(dates=dates, hh=hh, hv=hv, transform=transform, bbox=tuple(bbox))
