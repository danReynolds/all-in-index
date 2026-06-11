/** A poker-chip mark — "All-In" is a poker term, the besties play. */
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" aria-hidden className="shrink-0">
      <defs>
        <linearGradient id="chip" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#34d399" />
          <stop offset="100%" stopColor="#059669" />
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="48" fill="url(#chip)" />
      {/* edge notches */}
      {Array.from({ length: 12 }).map((_, i) => {
        const a = (i * 30 * Math.PI) / 180;
        const x = 50 + Math.cos(a) * 44;
        const y = 50 + Math.sin(a) * 44;
        return (
          <rect
            key={i}
            x={x - 4}
            y={y - 4}
            width="8"
            height="8"
            rx="1.5"
            fill="#ffffff"
            opacity="0.85"
            transform={`rotate(${i * 30} ${x} ${y})`}
          />
        );
      })}
      <circle cx="50" cy="50" r="33" fill="none" stroke="#ffffff" strokeOpacity="0.9" strokeWidth="3" />
      <circle cx="50" cy="50" r="26" fill="#022c22" />
      <text x="50" y="58" textAnchor="middle" fontSize="22" fontWeight="800" fill="#ffffff" fontFamily="system-ui">
        AI
      </text>
    </svg>
  );
}
