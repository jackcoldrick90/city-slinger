/**
 * Score, and the debug overlay.
 *
 * The overlay exists from the first commit and every subsystem has to report
 * into it, because the single most expensive failure on the last project was
 * code that was written, was syntactically perfect, and never ran -- five
 * separate times. The rule that catches it is that a row must show what a
 * system *produced*, never that it was switched on. `buildings drawn: 0` is a
 * bug report. `city enabled: true` is not.
 *
 * It is DOM, not text drawn into the canvas: selectable, always legible against
 * whatever is behind it, and it cannot itself be a rendering bug.
 */
import * as W from './world.js';

export function createHud(root) {
  const dist = root.querySelector('#dist');
  const best = root.querySelector('#best');
  const pizzas = root.querySelector('#pizzas');
  const fuel = root.querySelector('#fuel');
  const panel = root.querySelector('#debug');
  const hint = root.querySelector('#hint');

  return {
    setScore(metres, bestMetres) {
      dist.textContent = `${metres.toFixed(0)} m`;
      best.textContent = `best ${bestMetres.toFixed(0)} m`;
    },
    setPizzas(count, bestCount) {
      pizzas.textContent = `pizza ${count} · best ${bestCount}`;
    },
    /** A row of dots, since the resource is a handful of discrete charges. */
    setFuel(count, max) {
      fuel.textContent = `web ${'●'.repeat(count)}${'○'.repeat(max - count)}`;
      fuel.classList.toggle('low', count <= W.WEB_FUEL_LOW);
    },
    setHint(text) {
      hint.textContent = text || '';
      hint.hidden = !text;
    },
    setDebug(visible, rows) {
      panel.hidden = !visible;
      if (visible) panel.textContent = rows.join('\n');
    },
  };
}
