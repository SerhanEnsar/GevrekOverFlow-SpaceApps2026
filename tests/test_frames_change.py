import numpy as np

from change import burn_mask, change_rgba, log_ratio
from frames import multidate_rgb, rgb_composite


def test_same_db_gives_same_colour_on_every_date():
    # Fixed stretch: colours must not depend on the other pixels of the frame.
    hh1 = np.array([[-12.0, -20.0]]); hv1 = np.array([[-18.0, -26.0]])
    hh2 = np.array([[-12.0, 0.0]]);   hv2 = np.array([[-18.0, -5.0]])
    assert (rgb_composite(hh1, hv1)[0, 0] == rgb_composite(hh2, hv2)[0, 0]).all()


def test_stretch_end_points():
    out = rgb_composite(np.array([[-20.0, 0.0]]), np.array([[-26.0, -5.0]]))
    assert out[0, 0, 0] == 0 and out[0, 1, 0] == 255      # R = HH [-20, 0]
    assert out[0, 0, 1] == 0 and out[0, 1, 1] == 255      # G = HV [-26, -5]


def test_blue_is_hh_minus_hv_and_values_are_clipped():
    out = rgb_composite(np.array([[-10.0, 5.0]]), np.array([[-21.0, -40.0]]))
    assert out[0, 0, 2] == 255                            # HH-HV = 11 dB -> top of [1, 11]
    assert out[0, 1, 0] == 255 and out[0, 1, 1] == 0      # out-of-range clipped


def test_nan_pixels_are_transparent():
    out = rgb_composite(np.array([[np.nan, -10.0]]), np.array([[-20.0, -20.0]]))
    assert out.shape == (1, 2, 4)
    assert out[0, 0, 3] == 0 and out[0, 1, 3] == 255


def test_multidate_rgb_uses_hv_stretch_per_channel():
    out = multidate_rgb(np.array([[-5.0]]), np.array([[-26.0]]), np.array([[-15.5]]))
    assert tuple(out[0, 0, :3]) == (255, 0, 128)


def test_log_ratio_is_db_difference():
    assert log_ratio(np.array([-12.0]), np.array([-16.0]))[0] == -4.0


def test_burn_mask_threshold():
    pre = np.array([-12.0, -12.0, np.nan]); post = np.array([-16.0, -14.0, -16.0])
    assert burn_mask(pre, post, threshold_db=-3.0).tolist() == [True, False, False]


def test_change_rgba_colours():
    out = change_rgba(np.array([[-4.0, 0.5, 4.0, np.nan]]))
    assert out[0, 0, 0] > 200 and out[0, 0, 2] < 80 and out[0, 0, 3] > 0     # drop -> red
    assert out[0, 1, 3] == 0                                                 # small change -> transparent
    assert out[0, 2, 2] > 200 and out[0, 2, 0] < 80 and out[0, 2, 3] > 0     # rise -> blue
    assert out[0, 3, 3] == 0                                                 # no data -> transparent


def test_change_rgba_opacity_grows_with_magnitude():
    out = change_rgba(np.array([[-3.5, -8.0]]))
    assert out[0, 1, 3] > out[0, 0, 3]
