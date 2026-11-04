const PATHS: Record<string, string> = {
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  rounds: "M4 6h16M4 12h16M4 18h10",
  users: "M16 19v-1a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v1M9.5 10a3 3 0 1 0 0-6 3 3 0 0 0 0 6M21 19v-1a4 4 0 0 0-3-3.9M15.5 4.1a3 3 0 0 1 0 5.8",
  bank: "M3 10h18L12 4zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18",
  bolt: "M13 3 5 13h6l-1 8 8-10h-6z",
  code: "m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14",
  shield: "M12 3 5 6v6c0 4.4 3 7.8 7 9 4-1.2 7-4.6 7-9V6z",
  coin: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M9 9.5c0-1 1.3-1.8 3-1.8s3 .8 3 1.8-1.3 1.6-3 2-3 1-3 2 1.3 1.8 3 1.8 3-.8 3-1.8M12 6v1.7M12 16.3V18",
  layers: "m12 3 9 5-9 5-9-5zM3 13l9 5 9-5",
  check: "m5 12 4.5 4.5L19 7",
  slash: "M12 3v6M12 15v6M5 12h14",
  pause: "M9 5v14M15 5v14",
  send: "M4 12 20 4l-6 16-3-7z",
  clock: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18M12 7v5l3 2",
  copy: "M9 9h10v10H9zM5 15V5h10",
  ext: "M14 4h6v6M20 4l-9 9M18 14v5H5V6h5",
  github: "M9 19c-4 1.3-4-2-6-2.5m12 5v-3.5c0-1 .1-1.4-.5-2 2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1-.3-3.4 1.3a11.6 11.6 0 0 0-6 0C6.8 3.3 5.8 3.6 5.8 3.6a4.2 4.2 0 0 0-.1 3.2A4.6 4.6 0 0 0 4.4 10c0 4.6 2.7 5.7 5.5 6-.6.6-.6 1.2-.5 2V21",
  arrow: "M5 12h14M13 6l6 6-6 6",
  swap: "M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4",
};

export function Icon({ name, size = 18 }: { name: keyof typeof PATHS | string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={PATHS[name]} />
    </svg>
  );
}
