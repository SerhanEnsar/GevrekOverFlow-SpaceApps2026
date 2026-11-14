// Globe, recent NISAR passes, showcase markers and the NISAR frame overlay.
import maplibregl from "https://cdn.jsdelivr.net/npm/maplibre-gl@5.24.1/+esm";

const GIBS = "https://gibs.earthdata.nasa.gov/wmts/epsg3857/best";
// time = null for static layers (GIBS returns empty tiles if a time segment is given)
export const gibs = (layer, time, tms, ext) =>
  `${GIBS}/${layer}/default/${time ? time + "/" : ""}${tms}/{z}/{y}/{x}.${ext}`;

const center = ([w, s, e, n]) => [(w + e) / 2, (s + n) / 2];

export function initGlobe(container, showcases, { onShowcase, onError } = {}) {
  const map = new maplibregl.Map({
    container,
    center: [30, 25],
    zoom: 1.6,
    maxZoom: 14,
    attributionControl: { compact: true },
    style: {
      version: 8,
      projection: { type: "globe" },
      sky: {
        "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 1, 5, 1, 7, 0],
        "sky-color": "#0b1d35", "horizon-color": "#3d6ea8", "fog-color": "#0b1d35",
      },
      sources: {
        bluemarble: {
          type: "raster", tileSize: 256, maxzoom: 8,
          attribution: "NASA GIBS · Blue Marble",
          tiles: [gibs("BlueMarble_ShadedRelief_Bathymetry", null, "GoogleMapsCompatible_Level8", "jpg")],
        },
        relief: {
          type: "raster", tileSize: 256, maxzoom: 12,
          attribution: "ASTER GDEM via NASA GIBS",
          tiles: [gibs("ASTER_GDEM_Greyscale_Shaded_Relief", null, "GoogleMapsCompatible_Level12", "jpg")],
        },
        // Note: GIBS Reference_Labels_15m is not used — its tiles render as opaque black
        // in MapLibre and hide every layer below them.
        passes: { type: "geojson", data: { type: "FeatureCollection", features: [] }, attribution: "NISAR footprints: NASA CMR" },
        showcases: {
          type: "geojson",
          data: {
            type: "FeatureCollection",
            features: showcases.map((s) => ({
              type: "Feature", geometry: { type: "Point", coordinates: center(s.bbox) },
              properties: { id: s.id, label: s.label },
            })),
          },
        },
      },
      layers: [
        { id: "bluemarble", type: "raster", source: "bluemarble" },
        { id: "relief", type: "raster", source: "relief", minzoom: 7,
          paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 8.5, 0.28] } },   // terrain texture only: keep Blue Marble's colours
        { id: "passes-fill", type: "fill", source: "passes", maxzoom: 9,
          paint: { "fill-color": "#ffd23f", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.12, 5, 0.0] } },
        { id: "passes-line", type: "line", source: "passes", maxzoom: 9,
          paint: { "line-color": "#ffd23f", "line-width": 0.6, "line-opacity": 0.7 } },
        { id: "showcase-halo", type: "circle", source: "showcases",
          paint: { "circle-radius": 14, "circle-color": "#ff5a36", "circle-opacity": 0.25 } },
        { id: "showcase-dot", type: "circle", source: "showcases",
          paint: { "circle-radius": 6, "circle-color": "#ff5a36", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
      ],
    },
  });

  // Tile or network failures must not end up as console errors or break the page: tell the user once.
  let warned = false;
  map.on("error", (e) => {
    // Daily NISAR imagery is often missing for a day or two at GIBS: that is expected, not an error.
    if (/^(nisar-|firms-|optical)/.test(e.sourceId ?? "")) return;
    if (!warned && onError) { warned = true; onError(e); }
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");
  // "Locate me": the browser asks for permission; the position stays on this device.
  map.addControl(new maplibregl.GeolocateControl({
    positionOptions: { enableHighAccuracy: false, timeout: 10000 }, fitBoundsOptions: { maxZoom: 9 }, trackUserLocation: false,
  }), "top-right");

  // Slow spin until the user interacts or a flight starts; once stopped it never restarts.
  let spinning = true;
  const stop = () => {
    if (!spinning) return;
    spinning = false;
    map.off("moveend", spin);
    map.stop();
  };
  const spin = () => {
    if (!spinning || map.getZoom() > 3) return;
    const c = map.getCenter();
    map.easeTo({ center: [c.lng + 8, c.lat], duration: 1000, easing: (t) => t });
  };
  ["mousedown", "touchstart", "wheel"].forEach((ev) => map.getCanvas().addEventListener(ev, stop, { once: true }));
  map.on("moveend", spin);
  map.on("load", spin);
  map.stopSpin = stop;

  map.on("mouseenter", "showcase-dot", () => { map.getCanvas().style.cursor = "pointer"; });
  map.on("mouseleave", "showcase-dot", () => { map.getCanvas().style.cursor = ""; });
  map.on("click", "showcase-dot", (e) => {
    stop();
    const s = showcases.find((x) => x.id === e.features[0].properties.id);
    if (s && onShowcase) onShowcase(s);
  });
  return map;
}

// The open showcase hides its own marker (it would cover the radar image); every other marker
// stays visible at every zoom so a showcase can always be picked, even after zooming in by hand.
export function setOpenShowcase(map, id) {
  const f = id ? ["!=", ["get", "id"], id] : null;
  for (const l of ["showcase-halo", "showcase-dot"]) if (map.getLayer(l)) map.setFilter(l, f);
}

export function flyToShowcase(map, showcase) {
  map.stopSpin?.();
  const [w, s, e, n] = showcase.bbox;
  map.fitBounds([[w, s], [e, n]], { padding: 40, duration: 4500, essential: true });
}

// Place a NISAR frame image exactly on its bbox (below the showcase markers).
// Rapid calls (timeline playback, layer switches) can finish out of order inside MapLibre, so
// each image is decoded first and only the most recent request reaches the map.
let frameToken = 0;
export function setFrame(map, url, bbox) {
  const token = ++frameToken;
  const [w, s, e, n] = bbox;
  const coordinates = [[w, n], [e, n], [e, s], [w, s]];
  const img = new Image();
  img.src = url;
  return img.decode().catch(() => {}).then(() => {
    if (token !== frameToken) return false;              // a newer frame was requested meanwhile
    const src = map.getSource("frame");
    if (src) src.updateImage({ url, coordinates });
    else {
      map.addSource("frame", { type: "image", url, coordinates });
      map.addLayer({ id: "frame", type: "raster", source: "frame", paint: { "raster-fade-duration": 0 } }, "showcase-halo");
    }
    return true;
  });
}

export function setFrameVisible(map, visible) {
  if (map.getLayer("frame")) map.setLayoutProperty("frame", "visibility", visible ? "visible" : "none");
}

// Marker for the place whose time series is shown.
export function setPick(map, lngLat) {
  const data = { type: "Feature", geometry: { type: "Point", coordinates: [lngLat.lng, lngLat.lat] } };
  const src = map.getSource("pick");
  if (src) { src.setData(data); return; }
  map.addSource("pick", { type: "geojson", data });
  map.addLayer({ id: "pick", type: "circle", source: "pick",
    paint: { "circle-radius": 7, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#fff", "circle-stroke-width": 2.5 } });
}

// Global NISAR imagery: one GIBS daily layer per date (newest drawn on top), zoom <= 8 only
// (deeper GIBS tiles of this layer are corrupted; MapLibre over-zooms level 8 instead).
export function addNisarDays(map, dates, tileTemplate) {
  const sorted = [...dates].sort();
  for (const d of sorted) {
    const id = `nisar-${d}`;
    if (map.getSource(id)) continue;
    map.addSource(id, { type: "raster", tiles: [tileTemplate(d)], tileSize: 256, maxzoom: 8,
      attribution: "NISAR imagery: NASA GIBS" });
    map.addLayer({ id, type: "raster", source: id, paint: { "raster-opacity": 0.92, "raster-fade-duration": 200 } }, "passes-fill");
  }
}

// EONET wildfire markers; colour by age (days), size by burned area.
export function setFires(map, rows, today) {
  const t0 = Date.parse(today + "T00:00:00Z");
  const data = {
    type: "FeatureCollection",
    features: rows.map((r, i) => ({
      type: "Feature", geometry: { type: "Point", coordinates: [r[3], r[4]] },
      properties: { i, title: r[1], date: r[2], ha: r[5] ?? 0, age: Math.max(0, (t0 - Date.parse(r[2] + "T00:00:00Z")) / 864e5) },
    })),
  };
  const src = map.getSource("fires");
  if (src) { src.setData(data); return; }
  map.addSource("fires", { type: "geojson", data, attribution: "Fires: NASA EONET" });
  map.addLayer({
    id: "fires", type: "circle", source: "fires",
    paint: {
      "circle-radius": ["interpolate", ["linear"], ["zoom"], 1, ["interpolate", ["linear"], ["ln", ["+", ["get", "ha"], 1]], 0, 1.5, 11, 4],
        8, ["interpolate", ["linear"], ["ln", ["+", ["get", "ha"], 1]], 0, 4, 11, 10]],
      "circle-color": ["interpolate", ["linear"], ["get", "age"], 0, "#ff3b1f", 30, "#ff8a3d", 365, "#a35a3a"],
      "circle-opacity": 0.85, "circle-stroke-color": "#000", "circle-stroke-width": 0.5,
    },
  }, "showcase-halo");
}

// Marker for the selected fire (pulsing ring).
export function setFireFocus(map, row) {
  const data = { type: "FeatureCollection", features: row ? [{ type: "Feature", geometry: { type: "Point", coordinates: [row[3], row[4]] } }] : [] };
  const src = map.getSource("fire-focus");
  if (src) { src.setData(data); return; }
  map.addSource("fire-focus", { type: "geojson", data });
  map.addLayer({ id: "fire-focus", type: "circle", source: "fire-focus",
    paint: { "circle-radius": 16, "circle-color": "rgba(0,0,0,0)", "circle-stroke-color": "#ff5a36", "circle-stroke-width": 2.5 } });
}

// NISAR's approximate live position (visualization only): ground track, recent swath, beam + satellite.
export function setSatellite(map, { beam, swath, track }) {
  const put = (id, data) => { const s = map.getSource(id); if (s) { s.setData(data); return false; } map.addSource(id, { type: "geojson", data,
    ...(id === "sat-beam" ? { attribution: "NISAR position: public TLE, SGP4 — visualization only" } : {}) }); return true; };
  if (put("sat-track", track))
    map.addLayer({ id: "sat-track", type: "line", source: "sat-track",
      paint: { "line-color": "#5ef2ff", "line-width": 1.2, "line-opacity": 0.6, "line-dasharray": [2, 2] } }, "showcase-halo");
  if (put("sat-swath", swath))
    map.addLayer({ id: "sat-swath", type: "fill", source: "sat-swath",
      paint: { "fill-color": "#5ef2ff", "fill-opacity": 0.22 } }, "showcase-halo");
  if (put("sat-beam", beam))
    map.addLayer({ id: "sat-beam", type: "fill-extrusion", source: "sat-beam",
      paint: { "fill-extrusion-color": ["match", ["get", "kind"], "sat", "#ffffff", "#5ef2ff"],
        "fill-extrusion-base": ["get", "base"], "fill-extrusion-height": ["get", "top"], "fill-extrusion-opacity": 0.5 } });
}

// Live fire hotspots: NASA FIRMS (VIIRS NOAA-20, 375 m) rendered by the GIBS WMS for each UTC day.
const WMS = "https://gibs.earthdata.nasa.gov/wms/epsg3857/best/wms.cgi?SERVICE=WMS&REQUEST=GetMap&VERSION=1.3.0&STYLES=&CRS=EPSG:3857"
  + "&BBOX={bbox-epsg-3857}&WIDTH=256&HEIGHT=256&FORMAT=image/png&TRANSPARENT=true";
export function addHotspots(map, dates, layer = "VIIRS_NOAA20_Thermal_Anomalies_375m_All") {
  for (const d of dates) {
    const id = `firms-${d}`;
    if (map.getSource(id)) continue;
    map.addSource(id, { type: "raster", tileSize: 256, tiles: [`${WMS}&LAYERS=${layer}&TIME=${d}`],
      attribution: "Hotspots: NASA FIRMS (VIIRS NOAA-20) via GIBS" });
    map.addLayer({ id, type: "raster", source: id, paint: { "raster-fade-duration": 150 } }, "showcase-halo");
  }
}
export function setHotspotsVisible(map, on) {
  for (const l of map.getStyle().layers) if (l.id.startsWith("firms-")) map.setLayoutProperty(l.id, "visibility", on ? "visible" : "none");
}

// Optional optical photo of one day (VIIRS NOAA-20 true colour, 250 m; may have clouds), zoom >= 5.
export function setOptical(map, date, on) {
  if (!map.getSource("optical")) {
    map.addSource("optical", { type: "raster", tileSize: 256, maxzoom: 9,
      tiles: [gibs("VIIRS_NOAA20_CorrectedReflectance_TrueColor", date, "GoogleMapsCompatible_Level9", "jpg")],
      attribution: `Satellite photo: VIIRS NOAA-20 ${date}, NASA GIBS` });
    map.addLayer({ id: "optical", type: "raster", source: "optical", minzoom: 5,
      paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 5, 0, 6, 1] } }, "relief");
  }
  else map.getSource("optical").setTiles([gibs("VIIRS_NOAA20_CorrectedReflectance_TrueColor", date, "GoogleMapsCompatible_Level9", "jpg")]);
  map.setLayoutProperty("optical", "visibility", on ? "visible" : "none");
}
