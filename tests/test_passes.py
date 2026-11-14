import json

from passes import footprints_from_cmr, write_passes

# CMR granules.json polygons are "lat lon lat lon ..." strings (first ring = outer)
SQUARE = "36.0 29.0 36.0 30.0 37.0 30.0 37.0 29.0 36.0 29.0"


def entry(polygon=SQUARE, start="2026-11-10T03:15:00.000Z", title="NISAR_L2_GCOV_x"):
    return {"title": title, "time_start": start, "polygons": [[polygon]]}


def test_footprint_is_lon_lat_closed_ring_with_date():
    [f] = footprints_from_cmr([entry()])
    ring = f["geometry"]["coordinates"][0]
    assert f["geometry"]["type"] == "Polygon"
    assert ring[0] == [29.0, 36.0]          # lon, lat order
    assert ring[0] == ring[-1]              # closed
    assert f["properties"]["date"] == "2026-11-10"


def test_long_rings_are_reduced_to_at_most_max_points():
    pts = " ".join(f"{36 + i * 0.001} {29 + (i % 2) * 0.001}" for i in range(200))
    [f] = footprints_from_cmr([entry(polygon=pts)], max_points=12)
    assert len(f["geometry"]["coordinates"][0]) <= 13   # 12 + closing point


def test_antimeridian_crossing_footprints_are_skipped():
    crossing = "60.0 179.5 60.0 -179.5 61.0 -179.5 61.0 179.5 60.0 179.5"
    assert footprints_from_cmr([entry(polygon=crossing)]) == []


def test_entries_without_polygons_are_skipped():
    assert footprints_from_cmr([{"title": "x", "time_start": "2026-11-10T00:00:00Z"}]) == []


def test_write_passes_writes_feature_collection(tmp_path):
    out = tmp_path / "global" / "passes.geojson"
    write_passes(footprints_from_cmr([entry(), entry(start="2026-11-11T00:00:00Z")]), out)
    fc = json.loads(out.read_text())
    assert fc["type"] == "FeatureCollection"
    assert [f["properties"]["date"] for f in fc["features"]] == ["2026-11-10", "2026-11-11"]
