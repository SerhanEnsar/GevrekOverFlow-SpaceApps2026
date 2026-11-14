"""Crop NISAR GCOV .h5 files to the region AOI and write dB GeoTIFFs.

Usage:
  python pipeline/subset.py --inspect data/raw/mugla/108D070/<file>.h5
  python pipeline/subset.py --region mugla --group 108D070 [--delete-raw]

Output: data/cube/<region>/<group>/<YYYY-MM-DD>_<POL>.tif  (float32, dB, nodata=NaN)

The HDF5 layout is discovered at runtime (datasets named HHHH/HVHV/VVVV and the
x/yCoordinates next to them) instead of being hard-coded, so the script keeps
working across product versions (BETA / PROVISIONAL / V1).
"""
import argparse
import re
from pathlib import Path

import h5py
import numpy as np
import rasterio
from pyproj import Transformer
from rasterio.transform import from_origin

from config import CUBE, RAW, REGIONS

POLS = ("HHHH", "HVHV", "VVVV")
DATE_RE = re.compile(r"_(\d{8})T\d{6}_")


def inspect(path: Path):
    with h5py.File(path, "r") as f:
        def show(name, obj):
            if isinstance(obj, h5py.Dataset):
                attrs = {k: (v.decode() if isinstance(v, bytes) else v) for k, v in list(obj.attrs.items())[:4]}
                print(f"{name:90} {str(obj.shape):18} {obj.dtype} {attrs}")
        f.visititems(show)


def find_grid(f: h5py.File, freq: str = "frequencyA"):
    """Return (group, epsg) for the polarimetric grid of the given frequency."""
    hits = []
    f.visititems(lambda n, o: hits.append(n) if isinstance(o, h5py.Group) and n.endswith(f"grids/{freq}") else None)
    if not hits:
        raise RuntimeError(f"grids/{freq} not found; run --inspect")
    g = f[hits[0]]
    epsg = None
    if "projection" in g:
        p = g["projection"]
        epsg = int(p.attrs.get("epsg_code", p[()]))
    if epsg is None:
        raise RuntimeError("EPSG code not found; run --inspect")
    return g, epsg


def crop_window(x, y, bbox, epsg):
    """Index window of the AOI in the product's projected grid (x, y = pixel centers)."""
    w, s, e, n = bbox
    tr = Transformer.from_crs(4326, epsg, always_xy=True)
    xs, ys = tr.transform([w, e, w, e], [s, s, n, n])
    xi = np.where((x >= min(xs)) & (x <= max(xs)))[0]
    yi = np.where((y >= min(ys)) & (y <= max(ys)))[0]
    if xi.size == 0 or yi.size == 0:
        return None
    return slice(xi[0], xi[-1] + 1), slice(yi[0], yi[-1] + 1)


def to_db(a):
    a = a.astype("float32")
    a[(a <= 0) | ~np.isfinite(a)] = np.nan
    with np.errstate(invalid="ignore", divide="ignore"):
        return 10 * np.log10(a)


def subset_file(path: Path, bbox, out_dir: Path) -> list[Path]:
    date = DATE_RE.search(path.name)
    date = f"{date.group(1)[:4]}-{date.group(1)[4:6]}-{date.group(1)[6:]}"
    written = []
    with h5py.File(path, "r") as f:
        g, epsg = find_grid(f)
        x, y = g["xCoordinates"][()], g["yCoordinates"][()]
        win = crop_window(x, y, bbox, epsg)
        if win is None:
            print(f"  {path.name}: AOI not covered")
            return written
        xs, ys = win
        dx, dy = float(x[1] - x[0]), float(y[1] - y[0])
        transform = from_origin(x[xs][0] - dx / 2, y[ys][0] - dy / 2, dx, abs(dy)) if dy < 0 else None
        if transform is None:
            raise RuntimeError("Unexpected ascending y coordinates; run --inspect")
        # GCOV mask: 0 = partially focused / invalid sample, 255 = outside the acquisition.
        invalid = None
        if "mask" in g:
            m = g["mask"][ys, xs]
            invalid = (m == 0) | (m == 255)
        for pol in POLS:
            if pol not in g:
                continue
            arr = to_db(g[pol][ys, xs])
            if invalid is not None:
                arr[invalid] = np.nan
            out = out_dir / f"{date}_{pol[:2]}.tif"
            with rasterio.open(
                out, "w", driver="GTiff", height=arr.shape[0], width=arr.shape[1], count=1,
                dtype="float32", crs=f"EPSG:{epsg}", transform=transform, nodata=np.nan,
                compress="deflate",
            ) as dst:
                dst.write(arr, 1)
            written.append(out)
    return written


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--inspect", type=Path)
    ap.add_argument("--region", default="mugla", choices=REGIONS)
    ap.add_argument("--group")
    ap.add_argument("--delete-raw", action="store_true", help="delete each .h5 after a successful subset")
    args = ap.parse_args()

    if args.inspect:
        inspect(args.inspect)
        return

    region = REGIONS[args.region]
    group = args.group or region["default_group"]
    raw_dir = RAW / args.region / group
    out_dir = CUBE / args.region / group
    out_dir.mkdir(parents=True, exist_ok=True)
    files = sorted(raw_dir.glob("*.h5"))
    if not files:
        print(f"No .h5 files in {raw_dir}. Run fetch.py --download first.")
        return
    for path in files:
        written = subset_file(path, region["bbox"], out_dir)
        print(f"{path.name[:60]}… → {[w.name for w in written]}")
        if written and args.delete_raw:
            path.unlink()


if __name__ == "__main__":
    main()
