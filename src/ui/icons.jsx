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

/** Rebirth: a pink arrow over the top and a sky-blue one underneath, chasing each other round. */
const REBIRTH_PINK = 'M8.70 24.43A24.5 24.5 0 0 1 55.30 24.43L61.01 22.57L50.44 36.60L39.13 29.68L44.84 27.83A13.5 13.5 0 0 0 19.16 27.83Z'
const REBIRTH_BLUE = 'M55.30 39.57A24.5 24.5 0 0 1 8.70 39.57L2.99 41.43L13.56 27.40L24.87 34.32L19.16 36.17A13.5 13.5 0 0 0 44.84 36.17Z'

export function RebirthIcon(props) {
  return (
    <svg viewBox="-2 -2 68 68" {...props}>
      <defs>
        <linearGradient id="rebirth-pink" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff9ccb" />
          <stop offset="1" stopColor="#e3337f" />
        </linearGradient>
        <linearGradient id="rebirth-blue" x1="1" y1="1" x2="0" y2="0">
          <stop offset="0" stopColor="#d9f2ff" />
          <stop offset="1" stopColor="#7cc8f6" />
        </linearGradient>
      </defs>
      {/* Dark outline, then a white rim, then the colour. */}
      <g fill="none" stroke="#2a2238" strokeWidth="7.5" strokeLinejoin="round">
        <path d={REBIRTH_PINK} />
        <path d={REBIRTH_BLUE} />
      </g>
      <path d={REBIRTH_BLUE} fill="url(#rebirth-blue)" stroke="#ffffff" strokeWidth="3.2" strokeLinejoin="round" />
      <path d={REBIRTH_PINK} fill="url(#rebirth-pink)" stroke="#ffffff" strokeWidth="3.2" strokeLinejoin="round" />
      <g fill="none" stroke="#ffffff" strokeWidth="2.4" strokeLinecap="round" opacity="0.55">
        <path d="M13.77 20.61A21.5 21.5 0 0 1 48.47 18.18" />
        <path d="M50.23 43.39A21.5 21.5 0 0 1 15.53 45.82" />
      </g>
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
