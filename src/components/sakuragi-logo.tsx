export function SakuragiMark({ className = "h-8 w-8" }: { className?: string }) {
  return (
    <svg viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} aria-hidden="true">
      <defs>
        <linearGradient id="sakuragi-hex" x1="6" y1="4" x2="42" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#3b82f6" />
          <stop offset="1" stopColor="#1d4ed8" />
        </linearGradient>
      </defs>
      <path d="M24 3L42 13.5V34.5L24 45L6 34.5V13.5L24 3Z" fill="url(#sakuragi-hex)" />
      <text
        x="24"
        y="24"
        textAnchor="middle"
        dominantBaseline="central"
        fontFamily="Arial, Helvetica, sans-serif"
        fontWeight="700"
        fontSize="24"
        fill="#ffffff"
      >
        S
      </text>
    </svg>
  );
}

export function SakuragiWordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <SakuragiMark className="h-6 w-6" />
      <span className="font-bold tracking-wide">SAKURAGI</span>
    </span>
  );
}
