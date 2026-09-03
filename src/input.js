/**
 * Pointer in, intent out.
 *
 * Everything here is `PointerEvent`, never `MouseEvent`. That is not tidiness:
 * it means a finger and a mouse are the same code path from the first line, so
 * touch cannot arrive late and break things -- which is exactly how the last
 * project acquired its worst bug class. `touch-action: none` in the stylesheet
 * is the other half; without it the browser eats the drag as a page scroll.
 *
 * The pointer is stored in normalised device coordinates (-1..1, y up) because
 * that is what `Raycaster.setFromCamera` wants, and converting once here means
 * no other file has to know how big the canvas is.
 */
export function createInput(canvas) {
  const state = {
    down: false,
    ndcX: 0,
    ndcY: 0,
    pressedThisFrame: false,   // consumed once per frame by the game
    releasedThisFrame: false,
    debug: false,
    probeRequested: false,
    bloomToggleRequested: false,
    motionToggleRequested: false,
    timeScaleRequested: false,
    restartRequested: false,
  };

  const toNdc = (e) => {
    const r = canvas.getBoundingClientRect();
    state.ndcX = ((e.clientX - r.left) / r.width) * 2 - 1;
    state.ndcY = -((e.clientY - r.top) / r.height) * 2 + 1;
  };

  canvas.addEventListener('pointerdown', (e) => {
    toNdc(e);
    state.down = true;
    state.pressedThisFrame = true;
    // Capture keeps the drag alive when the pointer leaves the canvas. It
    // throws for a pointer id the browser no longer considers active -- which
    // a synthetic event always is -- and an exception here would kill the
    // handler and with it every subsequent click.
    try { canvas.setPointerCapture(e.pointerId); } catch { /* not capturable */ }
    e.preventDefault();
  });

  canvas.addEventListener('pointermove', toNdc);

  const up = (e) => {
    if (!state.down) return;
    state.down = false;
    state.releasedThisFrame = true;
    if (e) toNdc(e);
  };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  // A pointer that leaves the window never sends pointerup. Without this the
  // player stays welded to a web they let go of somewhere off-screen.
  window.addEventListener('blur', () => up(null));

  window.addEventListener('keydown', (e) => {
    if (e.code === 'Backquote') { state.debug = !state.debug; e.preventDefault(); }
    if (e.code === 'KeyP') state.probeRequested = true;
    if (e.code === 'KeyB') state.bloomToggleRequested = true;
    if (e.code === 'KeyM') state.motionToggleRequested = true;
    if (e.code === 'KeyT') state.timeScaleRequested = true;
    if (e.code === 'KeyR') state.restartRequested = true;
  });

  /** Clear the one-frame edges. Called at the end of every frame. */
  state.endFrame = () => {
    state.pressedThisFrame = false;
    state.releasedThisFrame = false;
    state.probeRequested = false;
    state.bloomToggleRequested = false;
    state.motionToggleRequested = false;
    state.timeScaleRequested = false;
    state.restartRequested = false;
  };

  return state;
}
