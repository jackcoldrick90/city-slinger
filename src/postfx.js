/**
 * Bloom, kept on a short leash.
 *
 * Windows in this city are emissive and already bright; bloom's job is to make
 * the brightest of them bleed a little into the haze, not to smear the whole
 * frame. Hence a high threshold and a low strength -- most of the image is
 * below the cutoff and is not touched at all.
 *
 * It is rendered at half resolution (`BLOOM_SCALE`). The pass is five
 * downsample/upsample steps, so its cost is entirely pixels, and halving the
 * resolution quarters it for a blur nobody can tell apart from the full-res one.
 *
 * Two details that are easy to get wrong and expensive to debug:
 *
 * - **MSAA has to be asked for.** `EffectComposer`'s default render target has
 *   no samples, so switching to a composer silently turns off the antialiasing
 *   the renderer was configured with, and every roofline goes jagged. The
 *   target here is built by hand with `samples` set.
 * - **`OutputPass` has to be last.** Rendering into a HalfFloat target skips
 *   the tone mapping and colour space conversion the renderer would normally do
 *   on the way to the screen. Without it the whole image comes out dark and
 *   oddly saturated, which looks like a lighting bug and is not one.
 */

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import * as W from './world.js';

/**
 * A directional smear that leaves the player alone.
 *
 * Seven taps along one screen-space direction, scaled by how far a pixel is
 * from the player. The camera tracks him, so he is the one thing in frame that
 * is not moving relative to the lens: blurring him would be wrong however fast
 * he is going, while the city behind him should streak.
 *
 * Masking by screen distance rather than by depth also sidesteps a real
 * awkwardness -- `EffectComposer` ping-pongs between two render targets, so
 * "the buffer the scene's depth ended up in" is not a fixed object -- and it
 * happens to be the better art direction anyway.
 */
const MotionShader = {
  name: 'DirectionalMotionBlur',
  uniforms: {
    tDiffuse: { value: null },
    uDir: { value: new THREE.Vector2() },      // uv offset per tap, signed
    uPlayer: { value: new THREE.Vector2(0.5, 0.5) },
    uInner: { value: W.MOTION_INNER },
    uOuter: { value: W.MOTION_OUTER },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform vec2 uDir;
    uniform vec2 uPlayer;
    uniform float uInner;
    uniform float uOuter;
    varying vec2 vUv;

    const int TAPS = 7;

    void main() {
      float m = smoothstep( uInner, uOuter, distance( vUv, uPlayer ) );
      vec2 step = uDir * m;
      vec4 sum = vec4( 0.0 );
      for ( int i = 0; i < TAPS; i ++ ) {
        float t = float( i ) / float( TAPS - 1 ) - 0.5;
        sum += texture2D( tDiffuse, vUv + step * t );
      }
      gl_FragColor = sum / float( TAPS );
    }
  `,
};

/**
 * A cheap stand-in for a colour-grading LUT: contrast, saturation, a
 * shadow/highlight split tone and a vignette, all in one pass.
 *
 * It runs after `OutputPass`, not before it -- everything else in this file
 * works in the linear HDR buffer bloom needs, but a curve's "contrast around
 * 0.5" only means what it says once the image has actually been tone-mapped
 * and gamma-encoded into the 0..1 range a screen shows. Doing this pass
 * first and hoping ACES sorts it out is how you end up fighting the tone
 * curve instead of shaping the image.
 *
 * That puts it last in the chain, which matters for a reason that has
 * nothing to do with colour: `EffectComposer` decides which pass actually
 * lands on screen by array position, not by which passes are enabled -- so
 * whatever is added last here has to stay enabled forever. Toggling bloom
 * off is safe because bloom is in the middle of the chain; this pass never
 * gets a toggle for the same reason `OutputPass` never got one.
 */
const GradeShader = {
  name: 'ColourGrade',
  uniforms: {
    tDiffuse: { value: null },
    uContrast: { value: W.GRADE_CONTRAST },
    uSaturation: { value: W.GRADE_SATURATION },
    uShadowTint: { value: new THREE.Vector3(
      W.GRADE_SHADOW_TINT.r, W.GRADE_SHADOW_TINT.g, W.GRADE_SHADOW_TINT.b,
    ) },
    uHighlightTint: { value: new THREE.Vector3(
      W.GRADE_HIGHLIGHT_TINT.r, W.GRADE_HIGHLIGHT_TINT.g, W.GRADE_HIGHLIGHT_TINT.b,
    ) },
    uVignette: { value: W.GRADE_VIGNETTE },
    uAspect: { value: 1 },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4( position, 1.0 );
    }
  `,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse;
    uniform float uContrast;
    uniform float uSaturation;
    uniform vec3 uShadowTint;
    uniform vec3 uHighlightTint;
    uniform float uVignette;
    uniform float uAspect;
    varying vec2 vUv;

    void main() {
      vec4 texel = texture2D( tDiffuse, vUv );
      vec3 color = texel.rgb;

      color = ( color - 0.5 ) * uContrast + 0.5;

      float lum = dot( color, vec3( 0.2126, 0.7152, 0.0722 ) );
      color = mix( vec3( lum ), color, uSaturation );
      color += uShadowTint * ( 1.0 - lum ) + uHighlightTint * lum;

      vec2 d = vUv - 0.5;
      d.x *= uAspect;
      float vignette = clamp( 1.0 - uVignette * dot( d, d ), 0.0, 1.0 );
      color *= vignette;

      gl_FragColor = vec4( clamp( color, 0.0, 1.0 ), texel.a );
    }
  `,
};

export function createPostFx(renderer, scene, camera) {
  const size = renderer.getDrawingBufferSize(new THREE.Vector2());

  const target = new THREE.WebGLRenderTarget(size.x, size.y, {
    type: THREE.HalfFloatType,
    samples: 4,
  });
  const composer = new EffectComposer(renderer, target);

  const bloom = new UnrealBloomPass(
    new THREE.Vector2(size.x * W.BLOOM_SCALE, size.y * W.BLOOM_SCALE),
    W.BLOOM_STRENGTH, W.BLOOM_RADIUS, W.BLOOM_THRESHOLD,
  );

  // Blur before bloom, so the bloom blooms what you actually see. Grade after
  // OutputPass, so it shapes the delivered image rather than the linear one.
  const motion = new ShaderPass(MotionShader);
  const grade = new ShaderPass(GradeShader);
  grade.uniforms.uAspect.value = size.x / size.y;
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(motion);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  composer.addPass(grade);

  let enabled = true;
  let motionOn = true;
  const screen = new THREE.Vector2();

  return {
    get enabled() { return enabled; },

    /** Toggled from the overlay, so its cost can be measured rather than assumed. */
    toggle() {
      enabled = !enabled;
      bloom.enabled = enabled;
      return enabled;
    },

    /** Restrained at night, nearly off at noon: a bright sky blooms into mush. */
    setStrength(strength) {
      bloom.strength = enabled ? strength : 0;
    },

    /**
     * Aim the smear.
     *
     * The background moves opposite the player, so the blur runs along
     * `-velocity`. The two components are divided by the buffer's own width and
     * height because the uniform is in uv, where a pixel is not square.
     */
    setMotion(vx, vy, playerUvX, playerUvY) {
      const speed = Math.hypot(vx, vy);
      const t = Math.min(1, Math.max(0,
        (speed - W.MOTION_MIN_SPEED) / (W.MAX_SPEED - W.MOTION_MIN_SPEED)));
      renderer.getDrawingBufferSize(screen);
      const px = motionOn ? W.MOTION_MAX_PX * t : 0;
      const inv = speed > 1e-4 ? 1 / speed : 0;
      motion.uniforms.uDir.value.set(
        (-vx * inv * px) / screen.x,
        (-vy * inv * px) / screen.y,
      );
      motion.uniforms.uPlayer.value.set(playerUvX, playerUvY);
      motion.enabled = px > 0.01;
    },

    /** Toggled from the overlay, so its cost can be measured rather than assumed. */
    toggleMotion() {
      motionOn = !motionOn;
      return motionOn;
    },

    get motion() { return motionOn; },

    setSize(w, h) {
      composer.setSize(w, h);
      const dpr = renderer.getPixelRatio();
      bloom.setSize(w * dpr * W.BLOOM_SCALE, h * dpr * W.BLOOM_SCALE);
      grade.uniforms.uAspect.value = w / h;
    },

    render() {
      composer.render();
    },
  };
}
