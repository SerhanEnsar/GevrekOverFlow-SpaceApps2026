"""NISAR scene geometry grouping (P1).

Change detection is only valid between scenes acquired from the same orbit
track, direction and frame. This module groups scenes by that geometry and
builds the calendar of comparable dates the web timeline shows.
"""
import re

_NAME_RE = re.compile(r"GCOV_(\d{3})_(\d{3})_([AD])_(\d{3})")


def geometry_key(file_name: str) -> str | None:
    """'NISAR_L2_PR_GCOV_035_021_D_071_...' -> '021D071' (track, direction, frame)."""
    m = _NAME_RE.search(file_name)
    return f"{m.group(2)}{m.group(3)}{m.group(4)}" if m else None


def _is_provisional(file_name: str) -> bool:
    return "_PR_" in file_name


def group_scenes(records: list[dict]) -> dict[str, dict[str, dict]]:
    """Group scene records as geometry -> date -> record.

    A record is {"file_name", "date", "covers_aoi"}. Scenes that do not cover
    the AOI are dropped. When both a provisional and a validated (V1) product
    exist for the same geometry and date, the validated one is kept.
    """
    groups: dict[str, dict[str, dict]] = {}
    for r in records:
        if not r.get("covers_aoi"):
            continue
        key = geometry_key(r["file_name"])
        if key is None:
            continue
        dates = groups.setdefault(key, {})
        prev = dates.get(r["date"])
        if prev is None or (_is_provisional(prev["file_name"]) and not _is_provisional(r["file_name"])):
            dates[r["date"]] = r
    return groups


def comparable_calendar(groups: dict[str, dict[str, dict]], event_date: str) -> dict:
    """Comparable dates per geometry, split at the event date, most scenes first."""
    out = []
    for key, dates in groups.items():
        ordered = sorted(dates)
        out.append({
            "geometry": key,
            "pre": [d for d in ordered if d < event_date],
            "post": [d for d in ordered if d >= event_date],
        })
    out.sort(key=lambda g: (-(len(g["pre"]) + len(g["post"])), g["geometry"]))
    return {"event_date": event_date, "groups": out}
