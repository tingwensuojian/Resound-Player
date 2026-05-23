import { nextTick, watch, onUnmounted, type Ref } from 'vue';

const fragmentShader = `
precision highp float;
uniform float u_time;
uniform vec2 u_resolution;
uniform vec2 u_mouse;

float hash(vec2 p) {
  p = fract(p * vec2(123.34, 456.21));
  p += dot(p, p + 45.32);
  return fract(p.x * p.y);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  for (int i = 0; i < 6; i++) {
    v += a * noise(p);
    p *= 2.0;
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = gl_FragCoord.xy / u_resolution.xy;
  uv.x *= u_resolution.x / u_resolution.y;

  vec2 mPos = u_mouse / u_resolution.xy;
  mPos.x *= u_resolution.x / u_resolution.y;
  float dist = distance(uv, mPos);

  vec2 q = vec2(0.0);
  q.x = fbm(uv + 0.07 * u_time);
  q.y = fbm(uv + vec2(1.0, 1.0));

  vec2 r = vec2(0.0);
  r.x = fbm(uv + 1.0 * q + vec2(1.7, 9.2) + 0.15 * u_time);
  r.y = fbm(uv + 1.0 * q + vec2(8.3, 2.8) + 0.126 * u_time);

  float f = fbm(uv + r);

  vec3 baseColor = vec3(0.03, 0.03, 0.05);
  vec3 mistColor = vec3(0.18, 0.20, 0.25);
  vec3 accentColor = vec3(0.3, 0.35, 0.45);

  vec3 color = mix(baseColor, mistColor, f);
  color = mix(color, accentColor, dot(q, r) * 0.5);

  float mouseGlow = smoothstep(0.35, 0.0, dist);
  color += mouseGlow * 0.05 * vec3(0.6, 0.7, 1.0);

  color = pow(color, vec3(1.1)) * 1.4;
  gl_FragColor = vec4(color, 1.0);
}
`;

function createShader(gl: WebGLRenderingContext, type: number, source: string) {
  const shader = gl.createShader(type)!;
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  return shader;
}

export function useMistBackground(
  containerRef: Ref<HTMLElement | null>,
  active: Ref<boolean>,
) {
  let cleanup: (() => void) | null = null;

  function start() {
    const ctn = containerRef.value!;
    if (!ctn) return;

    const canvas = document.createElement('canvas');
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    canvas.style.display = 'block';
    ctn.appendChild(canvas);

    const gl = canvas.getContext('webgl')!;
    if (!gl) return;

    const program = gl.createProgram()!;
    gl.attachShader(program, createShader(gl, gl.VERTEX_SHADER,
      `attribute vec2 position; void main() { gl_Position = vec4(position, 0.0, 1.0); }`,
    ));
    gl.attachShader(program, createShader(gl, gl.FRAGMENT_SHADER, fragmentShader));
    gl.linkProgram(program);
    gl.useProgram(program);

    const vertices = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
    const buffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

    const posAttr = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(posAttr);
    gl.vertexAttribPointer(posAttr, 2, gl.FLOAT, false, 0, 0);

    const timeLoc = gl.getUniformLocation(program, 'u_time');
    const resLoc = gl.getUniformLocation(program, 'u_resolution');
    const mouseLoc = gl.getUniformLocation(program, 'u_mouse');

    const mouse = { x: 0, y: 0 };

    function onMouseMove(e: MouseEvent) {
      mouse.x = e.clientX;
      mouse.y = window.innerHeight - e.clientY;
    }
    window.addEventListener('mousemove', onMouseMove);

    function resize() {
      const w = ctn.offsetWidth;
      const h = ctn.offsetHeight;
      canvas.width = w * devicePixelRatio;
      canvas.height = h * devicePixelRatio;
      canvas.style.width = w + 'px';
      canvas.style.height = h + 'px';
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    window.addEventListener('resize', resize, false);
    resize();

    let animId: number;

    function update(t: number) {
      animId = requestAnimationFrame(update);
      gl.uniform1f(timeLoc, t * 0.001);
      gl.uniform2f(resLoc, canvas.width, canvas.height);
      gl.uniform2f(mouseLoc, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    }
    animId = requestAnimationFrame(update);

    cleanup = () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('resize', resize);
      if (canvas.parentNode) ctn.removeChild(canvas);
      gl.getExtension('WEBGL_lose_context')?.loseContext();
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
