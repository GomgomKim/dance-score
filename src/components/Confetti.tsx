import { useEffect, useRef } from 'react';

interface Props {
  /** 값이 바뀔 때마다 한 번 터짐 (0이면 안 터짐) */
  fire: number;
  colors: string[];
  count?: number;
}

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  vr: number;
  color: string;
  life: number;
}

export function Confetti({ fire, colors, count = 160 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (!fire) return;
    const canvas = canvasRef.current!;
    const ctx = canvas.getContext('2d')!;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      canvas.width = canvas.clientWidth * dpr;
      canvas.height = canvas.clientHeight * dpr;
    };
    resize();
    const W = canvas.width;
    const H = canvas.height;
    const parts: Particle[] = Array.from({ length: count }, (_, i) => {
      const fromLeft = i % 2 === 0;
      const angle = (fromLeft ? -60 : -120) * (Math.PI / 180) + (Math.random() - 0.5) * 0.9;
      const speed = (12 + Math.random() * 16) * dpr;
      return {
        x: fromLeft ? W * 0.1 : W * 0.9,
        y: H * 0.75,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r: (4 + Math.random() * 6) * dpr,
        rot: Math.random() * Math.PI,
        vr: (Math.random() - 0.5) * 0.4,
        color: colors[i % colors.length],
        life: 1,
      };
    });
    let raf = 0;
    const step = () => {
      ctx.clearRect(0, 0, W, H);
      let alive = 0;
      for (const p of parts) {
        if (p.life <= 0) continue;
        p.vy += 0.45 * dpr;
        p.vx *= 0.985;
        p.vy *= 0.985;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.y > H + 20) p.life = 0;
        else p.life -= 0.004;
        if (p.life <= 0) continue;
        alive++;
        ctx.save();
        ctx.globalAlpha = Math.min(1, p.life * 2);
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.r, -p.r * 0.5, p.r * 2, p.r);
        ctx.restore();
      }
      if (alive) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [fire, colors, count]);
  return <canvas ref={canvasRef} className="confetti" />;
}
