from geometry import comparable_calendar, geometry_key, group_scenes

PR = "NISAR_L2_PR_GCOV_035_108_D_070_2005_DHDH_A_20260727T031500_20260727T031530_P05036_N_F_J_001.h5"
V1 = "NISAR_L2_GCOV_035_108_D_070_2005_DHDH_A_20260727T031500_20260727T031530_P05036_N_F_J_001.h5"


def rec(file_name, date, covers=True):
    return {"file_name": file_name, "date": date, "covers_aoi": covers}


def test_geometry_key_parses_track_direction_frame():
    assert geometry_key("NISAR_L2_PR_GCOV_035_021_D_071_2005_DHDH_A_20261106T155939_x.h5") == "021D071"


def test_geometry_key_ignores_non_gcov_products():
    assert geometry_key("NISAR_L0_PR_RRSD_035_129_A_148S_20261114T031757_x.h5") is None


def test_group_scenes_prefers_validated_over_provisional_same_date():
    for order in ([PR, V1], [V1, PR]):
        groups = group_scenes([rec(f, "2026-07-27") for f in order])
        assert groups["108D070"]["2026-07-27"]["file_name"] == V1


def test_group_scenes_drops_scenes_not_covering_aoi():
    groups = group_scenes([rec(V1, "2026-07-27", covers=False)])
    assert groups == {}


def test_comparable_calendar_splits_pre_and_post_event():
    recs = [rec(V1.replace("20260727", d.replace("-", "")), d)
            for d in ["2026-07-15", "2026-07-27", "2026-08-20", "2026-09-01"]]
    cal = comparable_calendar(group_scenes(recs), "2026-07-28")
    g = cal["groups"][0]
    assert g["geometry"] == "108D070"
    assert g["pre"] == ["2026-07-15", "2026-07-27"]
    assert g["post"] == ["2026-08-20", "2026-09-01"]


def test_comparable_calendar_orders_groups_by_scene_count():
    a = [rec(V1, "2026-07-27")]
    b = [rec(V1.replace("_108_D_070_", "_129_A_020_").replace("20260727", d.replace("-", "")), d)
         for d in ["2026-07-05", "2026-08-10"]]
    cal = comparable_calendar(group_scenes(a + b), "2026-07-28")
    assert [g["geometry"] for g in cal["groups"]] == ["129A020", "108D070"]
