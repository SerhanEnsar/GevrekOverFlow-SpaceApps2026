// App wiring: globe, showcase panel, bottom time strip, method drawer, story.
import { SHOWCASES } from "./config.js";
import { initGlobe, flyToShowcase, setFrame, setFrameVisible, setPick } from "./map.js";
import { loadBundle, seriesAt, valuesAt, seriesToCsv } from "./data.js";
import { loadRules, interpret } from "./rules.js";
import { showSeries } from "./chart.js";
import { initTimeline } from "./timeline.js";
import { initCompare, defaultPair } from "./compare.js";
import { initStory } from "./story.js";
import { renderMethod, summaryHtml, legendHtml } from "./method.js";

const $ = (id) => document.getElementById(id);

// ---- small UI helpers -------------------------------------------------------
let toastTimer = 0;
export function toast(msg) {
  const t = $("toast");
  t.textContent = msg; t.hidden = false;
  clearTimeout(toastTimer); toastTimer = setTimeout(() => { t.hidden = true; }, 6000);
}

const rules = await loadRules().catch(() => { toast("Interpretation rules could not be loaded."); return null; });

// ---- state ------------------------------------------------------------------
let timeline = null, compare = null, currentIdx = 0, currentId = null, layer = "radar";
let lastSeries = null;           // {series, lng, lat} for CSV
const manifests = {};            // id -> manifest, for the method drawer

function bundle() { return window.__bundle; }

function showFrame() {
  const b = bundle(); if (!b) return;
  const m = b.manifest, d = m.dates[currentIdx];
  const rel = layer === "radar" ? m.frames[d] : m.change[d];
  $("legend").innerHTML = legendHtml(layer, m, currentIdx);
  if (!rel) { setFrameVisible(map, false); return; }
  setFrame(map, `data/${m.region}/${rel}`, m.bbox);
  setFrameVisible(map, true);
}

function setLayer(next) {
  layer = next;
  document.querySelectorAll(".seg-btn").forEach((b) => {
    const on = b.dataset.layer === next;
    b.classList.toggle("on", on); b.setAttribute("aria-selected", on);
  });
  if (compare && next !== "radar") toggleCompare();
  showFrame();
}
document.querySelectorAll(".seg-btn").forEach((b) => b.addEventListener("click", () => setLayer(b.dataset.layer)));

function toggleCompare() {
  const b = bundle(); if (!b) return;
  if (compare) { compare.destroy(); compare = null; $("compare-btn").textContent = "Compare before / after"; return; }
  if (layer !== "radar") setLayer("radar");
  const m = b.manifest, [i, j] = defaultPair(m.dates, m.event_date);
  timeline.set(i);                                    // main map shows "before"
  compare = initCompare(map, {
    afterUrl: `data/${m.region}/${m.frames[m.dates[j]]}`, bbox: m.bbox,
    beforeLabel: `Before · ${m.dates[i]}`, afterLabel: `After · ${m.dates[j]}`,
  });
  $("compare-btn").textContent = "Close comparison";
}
$("compare-btn").addEventListener("click", toggleCompare);

// ---- showcases ----------------------------------------------------------------
async function openShowcase(s) {
  if (compare) toggleCompare();
  if (s.id === currentId && bundle()) return;          // already open
  currentId = s.id;
  flyToShowcase(map, s);
  $("intro").hidden = true; $("showcase").hidden = false; $("globe-btn").hidden = false;
  $("showcase-title").textContent = s.label;
  $("showcase-sub").textContent = s.subtitle;
  $("series-wrap").hidden = true; $("compare-btn").hidden = true; $("hint").hidden = true; $("summary").hidden = true;
  $("legend").innerHTML = "";
  $("timeline").innerHTML = '<span class="muted">Loading radar dates…</span>';
  window.__bundle = null;
  $("status").textContent = "Loading radar data…";
  try {
    const b = await loadBundle(s.id);
    if (currentId !== s.id) return;                     // user moved on meanwhile
    window.__bundle = b;
    manifests[s.id] = b.manifest;
    $("status").textContent = "";
    $("hint").hidden = false;
    $("summary").innerHTML = summaryHtml(b.manifest);
    $("summary").hidden = !b.manifest.summary;
    timeline = initTimeline($("timeline"), b.manifest, `data/${s.id}`, (_d, _url, i) => { currentIdx = i; showFrame(); });
    $("compare-btn").hidden = false;
  } catch (e) {
    $("status").textContent = "Radar data for this showcase could not be loaded. Check your connection and try again.";
    $("timeline").innerHTML = '<span class="muted">No radar dates available.</span>';
  }
}

function goGlobe() {
  if (compare) toggleCompare();
  timeline?.stop?.();
  currentId = null; window.__bundle = null;
  setFrameVisible(map, false);
  $("intro").hidden = false; $("showcase").hidden = true; $("globe-btn").hidden = true;
  $("timeline").innerHTML = '<span class="muted">Pick a showcase on the globe to travel through its radar dates.</span>';
  map.flyTo({ center: [10, 30], zoom: 1.6, duration: 3000 });
}
$("globe-btn").addEventListener("click", goGlobe);

const map = initGlobe("map", SHOWCASES, {
  onShowcase: openShowcase,
  onError: () => toast("Some NASA map tiles could not be loaded right now — the rest of the site keeps working."),
});

// ---- point time series + CSV ------------------------------------------------
function showPoint(lng, lat) {
  const b = bundle(); if (!b) return;
  setPick(map, { lng, lat });
  $("hint").hidden = true; $("series-wrap").hidden = false;
  const series = seriesAt(b, lng, lat, 60);
  lastSeries = series ? { series, lng, lat } : null;
  $("csv-btn").disabled = !series;
  showSeries($("series"), series, b.manifest);
}
map.on("click", (e) => {
  if (!bundle() || map.queryRenderedFeatures(e.point, { layers: ["showcase-dot"] }).length) return;
  showPoint(e.lngLat.lng, e.lngLat.lat);
});
$("csv-btn").addEventListener("click", () => {
  const b = bundle(); if (!b || !lastSeries) return;
  const { series, lng, lat } = lastSeries;
  const blob = new Blob([seriesToCsv(series, b.manifest, lng, lat)], { type: "text/csv" });
  const a = Object.assign(document.createElement("a"), {
    href: URL.createObjectURL(blob), download: `nisar_${b.manifest.region}_${lat.toFixed(4)}_${lng.toFixed(4)}.csv`,
  });
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});

// ---- "What am I looking at?" tooltip -----------------------------------------
let raf = 0;
map.on("mousemove", (e) => {
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(() => {
    const b = bundle(), box = $("explain");
    const now = b && valuesAt(b, e.lngLat.lng, e.lngLat.lat, currentIdx);
    const prev = b && currentIdx > 0 ? valuesAt(b, e.lngLat.lng, e.lngLat.lat, currentIdx - 1) : null;
    const ex = now && rules && interpret(rules, {
      hh: now.hh, hv: now.hv,
      dhv: prev && prev.hv != null && now.hv != null ? now.hv - prev.hv : null,
      prevDate: currentIdx > 0 ? b.manifest.dates[currentIdx - 1] : null,
    });
    if (!ex || compare) { box.hidden = true; return; }
    box.innerHTML = `<div class="ex-head"><span class="sw" style="background:${ex.color}"></span>${ex.label}
      <span class="ex-conf ${ex.confidence}">${ex.confidence === "high" ? "clear" : "uncertain"}</span></div>
      <div>${ex.plain}</div><div class="explain-expert">${ex.expert}<br>${ex.sourceLabel}</div>`;
    const host = map.getContainer().getBoundingClientRect();
    const x = Math.min(e.point.x + 16, host.width - 320), y = Math.min(e.point.y + 16, host.height - 160);
    box.style.left = `${x}px`; box.style.top = `${y}px`;
    box.hidden = false;
  });
});
map.on("mouseout", () => { $("explain").hidden = true; });

// ---- method drawer ------------------------------------------------------------
async function openMethod() {
  for (const s of SHOWCASES)
    if (!manifests[s.id])
      manifests[s.id] = await fetch(`data/${s.id}/manifest.json`).then((r) => r.json()).catch(() => null);
  renderMethod($("method-body"), rules, manifests);
  $("method").hidden = false; $("method-btn").setAttribute("aria-expanded", "true");
}
function closeMethod() { $("method").hidden = true; $("method-btn").setAttribute("aria-expanded", "false"); }
$("method-btn").addEventListener("click", () => ($("method").hidden ? openMethod() : closeMethod()));
$("method-close").addEventListener("click", closeMethod);
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeMethod(); });
$("summary").addEventListener("click", (e) => {
  if (e.target.closest("[data-open-method]")) { e.preventDefault(); openMethod(); }
});

// ---- guided story (starts by itself on the first visit) ------------------------
async function startStory() {
  const steps = await fetch("story.json").then((r) => r.json()).catch(() => null);
  if (!steps) return toast("The story could not be loaded.");
  initStory($("story"), steps, {
    goGlobe,
    openShowcase: (id) => openShowcase(SHOWCASES.find((x) => x.id === id)),
    setDate: (d) => { const k = bundle()?.manifest.dates.indexOf(d); if (k >= 0) timeline.set(k); },
    setCompare: (on) => { if (on !== !!compare) toggleCompare(); },
    showPoint: ([lng, lat]) => showPoint(lng, lat),
  });
}
$("story-btn").addEventListener("click", startStory);
try {
  if (!localStorage.getItem("nisar-story-seen")) {
    localStorage.setItem("nisar-story-seen", "1");
    map.once("load", startStory);
  }
} catch { /* storage blocked: no auto-start */ }

window.__map = map; // for manual inspection during development
