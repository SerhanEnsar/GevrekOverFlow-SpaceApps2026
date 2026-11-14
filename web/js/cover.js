// Cover screen with a loading bar: one line per live NASA source, then it fades into the globe.

/** el: #cover. steps: [{id, label, weight}]. Returns {update(id, fraction, note, source?), done()}. */
export function initCover(el, steps) {
  const list = el.querySelector(".cover-steps"), bar = el.querySelector(".cover-bar > span"), pct = el.querySelector(".cover-pct");
  const state = Object.fromEntries(steps.map((s) => [s.id, 0]));
  const total = steps.reduce((a, s) => a + s.weight, 0);
  list.innerHTML = steps.map((s) => `<li data-id="${s.id}"><span class="cs-mark">○</span>
    <span class="cs-label">${s.label}</span><span class="cs-note muted"></span></li>`).join("");
  const shownAt = performance.now();
  return {
    update(id, f, note = "", source = null) {
      state[id] = Math.max(state[id], Math.min(1, f));
      const li = list.querySelector(`[data-id="${id}"]`);
      li.querySelector(".cs-note").textContent = note;
      li.classList.toggle("ok", state[id] >= 1);
      li.classList.toggle("saved", source === "saved");
      li.querySelector(".cs-mark").textContent = state[id] >= 1 ? (source === "saved" ? "◐" : "✓") : "○";
      const p = steps.reduce((a, s) => a + s.weight * state[s.id], 0) / total;
      bar.style.width = `${(p * 100).toFixed(1)}%`;
      pct.textContent = `${Math.round(p * 100)}%`;
    },
    /** Fade out (shown at least `minMs` so the cover can be read). */
    async done(minMs = 1200) {
      const wait = minMs - (performance.now() - shownAt);
      if (wait > 0) await new Promise((r) => setTimeout(r, wait));
      el.classList.add("out");
      await new Promise((r) => setTimeout(r, 650));
      el.hidden = true;
    },
  };
}
