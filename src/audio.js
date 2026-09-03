/**
 * Sound, entirely synthesised. There is no audio file in this project.
 *
 * That is a deliberate structural choice, not a shortcut. On the last project
 * two whole categories of phantom bug came from *loading* audio -- an
 * `<audio>` element sitting at `readyState 0` forever because the dev server
 * ignored `Range`, with no error event and no clue -- and none at all came from
 * the sound itself. A noise burst through a filter has no network, no decode,
 * no readiness state and nothing to get wrong.
 *
 * Everything goes through one master `GainNode`, which is set once and then
 * read back. `HTMLMediaElement.volume` is silently read-only on iOS Safari: it
 * does not throw, it just ignores you, and it took an entire mix with it last
 * time. A GainNode is honoured everywhere -- but the readback is cheap, so it
 * is checked rather than assumed.
 */
import * as W from './world.js';

export function createAudio() {
  let ctx = null;
  let master = null;
  let wind = null;
  let windGain = null;
  const state = { started: false, gainHonoured: null, thwips: 0 };

  function noiseBuffer(seconds) {
    const n = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(1, n, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
    return buf;
  }

  return {
    state,

    /** Must be called from inside a user gesture, or the context stays suspended. */
    start() {
      if (ctx) { ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = W.MASTER_GAIN;
      master.connect(ctx.destination);

      // Set, then read back. If the platform ignored it, we want to know here
      // rather than from a mix that is silently four times too loud.
      state.gainHonoured = Math.abs(master.gain.value - W.MASTER_GAIN) < 1e-6;

      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(2);
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 420;
      windGain = ctx.createGain();
      windGain.gain.value = 0;
      src.connect(lp).connect(windGain).connect(master);
      src.start();
      wind = src;
      state.started = true;
    },

    /** The thwip: a bright noise burst swept downward, ~120ms. */
    thwip() {
      if (!ctx) return;
      const src = ctx.createBufferSource();
      src.buffer = noiseBuffer(0.2);
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.6;
      const t = ctx.currentTime;
      bp.frequency.setValueAtTime(2600, t);
      bp.frequency.exponentialRampToValueAtTime(700, t + 0.12);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.9, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
      src.connect(bp).connect(g).connect(master);
      src.start(t);
      src.stop(t + 0.2);
      state.thwips++;
    },

    /** Wind rises with speed. The only continuous sound in the game. */
    setSpeed(speed) {
      if (!windGain) return;
      const target = Math.min(1, speed / W.WIND_AT_SPEED) ** 2 * 0.5;
      windGain.gain.setTargetAtTime(target, ctx.currentTime, 0.15);
    },

    setMuted(muted) {
      if (!master) return;
      master.gain.value = muted ? 0 : W.MASTER_GAIN;
    },
  };
}
