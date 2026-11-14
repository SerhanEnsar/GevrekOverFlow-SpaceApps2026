import numpy as np
import pytest
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin

from cube import build_cube
from speckle import boxcar_db

BBOX = (29.30, 36.55, 29.60, 36.80)


def utm_tif(path, value_db, epsg=32635, res=20.0):
    """Synthetic GeoTIFF in UTM 35N covering BBOX with a margin, constant dB."""
    tr = Transformer.from_crs(4326, epsg, always_xy=True)
    xs, ys = tr.transform([BBOX[0], BBOX[2], BBOX[0], BBOX[2]], [BBOX[1], BBOX[1], BBOX[3], BBOX[3]])
    x0, y1 = min(xs) - 2000, max(ys) + 2000
    w = int((max(xs) - min(xs) + 4000) / res); h = int((max(ys) - min(ys) + 4000) / res)
    arr = np.full((h, w), value_db, np.float32)
    with rasterio.open(path, "w", driver="GTiff", width=w, height=h, count=1, dtype="float32",
                       crs=f"EPSG:{epsg}", transform=from_origin(x0, y1, res, res), nodata=np.nan) as dst:
        dst.write(arr, 1)
    return path


def test_build_cube_shape_and_values(tmp_path):
    tifs = {d: {"HH": utm_tif(tmp_path / f"{d}_HH.tif", -10.0), "HV": utm_tif(tmp_path / f"{d}_HV.tif", -20.0)}
            for d in ["2026-08-15", "2026-07-22"]}
    c = build_cube(tifs, BBOX, res_deg=0.0004)
    assert c.dates == ["2026-07-22", "2026-08-15"]           # sorted
    assert c.hh.shape == c.hv.shape == (2, round(0.25 / 0.0004), round(0.30 / 0.0004))
    assert np.nanmean(c.hh) == pytest.approx(-10.0, abs=0.05)
    assert np.nanmean(c.hv) == pytest.approx(-20.0, abs=0.05)
    assert c.bbox == BBOX


def test_boxcar_keeps_constant_field():
    a = np.full((7, 7), -15.0, np.float32)
    assert np.allclose(boxcar_db(a, 3), -15.0)


def test_boxcar_averages_in_linear_power_not_db():
    a = np.full((3, 3), -20.0, np.float32)
    a[1, 1] = -10.0                     # 0.1 linear among 0.01s
    out = boxcar_db(a, 3)
    expected = 10 * np.log10((8 * 0.01 + 0.1) / 9)
    assert out[1, 1] == pytest.approx(expected, abs=1e-4)


def test_boxcar_nan_does_not_spread_and_stays_nan():
    a = np.full((5, 5), -15.0, np.float32)
    a[2, 2] = np.nan
    out = boxcar_db(a, 3)
    assert np.isnan(out[2, 2])                      # no data invented
    assert np.allclose(out[1, 1], -15.0)            # neighbour not polluted
