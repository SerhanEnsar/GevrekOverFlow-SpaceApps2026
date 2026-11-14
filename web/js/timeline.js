// Time machine: a timeline that only contains comparable dates (same orbit geometry).

export function labelFor(date, eventDate) {
  return `${date} · ${date < eventDate ? "before fire" : "after fire"}`;
}

export function defaultDateIndex(dates, eventDate) {
  const i = dates.findIndex((d) => d >= eventDate) - 1;
  return i >= 0 ? i : 0;
}

// Warm the browser cache so the animation never waits on the network.
function preload(urls) {
  urls.forEach((u) => { const img = new Image(); img.src = u; });
}

/**
 * el: container element. manifest: bundle manifest. base: bundle directory URL.
 * onDate(date, frameUrl) is called on every date change (including the initial one).
 */
export function initTimeline(el, manifest, base, onDate) {
  const { dates, event_date: event } = manifest;
  const eventPos = dates.findIndex((d) => d >= event);
  el.innerHTML = `
    <div class="tl-row">
      <button class="tl-play" aria-label="Play">▶</button>
      <input class="tl-slider" type="range" min="0" max="${dates.length - 1}" step="1" />
      <span class="tl-label"></span>
    </div>
    <div class="tl-ticks">${dates.map((d, i) =>
      `<span class="tl-tick${i === eventPos ? " tl-event" : ""}" style="left:${(i / Math.max(1, dates.length - 1)) * 100}%"
        title="${d}"></span>`).join("")}</div>
    <div class="tl-note">Only dates imaged from the same orbit (${manifest.geometry}) are shown, so every pair is comparable.</div>`;

  const slider = el.querySelector(".tl-slider");
  const label = el.querySelector(".tl-label");
  const play = el.querySelector(".tl-play");
  const frameUrl = (d) => `${base}/${manifest.frames[d]}`;
  preload(dates.map(frameUrl));

  const set = (i) => {
    slider.value = i;
    label.textContent = labelFor(dates[i], event);
    onDate(dates[i], frameUrl(dates[i]));
  };
  slider.addEventListener("input", () => set(+slider.value));

  let timer = null;
  play.addEventListener("click", () => {
    if (timer) { clearInterval(timer); timer = null; play.textContent = "▶"; return; }
    play.textContent = "❚❚";
    timer = setInterval(() => set((+slider.value + 1) % dates.length), 1200);
  });

  set(defaultDateIndex(dates, event));
  return { set };
}
