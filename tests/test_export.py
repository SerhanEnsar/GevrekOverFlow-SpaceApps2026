import json

import numpy as np
import pytest
from rasterio.transform import from_bounds

from cube import Cube
from export import decode_db, encode_db, write_web_bundle

BBOX = (29.30, 36.55, 29.60, 36.80)
DATES = ["2026-07-10", "2026-07-22", "2026-08-15", "2026-09-08"]


def cube(res):
    w, h = round(0.30 / res), round(0.25 / res)
    rng = np.random.default_rng(0)
    hh = rng.uniform(-20, -5, (len(DATES), h, w)).astype(np.float32)
    hv = rng.uniform(-28, -10, (len(DATES), h, w)).astype(np.float32)
    hh[:, 0, 0] = np.nan
    return Cube(DATES, hh, hv, from_bounds(*BBOX, w, h), BBOX)


def test_encode_decode_round_trip_within_half_step():
    x = np.array([-29.0, -15.123, 0.0, 8.0], np.float32)
    assert np.max(np.abs(decode_db(encode_db(x)) - x)) <= 0.075 + 1e-6


def test_nan_round_trips_and_out_of_range_is_clipped():
    u = encode_db(np.array([np.nan, -60.0, 40.0]))
    assert u[0] == 0 and u[1] == 1 and u[2] == 255
    assert np.isnan(decode_db(u)[0])


@pytest.fixture(scope="module")
def bundle(tmp_path_factory):
    out = tmp_path_factory.mktemp("web") / "mugla"
    cal = {"event_date": "2026-07-28", "groups": [{"geometry": "036D070", "pre": DATES[:2], "post": DATES[2:]}]}
    write_web_bundle(cube(0.0002), cube(0.0004), cal, "mugla", out, geometry="036D070")
    return out


def test_manifest_matches_contract(bundle):
    m = json.loads((bundle / "manifest.json").read_text())
    assert set(m) >= {"region", "label", "bbox", "event_date", "geometry", "dates", "grid",
                      "db_scale", "frames", "change", "multidate"}
    assert m["dates"] == DATES and m["geometry"] == "036D070"
    assert m["grid"] == {"width": 750, "height": 625}
    assert m["db_scale"] == {"offset": -30.0, "step": 0.15}
    assert sorted(m["frames"]) == DATES
    assert sorted(m["change"]) == DATES[1:]          # each date vs the previous comparable date
    for rel in list(m["frames"].values()) + list(m["change"].values()) + [m["multidate"]]:
        assert (bundle / rel).exists()


def test_timeseries_layout_and_size(bundle):
    raw = (bundle / "timeseries.bin").read_bytes()
    assert len(raw) == len(DATES) * 2 * 625 * 750
    assert raw[0] == 0                                # NaN pixel at (0, 0) of HH, t=0


def test_bundle_fits_size_budget(bundle):
    total = sum(p.stat().st_size for p in bundle.rglob("*") if p.is_file())
    biggest = max(p.stat().st_size for p in bundle.rglob("*") if p.is_file())
    assert total <= 40 * 1024**2 and biggest <= 25 * 1024**2
