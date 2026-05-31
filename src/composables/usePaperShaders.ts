import { nextTick, watch, onUnmounted, type Ref } from 'vue';
import { shouldSkipWebGLEffect } from '../utils/deviceDetector';

/* ------------------------------------------------------------------ */
/*  MeshGradient — 有机流动渐变网格                                    */
/*  对应 @paper-design/shaders-react 的 MeshGradient 效果              */
/* ------------------------------------------------------------------ */

const vertexShader = `
uniform float time;
uniform float speed;
varying vec2 vUv;

void main() {
  vUv = uv;
  vec3 pos = position;
  // 柔和流动位移
  pos.x += sin(pos.y * 2.5 + time * 0.4 * speed) * 0.03;
  pos.y += cos(pos.x * 3.0 + time * 0.3 * speed) * 0.03;
  pos.z += sin(pos.x * 2.0 + pos.y * 2.0 + time * 0.5 * speed) * 0.02;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(pos, 1.0);
}
`;

const fragmentShader = `
uniform float time;
uniform float speed;
uniform vec3 color1;
uniform vec3 color2;
uniform vec3 color3;
uniform vec3 color4;
varying vec2 vUv;

void main() {
  // 多层级正弦混合，产生平滑有机渐变
  float d1 = sin(vUv.x * 3.0 + time * 0.2 * speed) * cos(vUv.y * 2.5 + time * 0.15 * speed);
  float d2 = sin(vUv.y * 4.0 - time * 0.25 * speed) * cos(vUv.x * 3.5 + time * 0.2 * speed);
  float blend = d1 * 0.5 + d2 * 0.5;
  blend = blend * 0.5 + 0.5;

  // 四色渐变混合
  vec3 mixed = mix(mix(color1, color2, blend), mix(color3, color4, 1.0 - blend), blend);

  // 柔和光晕（暗角）
  float vignette = 1.0 - length(vUv - 0.5) * 1.2;
  vignette = pow(max(vignette, 0.0), 0.8);

  gl_FragColor = vec4(mixed * vignette, 1.0);
}
`;

export function usePaperShaders(
  containerRef: Ref<HTMLElement | null>,
  config: Ref<{ color1: string; color2: string; color3: string; color4: string; speed: number }>,
  active: Ref<boolean>,
) {
  let cleanup: (() => void) | null = null;

  async function start() {
    // 低配设备跳过WebGL效果
    if (shouldSkipWebGLEffect()) {
      console.log('[PaperShaders] 跳过：设备等级不足');
      return;
    }
    
    const THREE = await import('three');
    const ctn = containerRef.value!;
    if (!ctn) return;

    const w = ctn.clientWidth;
    const h = ctn.clientHeight;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 10);
    camera.position.z = 1.8;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(w, h);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    ctn.appendChild(renderer.domElement);

    const { color1, color2, color3, color4, speed } = config.value;
    const uniforms = {
      time: { value: 0 },
      speed: { value: speed },
      color1: { value: new THREE.Color(color1) },
      color2: { value: new THREE.Color(color2) },
      color3: { value: new THREE.Color(color3) },
      color4: { value: new THREE.Color(color4) },
    };

    const geo = new THREE.PlaneGeometry(3.2, 3.2, 64, 64);
    const mat = new THREE.ShaderMaterial({
      uniforms,
      vertexShader,
      fragmentShader,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(geo, mat);
    scene.add(mesh);

    let frameId: number;

    function animate(t: number) {
      uniforms.time.value = t * 0.001;
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    }
    frameId = requestAnimationFrame(animate);

    function handleResize() {
      const cw = ctn.clientWidth;
      const ch = ctn.clientHeight;
      camera.aspect = cw / ch;
      camera.updateProjectionMatrix();
      renderer.setSize(cw, ch);
    }

    window.addEventListener('resize', handleResize);

    cleanup = () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener('resize', handleResize);
      if (renderer.domElement.parentNode) ctn.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }

  function stop() {
    if (cleanup) { cleanup(); cleanup = null; }
  }

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
