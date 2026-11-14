import h5py
import numpy as np
import pytest
import rasterio
from pyproj import Transformer

from subset import subset_file

BBOX = (29.30, 36.55, 29.60, 36.80)
NAME = "NISAR_L2_PR_GCOV_026_036_D_070_2005_DHDH_A_20260722T165721_20260722T165756_P05023_N_F_J_001.h5"


def fake_gcov(path, n=60, res=500.0):
    """Mimics the real GCOV layout: science/LSAR/GCOV/grids/frequencyA/..."""
    tr = Transformer.from_crs(4326, 32635, always_xy=True)
    cx, cy = tr.transform(29.45, 36.675)
    x = cx - n / 2 * res + res / 2 + np.arange(n) * res
    y = cy + n / 2 * res - res / 2 - np.arange(n) * res          # descending, like the product
    hh = np.full((n, n), 0.01, np.float32)                       # -20 dB
    hv = np.full((n, n), 0.001, np.float32)                      # -30 dB
    mask = np.ones((n, n), np.uint8)                             # subswath 1 = valid
    hh[30, 30] = 0.0                                             # zero power -> NaN
    mask[31, 31] = 0                                             # partially focused -> NaN
    mask[32, 32] = 255                                           # outside acquisition -> NaN
    with h5py.File(path, "w") as f:
        g = f.create_group("science/LSAR/GCOV/grids/frequencyA")
        g["HHHH"], g["HVHV"], g["mask"] = hh, hv, mask
        g["xCoordinates"], g["yCoordinates"] = x, y
        p = g.create_dataset("projection", data=np.uint32(32635))
        p.attrs["epsg_code"] = np.int64(32635)
    return path, x, y


def test_subset_writes_db_tifs_for_both_polarizations(tmp_path):
    path, _, _ = fake_gcov(tmp_path / NAME)
    out = subset_file(path, BBOX, tmp_path)
    assert sorted(p.name for p in out) == ["2026-07-22_HH.tif", "2026-07-22_HV.tif"]
    with rasterio.open(tmp_path / "2026-07-22_HH.tif") as hh, rasterio.open(tmp_path / "2026-07-22_HV.tif") as hv:
        assert hh.crs.to_epsg() == 32635
        assert np.nanmedian(hh.read(1)) == pytest.approx(-20.0, abs=0.01)
        assert np.nanmedian(hv.read(1)) == pytest.approx(-30.0, abs=0.01)


def test_zero_power_and_masked_pixels_become_nan(tmp_path):
    path, x, y = fake_gcov(tmp_path / NAME)
    subset_file(path, BBOX, tmp_path)
    with rasterio.open(tmp_path / "2026-07-22_HH.tif") as src:
        a = src.read(1)
        for r, c in [(30, 30), (31, 31), (32, 32)]:
            row, col = src.index(x[c], y[r])
            assert np.isnan(a[row, col]), (r, c)
