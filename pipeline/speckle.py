"""Light spatial speckle reduction (P5).

A boxcar mean computed in linear power (not dB), ignoring NaN pixels.
Pixels that were NaN stay NaN, so no data is invented.
"""
import numpy as np


def _box_sum(a: np.ndarray, size: int) -> np.ndarray:
    """Sum over a size x size window (edges handled by zero padding), via cumulative sums."""
    r = size // 2
    p = np.pad(a, r)
    c = p.cumsum(0).cumsum(1)
    c = np.pad(c, ((1, 0), (1, 0)))
    return c[size:, size:] - c[:-size, size:] - c[size:, :-size] + c[:-size, :-size]


def boxcar_db(db: np.ndarray, size: int = 3) -> np.ndarray:
    valid = np.isfinite(db)
    lin = np.where(valid, 10 ** (db / 10), 0.0)
    total = _box_sum(lin, size)
    count = _box_sum(valid.astype(np.float64), size)
    with np.errstate(divide="ignore", invalid="ignore"):
        out = 10 * np.log10(total / count)
    out[~valid] = np.nan
    return out.astype(np.float32)
