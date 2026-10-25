/** App logo: a spade with a check badge (same artwork as the launcher icon). */
export function AppMark({ size = 52 }: { size?: number }) {
  return (
    <svg className="app-mark" width={size} height={size} viewBox="0 0 512 512" aria-hidden>
      <defs>
        <linearGradient id="am-bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#1d5a43" />
          <stop offset="1" stopColor="#0a1f17" />
        </linearGradient>
      </defs>
      <rect x="8" y="8" width="496" height="496" rx="116" fill="url(#am-bg)" stroke="#b89a4e" strokeOpacity="0.7" strokeWidth="10" />
      <path
        d="M256 104c-46 56-118 96-118 158 0 38 29 66 64 66 22 0 40-10 50-26-4 32-16 58-36 76h80c-20-18-32-44-36-76 10 16 28 26 50 26 35 0 64-28 64-66 0-62-72-102-118-158z"
        fill="#f5f2ea"
      />
      <circle cx="370" cy="372" r="62" fill="#c9a24c" stroke="#0d241b" strokeWidth="12" />
      <path d="m340 372 22 22 40-42" fill="none" stroke="#0d241b" strokeWidth="18" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
