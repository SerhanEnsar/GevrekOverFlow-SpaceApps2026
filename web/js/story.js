// Guided story (G6): a sequence of steps that drive the map, the timeline and the
// comparison, while everything stays interactive.
//
// Step shape (web/story.json):
//   { "title": str, "text": str,
//     "showcase": id | null,      // null = globe overview
//     "date": "YYYY-MM-DD" | null,
//     "compare": bool,            // open the before/after swipe
//     "point": [lon, lat] | null  // show this place's time series
//   }

export function validateStory(steps, showcases) {
  const ids = new Set(showcases.map((s) => s.id));
  const errors = [];
  steps.forEach((s, i) => {
    if (!s.title || !s.text) errors.push(`step ${i + 1}: title and text are required`);
    if (s.showcase != null && !ids.has(s.showcase)) errors.push(`step ${i + 1}: unknown showcase '${s.showcase}'`);
    if (s.date && !/^\d{4}-\d{2}-\d{2}$/.test(s.date)) errors.push(`step ${i + 1}: bad date '${s.date}'`);
  });
  return errors;
}

/**
 * el: container for the story card. actions: { goGlobe(), openShowcase(id) -> Promise,
 * setDate(date), setCompare(on), showPoint([lon, lat]) | null }.
 */
export function initStory(el, steps, actions) {
  let i = -1;
  el.innerHTML = `
    <div class="story-card">
      <div class="story-step"></div>
      <h3 class="story-title"></h3>
      <p class="story-text"></p>
      <div class="story-nav">
        <button class="btn story-prev">← Back</button>
        <button class="btn story-next">Next →</button>
        <button class="btn story-close">Explore freely</button>
      </div>
    </div>`;
  const $ = (c) => el.querySelector(c);

  let token = 0;
  async function go(k) {
    const my = ++token;                                  // quick clicks: only the latest step may act
    i = Math.max(0, Math.min(steps.length - 1, k));
    const s = steps[i];
    $(".story-step").textContent = `Step ${i + 1} of ${steps.length}`;
    $(".story-title").textContent = s.title;
    $(".story-text").textContent = s.text;
    $(".story-prev").disabled = i === 0;
    $(".story-next").disabled = i === steps.length - 1;
    actions.setCompare(false);
    if (s.showcase == null) { actions.goGlobe(); return; }
    await actions.openShowcase(s.showcase);
    if (my !== token) return;
    actions.setCompare(false);                           // a slower earlier step may have opened it
    if (s.date) actions.setDate(s.date);
    if (s.compare) actions.setCompare(true);
    if (s.point) actions.showPoint(s.point);
  }

  $(".story-prev").addEventListener("click", () => go(i - 1));
  $(".story-next").addEventListener("click", () => go(i + 1));
  $(".story-close").addEventListener("click", () => { el.hidden = true; });
  el.hidden = false;
  go(0);
  return { go, get index() { return i; } };
}
