interface Props {
  points: number[];
  width?: number;
  height?: number;
  className?: string;
  /** Disable the draw-in (e.g. rows entering an already-rendered list). */
  animate?: boolean;
}

/** Minimal dependency-free SVG sparkline, colored by net direction. */
export function Sparkline({ points, width = 120, height = 32, className, animate = true }: Props) {
  if (points.length < 2) {
    return (
      <svg width={width} height={height} className={className} aria-hidden>
        <line
          x1={0}
          y1={height / 2}
          x2={width}
          y2={height / 2}
          stroke="currentColor"
          strokeOpacity={0.2}
          strokeDasharray="3 3"
        />
      </svg>
    );
  }
  const min = Math.min(...points);
  const max = Math.max(...points);
  const span = max - min || 1;
  const pad = 2;
  const stepX = (width - pad * 2) / (points.length - 1);
  const coords = points.map((p, i) => {
    const x = pad + i * stepX;
    const y = pad + (height - pad * 2) * (1 - (p - min) / span);
    return [x, y] as const;
  });
  const d = coords.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`).join(" ");
  const up = points[points.length - 1] >= points[0];
  const stroke = up ? "#10b981" : "#f43f5e";
  return (
    <svg width={width} height={height} className={className} aria-hidden>
      <path d={d} fill="none" stroke={stroke} strokeWidth={1.5} strokeLinejoin="round" pathLength={1} className={animate ? "spark-draw" : undefined} />
    </svg>
  );
}
