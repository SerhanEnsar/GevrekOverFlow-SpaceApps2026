// Time machine: radar dates placed on a real time axis in the bottom strip.
// Dates imaged from another orbit are drawn hollow (only HV is comparable for them).

export function labelFor(date, eventDate) {
  return `${date} · ${date < eventDate ? "before fire" : "after fire"}`;
}

export function defaultDateIndex(dates, eventDate) {
  const i = dates.findIndex((d) => d >= eventDate) - 1;
  return i >= 0 ? i : 0;
}

const ms = (d) => Date.parse(d + "T00:00:00Z");

/** Position (0..1) of each date on an axis from the first to the last date. */
export function timePositions(dates) {
  const a = ms(dates[0]), b = ms(dates[dates.length - 1]);
  return dates.map((d) => (b > a ? (ms(d) - a) / (b - a) : 0.5));
}

// First day of every month between the first and the last date, as axis labels.
function monthTicks(dates) {
  const a = ms(dates[0]), b = ms(dates[dates.length - 1]);
  const out = [];
  const d = new Date(a); d.setUTCDate(1); d.setUTCMonth(d.getUTCMonth() + 1);
  for (; d.getTime() <= b; d.setUTCMonth(d.getUTCMonth() + 1))
    out.push({ pos: (d.getTime() - a) / (b - a), text: d.toLocaleString("en", { month: "short", timeZone: "UTC" }) });
  return out;
}

function preload(urls) {
  urls.forEach((u) => { const img = new Image(); img.src = u; });
}

/**
 * el: container. manifest: bundle manifest. base: bundle directory URL.
 * onDate(date, frameUrl, index) runs on every change, including the initial one.
 */
export function initTimeline(el, manifest, base, onDate) {
  const { dates, event_date: event, geometry } = manifest;
  const geomOf = (d) => manifest.date_geometry?.[d] ?? geometry;
  const pos = timePositions(dates);
  const evPos = dates.length > 1 ? Math.min(1, Math.max(0, (ms(event) - ms(dates[0])) / (ms(dates.at(-1)) - ms(dates[0])))) : 0.5;

  el.innerHTML = `
    <div class="tl">
      <button class="tl-play" aria-label="Play through the dates">▶</button>
      <div class="tl-track" role="slider" tabindex="0" aria-label="Radar date" aria-valuemin="0" aria-valuemax="${dates.length - 1}">
        <div class="tl-axis"></div>
        ${monthTicks(dates).map((m) => `<span class="tl-month" style="left:${m.pos * 100}%">${m.text}</span>`).join("")}
        <span class="tl-fire" style="left:${evPos * 100}%" title="Fire: ${event}">🔥</span>
        ${dates.map((d, i) => `<button class="tl-dot${geomOf(d) !== geometry ? " other" : ""}" data-i="${i}"
            style="left:${pos[i] * 100}%" title="${d}${geomOf(d) !== geometry ? " · other orbit (" + geomOf(d) + "): only HV comparable" : ""}"></button>`).join("")}
      </div>
      <div class="tl-label"><strong></strong><span></span></div>
    </div>`;

  const track = el.querySelector(".tl-track");
  const dots = [...el.querySelectorAll(".tl-dot")];
  const [labelMain, labelSub] = el.querySelectorAll(".tl-label > *");
  const play = el.querySelector(".tl-play");
  const frameUrl = (d) => `${base}/${manifest.frames[d]}`;
  preload(dates.map(frameUrl));

  let cur = 0;
  const set = (i) => {
    cur = Math.max(0, Math.min(dates.length - 1, i));
    dots.forEach((b, k) => b.classList.toggle("on", k === cur));
    track.setAttribute("aria-valuenow", cur);
    track.setAttribute("aria-valuetext", dates[cur]);
    const d = dates[cur];
    labelMain.textContent = labelFor(d, event);
    labelSub.textContent = geomOf(d) === geometry ? `orbit ${geometry}` : `other orbit ${geomOf(d)} · only HV comparable`;
    onDate(d, frameUrl(d), cur);
  };
  dots.forEach((b) => b.addEventListener("click", () => set(+b.dataset.i)));
  track.addEventListener("keydown", (e) => {
    if (e.key === "ArrowRight") { set(cur + 1); e.preventDefault(); }
    if (e.key === "ArrowLeft") { set(cur - 1); e.preventDefault(); }
  });

  let timer = null;
  const stop = () => { clearInterval(timer); timer = null; play.textContent = "▶"; };
  play.addEventListener("click", () => {
    if (timer) return stop();
    play.textContent = "❚❚";
    timer = setInterval(() => set((cur + 1) % dates.length), 1200);
  });

  set(defaultDateIndex(dates, event));
  return { set, stop, get index() { return cur; } };
}
