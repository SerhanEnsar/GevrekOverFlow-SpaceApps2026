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
        passes: { type: "geojson", data: "data/global/passes.geojson", attribution: "NISAR footprints: NASA CMR" },
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
          paint: { "raster-opacity": ["interpolate", ["linear"], ["zoom"], 7, 0, 8.5, 0.85] } },
        { id: "passes-fill", type: "fill", source: "passes", maxzoom: 9,
          paint: { "fill-color": "#ffd23f", "fill-opacity": ["interpolate", ["linear"], ["zoom"], 1, 0.18, 8, 0.04] } },
        { id: "passes-line", type: "line", source: "passes", maxzoom: 9,
          paint: { "line-color": "#ffd23f", "line-width": 0.6, "line-opacity": 0.7 } },
        { id: "showcase-halo", type: "circle", source: "showcases", maxzoom: 7,
          paint: { "circle-radius": 14, "circle-color": "#ff5a36", "circle-opacity": 0.25 } },
        { id: "showcase-dot", type: "circle", source: "showcases", maxzoom: 7,
          paint: { "circle-radius": 6, "circle-color": "#ff5a36", "circle-stroke-color": "#fff", "circle-stroke-width": 2 } },
      ],
    },
  });

  // Tile or network failures must not end up as console errors or break the page: tell the user once.
  let warned = false;
  map.on("error", (e) => {
    if (!warned && onError) { warned = true; onError(e); }
  });

  map.addControl(new maplibregl.NavigationControl({ visualizePitch: true }), "top-right");

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
