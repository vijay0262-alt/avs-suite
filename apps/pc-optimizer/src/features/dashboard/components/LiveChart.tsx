import { useEffect, useRef } from 'react';
import { Card } from '@avs/ui';

export interface LiveChartProps {
  title: string;
  data: number[];
  maxDataPoints: number;
  color: string;
  unit: string;
  height?: number;
}

export function LiveChart({ title, data, maxDataPoints, color, unit, height = 120 }: LiveChartProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animationRef = useRef<number>();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * window.devicePixelRatio;
    canvas.height = rect.height * window.devicePixelRatio;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const draw = () => {
      const width = rect.width;
      const height = rect.height;

      // Clear canvas
      ctx.clearRect(0, 0, width, height);

      if (data.length < 2) return;

      // Calculate scales
      const max = Math.max(...data, 100);
      const min = Math.min(...data, 0);
      const range = max - min || 1;

      // Draw grid lines
      ctx.strokeStyle = 'rgba(128, 128, 128, 0.1)';
      ctx.lineWidth = 1;
      for (let i = 0; i <= 4; i++) {
        const y = (height / 4) * i;
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(width, y);
        ctx.stroke();
      }

      // Draw line
      ctx.strokeStyle = color;
      ctx.lineWidth = 2;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      ctx.beginPath();
      data.forEach((value, index) => {
        const x = (index / (maxDataPoints - 1)) * width;
        const y = height - ((value - min) / range) * height;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.stroke();

      // Draw gradient fill
      const gradient = ctx.createLinearGradient(0, 0, 0, height);
      gradient.addColorStop(0, color.replace(')', ', 0.2)').replace('rgb', 'rgba'));
      gradient.addColorStop(1, color.replace(')', ', 0)').replace('rgb', 'rgba'));

      ctx.fillStyle = gradient;
      ctx.beginPath();
      data.forEach((value, index) => {
        const x = (index / (maxDataPoints - 1)) * width;
        const y = height - ((value - min) / range) * height;
        
        if (index === 0) {
          ctx.moveTo(x, y);
        } else {
          ctx.lineTo(x, y);
        }
      });
      ctx.lineTo(width, height);
      ctx.lineTo(0, height);
      ctx.closePath();
      ctx.fill();

      // Draw current value dot
      if (data.length > 0) {
        const lastValue = data[data.length - 1];
        if (lastValue !== undefined) {
          const x = width;
          const y = height - ((lastValue - min) / range) * height;

          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();

          // Glow effect
          ctx.shadowColor = color;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(x, y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      }
    };

    draw();

    // Animate on data change
    if (animationRef.current) {
      cancelAnimationFrame(animationRef.current);
    }

    let progress = 0;
    const animate = () => {
      progress += 0.1;
      if (progress >= 1) {
        draw();
        return;
      }
      draw();
      animationRef.current = requestAnimationFrame(animate);
    };

    animationRef.current = requestAnimationFrame(animate);

    return () => {
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [data, maxDataPoints, color]);

  const currentValue: number = data.length > 0 ? (data[data.length - 1] ?? 0) : 0;

  return (
    <Card title={title} className="h-full" role="region" aria-labelledby={`chart-title-${title.replace(/\s+/g, '-').toLowerCase()}`}>
      <h2 id={`chart-title-${title.replace(/\s+/g, '-').toLowerCase()}`} className="sr-only">{title} chart</h2>
      <div className="space-y-4">
        <div className="flex items-baseline gap-2">
          <span className="text-3xl font-bold text-text-primary tabular-nums" aria-live="polite" aria-atomic="true">
            {currentValue.toFixed(1)}
          </span>
          <span className="text-sm text-text-muted">{unit}</span>
        </div>
        <div className="relative" style={{ height }}>
          <canvas
            ref={canvasRef}
            className="w-full h-full"
            style={{ display: 'block' }}
            role="img"
            aria-label={`${title} chart showing current value ${currentValue.toFixed(1)} ${unit}`}
          />
        </div>
      </div>
    </Card>
  );
}
