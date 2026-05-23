import { nextTick, watch, onUnmounted, type Ref } from 'vue';

export function useSilkBackground(
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

    const ctx = canvas.getContext('2d')!;
    if (!ctx) return;

    let time = 0;
    let animId: number;

    function resize() {
      canvas.width = ctn.offsetWidth;
      canvas.height = ctn.offsetHeight;
    }
    window.addEventListener('resize', resize, false);
    resize();

    function noise(x: number, y: number) {
      const G = 2.71828;
      const rx = G * Math.sin(G * x);
      const ry = G * Math.sin(G * y);
      return (rx * ry * (1 + x)) % 1;
    }

    function animate() {
      const { width, height } = canvas;

      const gradient = ctx.createLinearGradient(0, 0, width, height);
      gradient.addColorStop(0, '#1a1a1a');
      gradient.addColorStop(0.5, '#2a2a2a');
      gradient.addColorStop(1, '#1a1a1a');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, width, height);

      const imageData = ctx.createImageData(width, height);
      const data = imageData.data;

      for (let x = 0; x < width; x += 2) {
        for (let y = 0; y < height; y += 2) {
          const u = (x / width) * 2;
          const v = (y / height) * 2;
          const tOff = 0.02 * time;
          let tx = u;
          let ty = v + 0.03 * Math.sin(8.0 * tx - tOff);

          const pattern = 0.6 + 0.4 * Math.sin(
            5.0 * (tx + ty + Math.cos(3.0 * tx + 5.0 * ty) + 0.02 * tOff) +
            Math.sin(20.0 * (tx + ty - 0.1 * tOff))
          );

          const rnd = noise(x, y);
          const intensity = Math.max(0, pattern - rnd / 15.0 * 0.8);

          const r = Math.floor(123 * intensity);
          const g = Math.floor(116 * intensity);
          const b = Math.floor(129 * intensity);

          const idx = (y * width + x) * 4;
          if (idx < data.length) {
            data[idx] = r;
            data[idx + 1] = g;
            data[idx + 2] = b;
            data[idx + 3] = 255;
          }
        }
      }

      ctx.putImageData(imageData, 0, 0);

      const overlayGrad = ctx.createRadialGradient(
        width / 2, height / 2, 0,
        width / 2, height / 2, Math.max(width, height) / 2,
      );
      overlayGrad.addColorStop(0, 'rgba(0, 0, 0, 0.1)');
      overlayGrad.addColorStop(1, 'rgba(0, 0, 0, 0.4)');
      ctx.fillStyle = overlayGrad;
      ctx.fillRect(0, 0, width, height);

      time += 1;
      animId = requestAnimationFrame(animate);
    }
    animId = requestAnimationFrame(animate);

    cleanup = () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize, false);
      if (canvas.parentNode) ctn.removeChild(canvas);
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
