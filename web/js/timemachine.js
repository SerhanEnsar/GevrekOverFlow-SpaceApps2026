// Time machine for any place: a few NISAR images spread over the whole record (periods), played as an
// animation, with the vegetation signal (HV) of each frame and the fire date marked.
import { readPixel, cropAround } from "./gibs.js";
import { gibsToDb } from "./rules.js";

/**
 * Pick up to `n` passes spread over time, from one orbit (fully comparable), dual-pol only.
 * Always keeps the first and last pass and, if `event` is given, the last pass before it and the
 * first one after it. passes: [{date, geometry, hv}] (any order). Returns them oldest first.
 */
export function periodicPasses(passes, event = null, n = 6, prefer = null) {
  const ok = passes.filter((p) => p.hv !== false);
  if (!ok.length) return [];
  const pref = prefer && ok.filter((p) => p.geometry === prefer);
  if (pref && pref.length >= 3) return periodicPasses(pref, event, n);
  // The orbit with most passes; on a tie the one that saw the place most recently.
  const by = new Map();
  for (const p of ok) by.set(p.geometry, [...(by.get(p.geometry) ?? []), p]);
  const best = [...by.values()].sort((a, b) => b.length - a.length
    || (a.reduce((m, p) => (p.date > m ? p.date : m), "") < b.reduce((m, p) => (p.date > m ? p.date : m), "") ? 1 : -1))[0];
  const asc = [...best].sort((a, b) => (a.date < b.date ? -1 : 1));
  if (asc.length <= n) return asc;
  const keep = new Set([0, asc.length - 1]);
  if (event) {
    const j = asc.findIndex((p) => p.date > event);
    if (j > 0) keep.add(j - 1);
    if (j >= 0) keep.add(j);
  }
  for (let k = 1; keep.size < n && k < n - 1; k++) keep.add(Math.round((k * (asc.length - 1)) / (n - 1)));
  for (let i = 0; keep.size < n && i < asc.length; i++) keep.add(i);
  return [...keep].sort((a, b) => a - b).map((i) => asc[i]);
}

const fmt = (v) => (v == null ? "–" : v.toFixed(1).replace("-", "−"));

/** Small HV line (SVG) with the fire date as a vertical marker. */
export function sparkline(frames, event, w = 280, h = 56) {
  const pts = frames.map((f, i) => [i, f.hv]).filter(([, v]) => v != null);
  if (pts.length < 2) return "";
  const vs = pts.map(([, v]) => v), lo = Math.min(...vs) - 1, hi = Math.max(...vs) + 1;
  const X = (i) => 8 + (i * (w - 16)) / (frames.length - 1), Y = (v) => h - 6 - ((v - lo) * (h - 14)) / (hi - lo);
  const line = pts.map(([i, v], k) => `${k ? "L" : "M"}${X(i).toFixed(1)},${Y(v).toFixed(1)}`).join("");
  let mark = "";
  if (event) {
    const j = frames.findIndex((f) => f.date > event);
    if (j > 0) {
      const x = (X(j - 1) + X(j)) / 2, right = x > w - 80;
      mark = `<line x1="${x}" x2="${x}" y1="2" y2="${h - 2}" class="tm-fire"/>
        <text x="${right ? x - 3 : x + 3}" y="11" text-anchor="${right ? "end" : "start"}" class="tm-fire-t">🔥 ${event}</text>`;
    }
  }
  return `<svg viewBox="0 0 ${w} ${h}" class="tm-spark" role="img" aria-label="Vegetation signal (HV) over time">
    ${mark}<path d="${line}" class="tm-line"/>${pts.map(([i, v]) => `<circle cx="${X(i)}" cy="${Y(v)}" r="2.6" data-i="${i}"/>`).join("")}</svg>`;
}

/**
 * el: container; lng/lat; passes; rules; event. Builds the strip, loads frames, wires play/pause.
 * Returns {stop}. Uses alive() to drop work for a card that was replaced.
 */
export async function renderTimeMachine(el, lng, lat, passes, rules, event, alive = () => true, prefer = null) {
  const pick = periodicPasses(passes, event, 6, prefer);
  if (pick.length < 2) { el.innerHTML = ""; return { stop() {} }; }
  el.innerHTML = `
    <h4>Time machine <span class="muted small">· ${pick.length} periods · orbit ${pick[0].geometry}</span></h4>
    <div class="tm-view"><canvas width="96" height="96"></canvas><div class="tm-date"></div></div>
    <div class="tm-ctl"><button class="btn small tm-play" aria-label="Play">▶</button><div class="tm-strip"></div></div>
    <div class="tm-chart"><p class="muted small">Reading ${pick.length} NISAR images…</p></div>`;
  // GIBS misses some days: a period without an image takes the nearest other pass of the same orbit.
  const pool = passes.filter((p) => p.hv !== false && p.geometry === pick[0].geometry && !pick.includes(p));
  const load = async (p) => {
    const [c, px] = await Promise.all([cropAround(lng, lat, p.date), readPixel(lng, lat, p.date)]);
    const v = px && gibsToDb(rules, px.r, px.g);
    // Below about −35 dB is the black edge of a strip (no data), not the ground: treat as missing.
    if (!v || v.hv < -35) return { date: p.date, canvas: null, hv: null };
    return { date: p.date, canvas: c, hv: v.hv };
  };
  const days = (a, b) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
  let frames = await Promise.all(pick.map(async (p) => {
    let f = await load(p);
    // stay on the same side of the fire, so "before" and "after" keep their meaning
    const side = (d) => !event || (d > event) === (p.date > event);
    const alts = pool.filter((q) => side(q.date)).sort((a, b) => days(a.date, p.date) - days(b.date, p.date));
    for (let k = 0; !f.canvas && k < 3 && k < alts.length; k++) {
      const q = alts[k], at = pool.indexOf(q);
      if (at < 0) continue;                               // another period already took it
      pool.splice(at, 1);
      const g = await load(q);
      if (g.canvas) f = g;
    }
    return f;
  }));
  // Keep only periods that really have an image of the place (deduplicated after the fallbacks).
  const seenD = new Set();
  frames = frames.filter((f) => f.canvas && !seenD.has(f.date) && seenD.add(f.date)).sort((a, b) => (a.date < b.date ? -1 : 1));
  if (frames.length < 2) {
    el.innerHTML = `<h4>Time machine</h4><p class="muted small">NASA's map service has too few NISAR images of this exact spot yet.</p>`;
    return { stop() {} };
  }
  el.querySelector("h4").innerHTML = `Time machine <span class="muted small">· ${frames.length} periods · orbit ${pick[0].geometry}</span>`;
  if (!alive()) return { stop() {} };
  const view = el.querySelector(".tm-view canvas").getContext("2d"), label = el.querySelector(".tm-date");
  el.querySelector(".tm-strip").innerHTML = frames.map((f, i) => `<button class="tm-thumb" data-i="${i}" title="${f.date}">
    <span class="tm-d">${f.date.slice(2, 7).replace("-", "/")}</span></button>`).join("");
  const thumbs = [...el.querySelectorAll(".tm-thumb")];
  thumbs.forEach((t, i) => {
    if (frames[i].canvas) { const c = document.createElement("canvas"); c.width = c.height = 96; c.getContext("2d").drawImage(frames[i].canvas, 0, 0); t.prepend(c); }
    else t.classList.add("empty");
  });
  el.querySelector(".tm-chart").innerHTML = sparkline(frames, event)
    + `<div class="muted small">Vegetation signal (HV, dB) at the point: ${frames.map((f) => fmt(f.hv)).join(" → ")}</div>`;
  let i = 0, timer = 0;
  const show = (k) => {
    i = k;
    view.clearRect(0, 0, 96, 96);
    if (frames[k].canvas) view.drawImage(frames[k].canvas, 0, 0);
    const after = event && frames[k].date > event;
    label.innerHTML = `${frames[k].date}${event ? (after ? ' · <span class="tm-after">after the fire</span>' : " · before the fire") : ""}`;
    thumbs.forEach((t, j) => t.classList.toggle("on", j === k));
    el.querySelectorAll(".tm-spark circle").forEach((c) => c.classList.toggle("on", +c.dataset.i === k));
  };
  const play = el.querySelector(".tm-play");
  const stop = () => { clearInterval(timer); timer = 0; play.textContent = "▶"; play.setAttribute("aria-label", "Play"); };
  play.addEventListener("click", () => {
    if (timer) return stop();
    play.textContent = "❚❚"; play.setAttribute("aria-label", "Pause");
    timer = setInterval(() => { if (!el.isConnected) return stop(); show((i + 1) % frames.length); }, 1100);
  });
  thumbs.forEach((t, k) => t.addEventListener("click", () => { stop(); show(k); }));
  show(0);
  return { stop };
}
