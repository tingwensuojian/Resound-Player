import { nextTick, watch, onUnmounted, type Ref } from 'vue';
import { shouldSkipWebGLEffect } from '../utils/deviceDetector';

const vertexShader = `
attribute vec2 uv;
attribute vec2 position;
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 0, 1);
}
`;

const fragmentShader = `
precision highp float;
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uResolution;
uniform float uAmplitude;
uniform float uSpeed;
varying vec2 vUv;

void main() {
  float mr = min(uResolution.x, uResolution.y);
  vec2 uv = (vUv.xy * 2.0 - 1.0) * uResolution.xy / mr;
  float d = 0.0;
  float a = 0.0;
  for (float i = 0.0; i < 8.0; ++i) {
    a += cos(i - d - a * uv.x);
    d += sin(uv.y * i + a);
  }
  // 流速直接驱动图案流动（不再自我抵消）
  float flow = uTime * 0.5 * uSpeed;
  vec3 col = vec3(cos((uv + flow) * vec2(d, a)) * 0.6 + 0.4, cos(a + d + flow) * 0.5 + 0.5);
  // 三色混合
  float blend1 = sin(d * 0.3) * 0.5 + 0.5;
  float blend2 = cos(a * 0.4) * 0.5 + 0.5;
  vec3 mixedColor = mix(uColor1, uColor2, blend1);
  mixedColor = mix(mixedColor, uColor3, blend2);
  col = cos(col * cos(vec3(d, a, 2.5)) * 0.5 + 0.5) * mixedColor;
  // 强度控制整体明暗（0=几乎不可见，1=完全显现）
  col *= 0.1 + 0.9 * uAmplitude;
  gl_FragColor = vec4(col, 1.0);
}
`;

export interface IridescenceConfig {
  color1: [number, number, number];
  color2: [number, number, number];
  color3: [number, number, number];
  speed: number;
  amplitude: number;
}

type Program = any;
// Color is dynamically imported from 'ogl'; declare var for type compatibility
declare var Color: any;

export function useIridescence(
  containerRef: Ref<HTMLElement | null>,
  config: Ref<IridescenceConfig>,
  active: Ref<boolean>,
) {
  let cleanup: (() => void) | null = null;
  let started = false;
  let program: Program | null = null;
  let gl: any = null;
  let rendererInst: any = null;

  function applyConfig() {
    if (!program) return;
    const { color1, color2, color3, speed, amplitude } = config.value;
    program.uniforms.uColor1.value = new (Color as any)(color1[0], color1[1], color1[2]);
    program.uniforms.uColor2.value = new (Color as any)(color2[0], color2[1], color2[2]);
    program.uniforms.uColor3.value = new (Color as any)(color3[0], color3[1], color3[2]);
    program.uniforms.uAmplitude.value = amplitude;
    program.uniforms.uSpeed.value = speed;
  }

  async function start() {
    // 低配设备跳过WebGL效果
    if (shouldSkipWebGLEffect()) {
      console.log('[Iridescence] 跳过：设备等级不足');
      return;
    }
    
    const { Renderer, Program, Mesh, Triangle, Color } = await import('ogl');
    const ctn = containerRef.value!;
    if (!ctn || started) { return; }

    try { rendererInst = new Renderer({ alpha: true }); } catch(e) { console.error('[iri] Renderer init failed', e); return; }
    gl = rendererInst.gl;
    gl.clearColor(0, 0, 0, 0);

    program = null;

    function resize() {
      const w = ctn.offsetWidth * devicePixelRatio;
      const h = ctn.offsetHeight * devicePixelRatio;
      rendererInst.setSize(w, h);
      if (program) {
        const ratio = w / h;
        program.uniforms.uResolution.value = new Color(w, h, ratio);
      }
    }
    window.addEventListener('resize', resize, false);
    resize();

    let animId: number;
    try {
      const geometry = new Triangle(gl);
      program = new (Program as any)(gl as any, {
        vertex: vertexShader,
        fragment: fragmentShader,
        uniforms: {
          uTime: { value: 0 },
          uColor1: { value: new Color(1, 1, 1) },
          uColor2: { value: new Color(1, 1, 1) },
          uColor3: { value: new Color(1, 1, 1) },
          uResolution: { value: new Color(gl.canvas.width, gl.canvas.height, gl.canvas.width / gl.canvas.height) },
          uAmplitude: { value: 0 },
          uSpeed: { value: 0 },
        },
      });
      applyConfig();

      const mesh = new Mesh(gl, { geometry, program });

      function update(t: number) {
        animId = requestAnimationFrame(update);
        program.uniforms.uTime.value = t * 0.001;
        rendererInst.render({ scene: mesh });
      }
      animId = requestAnimationFrame(update);
      ctn.appendChild(gl.canvas as HTMLCanvasElement);
      started = true;
    } catch(e) { console.error('[iri] setup failed', e); }

    cleanup = () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
      if ((gl.canvas as HTMLCanvasElement).parentNode) ctn.removeChild(gl.canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      started = false;
    };
  }

  function stop() {
    if (cleanup) { cleanup(); cleanup = null; }
    program = null;
    gl = null as any;
    rendererInst = null;
  }

  // Apply config changes to the running shader in real-time
  watch(config, applyConfig, { deep: true });

  // Watch both active state AND container availability.
  // 使用 nextTick 确保 v-show DOM 更新后再读取容器尺寸
  watch([active, containerRef], () => {
    if (active.value && containerRef.value) {
      nextTick(() => start());
    } else if (!active.value) {
      stop();
    }
  });

  onUnmounted(() => stop());

  return { start, stop };
}
