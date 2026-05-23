import { nextTick, watch, onUnmounted, type Ref } from 'vue';

export function useDigitalLoom(
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

    let threads: {
      x: number; y: number;
      speed: number; amplitude: number;
      frequency: number; phase: number;
    }[] = [];
    let animId: number;
    let w = 0;
    let h = 0;

    function resize() {
      w = ctn.offsetWidth;
      h = ctn.offsetHeight;
      canvas.width = w;
      canvas.height = h;
    }

    function initThreads() {
      threads = Array.from({ length: 80 }, () => ({
        x: Math.random() * w,
        y: Math.random() * h,
        speed: Math.random() * 0.5 + 0.1,
        amplitude: Math.random() * 20 + 10,
        frequency: Math.random() * 0.02 + 0.01,
        phase: Math.random() * Math.PI * 2,
      }));
    }

    resize();
    initThreads();

    // Initial fill
    ctx.fillStyle = '#000000';
    ctx.fillRect(0, 0, w, h);

    function animate() {
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = 'rgba(0, 0, 0, 0.1)';
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(100, 100, 255, 0.3)';
      ctx.lineWidth = 0.5;

      for (const t of threads) {
        t.x += t.speed;
        if (t.x > w) {
          t.x = 0;
          t.y = Math.random() * h;
        }

        const startX = Math.max(t.x - 200, 0);
        ctx.beginPath();
        ctx.moveTo(startX, t.y + Math.sin(startX * t.frequency + t.phase) * t.amplitude);
        for (let i = Math.ceil(startX); i <= t.x && i < w; i++) {
          ctx.lineTo(i, t.y + Math.sin(i * t.frequency + t.phase) * t.amplitude);
        }
        ctx.stroke();
      }

      animId = requestAnimationFrame(animate);
    }
    animId = requestAnimationFrame(animate);

    window.addEventListener('resize', resize, false);

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
