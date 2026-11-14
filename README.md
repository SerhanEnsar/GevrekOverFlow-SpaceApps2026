# GevrekOverFlow — NASA Space Apps Challenge 2026

**Challenge:** [Dancing with the SARs](https://www.spaceappschallenge.org/2026/challenges/dancing-with-the-sars/)

> Status: design approved, implementation in progress. Working title: *NISAR Time Machine*.

## What we are building

Earth's surface keeps changing — wildfires, crop cycles, floods, glaciers — but these changes are hard to see,
understand and explain. NISAR (the NASA–ISRO L-band radar mission) measures them day and night, through clouds
and smoke, yet its data is hard to use for anyone who is not a radar expert.

Our web app makes NISAR's view of change understandable. It fills gaps we found in today's tools:

- **Time series for any point** — click a field or a forest and see how its radar signal changed.
- **Comparable dates only** — the timeline shows only scenes taken from the same orbit geometry, so before/after comparisons are valid.
- **Colours explained in place** — what a radar colour means, in plain language (expert mode shows dB and polarization).
- **Guided story + interaction** — a step-by-step story you can explore, not a static page.
- **Pass calendar** — when NISAR observed (and will observe) the area.

First showcase: the **Muğla–Fethiye wildfire (28 July 2026)** and the surrounding farmland in Türkiye — the sudden
drop of a burned forest next to the rhythmic "dance" of crop fields.

Design document: [`docs/specs/2026-11-14-nisar-zaman-makinesi-design.md`](docs/specs/2026-11-14-nisar-zaman-makinesi-design.md)
Research: [`docs/01-why-kanit.md`](docs/01-why-kanit.md) (problem evidence), [`docs/03-mevcut-araclar.md`](docs/03-mevcut-araclar.md) (existing tools and gaps)

## Repository layout

```
pipeline/   Python data pipeline (runs offline, before deployment)
  config.py   regions (bounding box, event date, NISAR geometry groups)
  fetch.py    search NISAR GCOV scenes, group by orbit geometry, download
  subset.py   crop GCOV HDF5 to the region, write HH/HV dB GeoTIFFs
docs/       research evidence and design
web/        static web app (in progress)
```

## Running the pipeline

```bash
python -m venv .venv && source .venv/bin/activate
pip install asf_search rasterio h5py pyproj numpy shapely pillow pytest
cd pipeline
python fetch.py --region mugla --list                                 # no login needed
python fetch.py --region mugla --group 036D070 --download --limit 2   # needs NASA Earthdata Login
python subset.py --region mugla --group 036D070 --delete-raw
```

Downloading requires a free [NASA Earthdata Login](https://urs.earthdata.nasa.gov). Provide credentials via the
`EARTHDATA_USERNAME` / `EARTHDATA_PASSWORD` environment variables or a `~/.netrc` entry for
`urs.earthdata.nasa.gov`. Credentials are never stored in this repository.

On systems with a Turkish locale, set `LC_ALL=C.UTF-8` before running (GDAL compares option names case-insensitively).

## NASA data

- NISAR L2 GCOV (ASF DAAC) — radar backscatter time series
- NASA GIBS — NISAR false-colour layer, NISAR orbit tracks, reference layers
- FIRMS (VIIRS NOAA-20/21, MODIS) — active fire detections
- OPERA DIST-ALERT, HLS — validation
- NASA EONET — event catalogue

## Use of AI tools

The project idea, problem definition and all design decisions were made by the team.
AI tools were used as support for technical code and writing.
