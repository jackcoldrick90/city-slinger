/**
 * The camera rig.
 *
 * Three separate lags, because a single one cannot be right for both axes. The
 * horizontal lag is loose -- the player crosses the frame constantly and a
 * tight follow makes the city look like it is sliding rather than the player
 * moving. The vertical lag is much heavier: a fall accelerates to 60 units/s
 * within a second, and a camera that tracks that faithfully whips the whole
 * skyline down the screen and is genuinely unpleasant to look at.
 *
 * The lead offset points where you are going, not where you are, which is the
 * difference between reacting to a building and planning for it.
 */
import * as W from './world.js';

export function createFollow(camera) {
  let camX = 0;
  let camY = W.SPAWN_Y;
  let dist = W.CAM_DIST;

  return {
    /** Snap without easing -- used on the first frame and after a respawn. */
    reset(x, y) {
      camX = x;
      camY = Math.max(W.CAM_MIN_Y, y);
      this.apply(camera);
    },

    update(state, dt) {
      // Lags are authored per 60th of a second, so scale them by the real frame
      // time. Otherwise the camera is twice as loose at 30fps as at 60.
      const scale = Math.min(1, dt * 60);
      const lead = Math.sign(state.vx) * Math.min(W.CAM_LEAD, Math.abs(state.vx) / 4);
      const targetX = state.x + lead;
      const targetY = Math.max(W.CAM_MIN_Y, state.y + W.CAM_HEIGHT);

      camX += (targetX - camX) * W.CAM_LAG_X * scale;
      camY += (targetY - camY) * W.CAM_LAG_Y * scale;
      this.apply(camera);
    },

    /** Set by resize: a narrow window has to stand further back. */
    setDistance(d) { dist = d; },
    get distance() { return dist; },

    apply(cam) {
      cam.position.set(camX, camY, dist);
      cam.lookAt(camX, camY, W.PLAYER_Z);
    },

    get x() { return camX; },
    get y() { return camY; },
  };
}
