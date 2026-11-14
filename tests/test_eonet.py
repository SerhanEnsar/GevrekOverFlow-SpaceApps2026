import json

from eonet import compact_events, write_fires


def ev(i, date, lon, lat, mag=None, unit=None, title="Wildfire X"):
    g = {"date": date, "type": "Point", "coordinates": [lon, lat]}
    if mag is not None:
        g.update(magnitudeValue=mag, magnitudeUnit=unit)
    return {"id": f"EONET_{i}", "title": title, "geometry": [g]}


def test_compact_uses_latest_point_converts_acres_and_sorts_newest_first():
    e1 = ev(1, "2026-07-17T10:00:00Z", -3.058123456, 41.114, 31297, "hectare", "Wildfire in Spain")
    e1["geometry"].insert(0, {"date": "2026-07-10T00:00:00Z", "type": "Point", "coordinates": [0, 0]})
    e2 = ev(2, "2026-08-01T00:00:00Z", 10, 20, 1000, "acres")
    rows = compact_events([e1, e2])
    assert rows[0] == ["EONET_2", "Wildfire X", "2026-08-01", 10.0, 20.0, 405]
    assert rows[1] == ["EONET_1", "Wildfire in Spain", "2026-07-17", -3.0581, 41.114, 31297]


def test_polygon_events_use_their_centroid_and_missing_magnitude_is_none():
    e = {"id": "EONET_3", "title": "P", "geometry": [{"date": "2026-09-01T00:00:00Z", "type": "Polygon",
                                                     "coordinates": [[[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]]}]}
    assert compact_events([e]) == [["EONET_3", "P", "2026-09-01", 1.0, 1.0, None]]


def test_write_fires(tmp_path):
    out = write_fires([["EONET_1", "A", "2026-07-17", 1.0, 2.0, 5]], tmp_path / "fires.json", "2026-11-14")
    data = json.loads(out.read_text())
    assert data == {"generated": "2026-11-14", "fields": ["id", "title", "date", "lon", "lat", "ha"],
                    "events": [["EONET_1", "A", "2026-07-17", 1.0, 2.0, 5]]}
