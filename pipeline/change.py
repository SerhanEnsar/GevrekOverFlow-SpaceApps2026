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
