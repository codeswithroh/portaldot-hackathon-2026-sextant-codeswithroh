/** Small hand-drawn SVG charts. Recharts handles the larger ones. */

export function Gauge({ value, max, label, sub, tone = "var(--primary)" }: { value: number; max: number; label: string; sub?: string; tone?: string }) {
  const ticks = 34;
  const lit = Math.round(Math.min(1, Math.max(0, value / max)) * ticks);
  return (
    <div className="gauge">
      <svg viewBox="0 0 220 124" role="img" aria-label={`${label} ${sub ?? ""}`}>
        {Array.from({ length: ticks }, (_, i) => {
          const a = Math.PI - (i / (ticks - 1)) * Math.PI;
          const r1 = 84, r2 = i % 3 === 0 ? 104 : 100;
          return (
            <line key={i} x1={110 + r1 * Math.cos(a)} y1={112 - r1 * Math.sin(a)} x2={110 + r2 * Math.cos(a)} y2={112 - r2 * Math.sin(a)}
              stroke={i < lit ? tone : "var(--surface)"} strokeWidth={5} strokeLinecap="round" />
          );
        })}
      </svg>
      <div className="gauge-mid"><b className="mono">{label}</b>{sub && <span>{sub}</span>}</div>
    </div>
  );
}

export function Donut({ parts, size = 84, stroke = 12, children }: { parts: { value: number; color: string }[]; size?: number; stroke?: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const total = parts.reduce((a, p) => a + p.value, 0) || 1;
  let off = 0;
  return (
    <div className="donut" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface)" strokeWidth={stroke} />
        {parts.map((p, i) => {
          const len = (p.value / total) * c;
          const el = <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none" stroke={p.color} strokeWidth={stroke}
            strokeDasharray={`${Math.max(0, len - 2)} ${c}`} strokeDashoffset={-off} transform={`rotate(-90 ${size / 2} ${size / 2})`} />;
          off += len;
          return el;
        })}
      </svg>
      {children && <div className="donut-mid">{children}</div>}
    </div>
  );
}

export function Spark({ data, color = "var(--primary)", w = 120, h = 40 }: { data: number[]; color?: string; w?: number; h?: number }) {
  if (data.length < 2) return <svg width={w} height={h} aria-hidden="true"><line x1={0} x2={w} y1={h / 2} y2={h / 2} stroke="var(--surface)" strokeWidth={2} /></svg>;
  const min = Math.min(...data), max = Math.max(...data);
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, max === min ? h / 2 : h - 4 - ((v - min) / (max - min)) * (h - 8)]);
  const line = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const id = `sp${data.length}${Math.round(min)}`;
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs><linearGradient id={id} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={color} stopOpacity=".28" /><stop offset="1" stopColor={color} stopOpacity="0" /></linearGradient></defs>
      <path d={`${line} L${w} ${h} L0 ${h} Z`} fill={`url(#${id})`} />
      <path d={line} fill="none" stroke={color} strokeWidth={2} strokeLinejoin="round" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r={3} fill={color} />
    </svg>
  );
}

/** Horizontal bar split into coloured segments. */
export function Segments({ parts, height = 10 }: { parts: { value: number; color: string; label?: string }[]; height?: number }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  return (
    <div className="segs" style={{ height }}>
      {total === 0 ? <i style={{ flex: 1, background: "var(--surface)" }} /> : parts.filter((p) => p.value > 0).map((p, i) => <i key={i} title={p.label} style={{ flex: p.value, background: p.color }} />)}
    </div>
  );
}

export function Avatar({ name, color, size = 34 }: { name: string; color: string; size?: number }) {
  return <span className="avatar" style={{ width: size, height: size, background: color, fontSize: size * 0.38 }}>{name.slice(0, 2)}</span>;
}

export function Progress({ value, color = "var(--primary)" }: { value: number; color?: string }) {
  return <div className="bar"><i style={{ width: "100%", transform: `scaleX(${Math.min(1, Math.max(0, value))})`, background: color }} /></div>;
}
