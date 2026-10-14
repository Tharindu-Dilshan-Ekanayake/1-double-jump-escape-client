/** Small hand-made SVG icons for the HUD and shop cards. */

export function TrophyIcon(props) {
  return (
    <svg viewBox="0 0 64 64" {...props}>
      <path d="M14 10h36v8c0 12-7 20-18 20S14 30 14 18z" fill="#ffc21a" stroke="#15151d" strokeWidth="4" strokeLinejoin="round" />
      <path d="M14 14H6c0 10 5 15 12 15M50 14h8c0 10-5 15-12 15" fill="none" stroke="#15151d" strokeWidth="4" />
      <path d="M14 14H6c0 10 5 15 12 15M50 14h8c0 10-5 15-12 15" fill="none" stroke="#ffc21a" strokeWidth="2" />
      <rect x="27" y="37" width="10" height="10" fill="#e8a010" stroke="#15151d" strokeWidth="4" />
      <rect x="18" y="46" width="28" height="9" rx="2" fill="#ffc21a" stroke="#15151d" strokeWidth="4" />
      <path d="M22 15c0 8 3 13 8 15" fill="none" stroke="#fff6c8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Rebirth: two pink arrows swirling round a blue core on a white disc. */
export function RebirthIcon(props) {
  return (
    <svg viewBox="0 0 64 64" {...props}>
      <circle cx="32" cy="32" r="27" fill="#ffffff" stroke="#15151d" strokeWidth="4" />
      <g fill="none" stroke="#ff3f78" strokeWidth="7" strokeLinecap="round">
        <path d="M14 32A18 18 0 0 1 41 16.4" />
        <path d="M50 32A18 18 0 0 1 23 47.6" />
      </g>
      <path d="M47.1 19.9 36.1 22.8 44.1 9z" fill="#ff3f78" stroke="#ff3f78" strokeWidth="1.5" strokeLinejoin="round" />
      <path d="M16.9 44.1 27.9 41.2 19.9 55z" fill="#ff3f78" stroke="#ff3f78" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="32" cy="32" r="9" fill="#36c9ff" stroke="#15151d" strokeWidth="3" />
      <circle cx="29" cy="29" r="3" fill="#ffffff" />
    </svg>
  )
}

/** A chunky boot in the boot's colours. */
export function BootIcon({ color = '#2f9cf6', accent = '#ffe23a', size = 72, glow }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} style={glow ? { filter: `drop-shadow(0 0 6px ${glow})` } : undefined}>
      <path d="M18 6h18v30l18 6c4 1.4 6 4 6 8v6H8V12c0-3.3 2.7-6 6-6z" fill={color} stroke="#15151d" strokeWidth="4" strokeLinejoin="round" />
      <path d="M8 50h52v6H8z" fill="#2a2a33" stroke="#15151d" strokeWidth="4" strokeLinejoin="round" />
      <path d="M8 14h28" stroke={accent} strokeWidth="6" />
      <path d="M8 14h28" stroke="#15151d" strokeWidth="1" opacity="0.3" />
      <path d="M40 38l4 1.4M46 40l4 1.6" stroke={accent} strokeWidth="4" strokeLinecap="round" />
      <path d="M14 20c0 6 1 10 4 13" fill="none" stroke="#ffffff" strokeWidth="3" strokeLinecap="round" opacity="0.6" />
    </svg>
  )
}

export function StarIcon(props) {
  return (
    <svg viewBox="0 0 64 64" {...props}>
      <path d="M32 4l8.6 17.4 19.2 2.8-13.9 13.5 3.3 19.1L32 47.8 14.8 56.8l3.3-19.1L4.2 24.2l19.2-2.8z" fill="#ffd23a" stroke="#15151d" strokeWidth="4" strokeLinejoin="round" />
      <path d="M32 12l5.9 12 13.2 1.9" fill="none" stroke="#fff6c8" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

/** Wins are the only currency, so every price shows a trophy. */
export function CurrencyIcon() {
  return <TrophyIcon width="1.1em" height="1.1em" />
}
