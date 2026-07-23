export function BrandMark({ className }: { className?: string }) {
  return <svg className={className} viewBox="0 0 40 40" role="img" aria-label="Market Clarity logo">
    <defs><linearGradient id="clarity-mark" x1="5" y1="4" x2="34" y2="36" gradientUnits="userSpaceOnUse"><stop stopColor="#1f6fe5"/><stop offset="1" stopColor="#284ca8"/></linearGradient></defs>
    <rect x="2" y="2" width="36" height="36" rx="11" fill="url(#clarity-mark)"/>
    <path d="M11 25.5V19m6 6.5V13m6 12.5v-9m6 9.2V10" fill="none" stroke="white" strokeWidth="2.4" strokeLinecap="round"/>
    <path d="m11.5 29 5.2 3 11.8-6.4" fill="none" stroke="#f2c76b" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>;
}
