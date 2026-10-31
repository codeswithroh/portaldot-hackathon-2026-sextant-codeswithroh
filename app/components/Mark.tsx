/** Sextant arc: a 60-degree sector with a sighting line. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
      <path d="M16 3 L4 25 A24 24 0 0 0 28 25 Z" fill="#2978ac" />
      <path d="M16 3 L20.5 28" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
      <circle cx="16" cy="3.5" r="3" fill="#ab5a4b" />
    </svg>
  );
}
