"""Visual frames from the time cube (P6).

The stretch is FIXED (not per-image), so the same backscatter gets the same
colour on every date and the animation shows real change, not contrast drift.
"""
import numpy as np

HH_RANGE = (-20.0, 0.0)     # red   (ranges = ~2nd-98th percentile of real GCOV in both showcases)
HV_RANGE = (-26.0, -5.0)    # green (and all channels of the multi-date composite)
RATIO_RANGE = (1.0, 11.0)   # blue: HH - HV in dB (low = volume scattering / vegetation)


def _stretch(a: np.ndarray, lo: float, hi: float) -> np.ndarray:
    return np.round(np.clip((a - lo) / (hi - lo), 0, 1) * 255).astype(np.uint8)


def _rgba(r, g, b, valid) -> np.ndarray:
    alpha = np.where(valid, 255, 0).astype(np.uint8)
    return np.stack([r, g, b, alpha], axis=-1)


def rgb_composite(hh_db: np.ndarray, hv_db: np.ndarray) -> np.ndarray:
    """[y, x, 4] uint8: R = HH, G = HV, B = HH - HV; NaN -> transparent."""
    valid = np.isfinite(hh_db) & np.isfinite(hv_db)
    hh, hv = np.nan_to_num(hh_db, nan=HH_RANGE[0]), np.nan_to_num(hv_db, nan=HV_RANGE[0])
    return _rgba(_stretch(hh, *HH_RANGE), _stretch(hv, *HV_RANGE), _stretch(hh - hv, *RATIO_RANGE), valid)


def multidate_rgb(hv_pre: np.ndarray, hv_event: np.ndarray, hv_post: np.ndarray) -> np.ndarray:
    """[y, x, 4] uint8: R/G/B = HV on three dates. Burned forest looks red (high before, low after)."""
    valid = np.isfinite(hv_pre) & np.isfinite(hv_event) & np.isfinite(hv_post)
    ch = [_stretch(np.nan_to_num(a, nan=HV_RANGE[0]), *HV_RANGE) for a in (hv_pre, hv_event, hv_post)]
    return _rgba(*ch, valid)
