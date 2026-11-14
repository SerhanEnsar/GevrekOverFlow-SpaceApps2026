"""Change maps between comparable dates (P7)."""
import numpy as np

CHANGE_DB = 3.0                 # |change| below this is treated as noise / no change
DROP_RGB = (230, 57, 70)        # red: backscatter fell (e.g. burned vegetation)
RISE_RGB = (60, 120, 230)       # blue: backscatter rose (e.g. crop growth, wetter soil)


def log_ratio(db_a: np.ndarray, db_b: np.ndarray) -> np.ndarray:
    """Change from date a to date b in dB (log ratio of linear power)."""
    return db_b - db_a


def burn_mask(hv_pre: np.ndarray, hv_post: np.ndarray, threshold_db: float = -CHANGE_DB) -> np.ndarray:
    """True where HV dropped by at least |threshold_db|. NaN never counts as burned."""
    with np.errstate(invalid="ignore"):
        return (hv_post - hv_pre) <= threshold_db


def change_rgba(diff_db: np.ndarray) -> np.ndarray:
    """[y, x, 4] uint8 overlay: red for drops, blue for rises; transparent below CHANGE_DB.
    Opacity grows from 55 at |3| dB to 255 at |8| dB and above."""
    d = np.nan_to_num(diff_db, nan=0.0)
    mag = np.abs(d)
    alpha = np.where(mag >= CHANGE_DB, 55 + 200 * np.clip((mag - CHANGE_DB) / 5.0, 0, 1), 0)
    out = np.zeros(d.shape + (4,), np.uint8)
    for i in range(3):
        out[..., i] = np.where(d < 0, DROP_RGB[i], RISE_RGB[i])
    out[..., 3] = np.round(alpha).astype(np.uint8)
    return out


def _mean(a: np.ndarray):
    v = np.nanmean(a) if np.isfinite(a).any() else np.nan
    return None if not np.isfinite(v) else round(float(v), 2)


def region_summary(hv: np.ndarray, dates: list[str], event: str, px_ha: float,
                   comparable: list[str] | None = None) -> dict | None:
    """Burned-area summary for the info box.

    Burned = HV fell by >= CHANGE_DB from the last comparable date before the event to the first
    one after it. Control = pixels that changed by less than 1 dB. Returns per-date mean HV of both
    groups (None where there is no data), or None without a comparable pre/post pair."""
    ok = [d for d in dates if comparable is None or d in comparable]
    pre = [d for d in ok if d < event]
    post = [d for d in ok if d >= event]
    if not pre or not post:
        return None
    a, b = hv[dates.index(pre[-1])], hv[dates.index(post[0])]
    burn = burn_mask(a, b)
    with np.errstate(invalid="ignore"):
        ctrl = np.abs(b - a) < 1.0
    return {
        "pre_date": pre[-1],
        "post_date": post[0],
        "burn_ha": round(float(burn.sum()) * px_ha, 1),
        "burn_hv": [_mean(hv[t][burn]) for t in range(len(dates))],
        "control_hv": [_mean(hv[t][ctrl]) for t in range(len(dates))],
    }
