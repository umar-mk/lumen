/** Lumen wordmark: a minimal radiant-point glyph plus the name. Pure SVG + text. */
export default function Wordmark({ className = "" }: { className?: string }) {
  return (
    <span className={`inline-flex items-center gap-2.5 ${className}`}>
      <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden className="shrink-0">
        <circle cx="9" cy="9" r="3" fill="var(--accent)" />
        <g stroke="var(--accent)" strokeWidth="1.4" strokeLinecap="round" opacity="0.75">
          <line x1="9" y1="0.9" x2="9" y2="3.4" />
          <line x1="9" y1="14.6" x2="9" y2="17.1" />
          <line x1="0.9" y1="9" x2="3.4" y2="9" />
          <line x1="14.6" y1="9" x2="17.1" y2="9" />
        </g>
      </svg>
      <span className="text-[1.05rem] font-medium tracking-tight text-foreground">Lumen</span>
    </span>
  );
}
