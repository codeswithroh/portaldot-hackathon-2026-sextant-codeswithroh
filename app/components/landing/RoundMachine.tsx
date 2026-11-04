"use client";
import { useMemo, useState } from "react";
import { runRound } from "@/lib/round";

const ST = [
  { name: "Coinbase", tag: "CB", jitter: 6 },
  { name: "Kraken", tag: "KR", jitter: -11 },
  { name: "Bitstamp", tag: "BS", jitter: 14 },
  { name: "Gemini", tag: "GM", jitter: -4 },
  { name: "Bitfinex", tag: "BF", jitter: 9 },
];
const Y = [52, 136, 220, 304, 388];
const CX = 318, CY = 220;
const wire = (y: number) => `M128 ${y + 22} C 200 ${y + 22}, 200 ${CY}, ${CX - 74} ${CY}`;

/** Hero illustration: five line-art reporter stations feeding the median. Click one to make it lie. */
export function RoundMachine({ base = 78_300 }: { base?: number }) {
  const [liars, setLiars] = useState<number[]>([1]);
  const toggle = (i: number) => setLiars((l) => (l.includes(i) ? l.filter((x) => x !== i) : [...l, i]));

  const res = useMemo(
    () => runRound(ST.map((s, i) => ({ name: s.name, stake: 20, price: liars.includes(i) ? base * 1.4 : base + s.jitter }))),
    [liars, base],
  );
  // Map the median onto the arm: honest prices point straight across, a corrupted median swings it up.
  const swing = Math.max(-38, Math.min(38, ((res.median - base) / base) * 100));
  const kind = res.outcome === "contested" ? "frozen" : swing > 2 ? "corrupted" : res.flaggedStake ? "slashed" : "clean";
  const label = { clean: "Price published", slashed: "Liar fined 20%", frozen: "Round frozen", corrupted: "Price corrupted" }[kind];

  return (
    <div className="machine">
      <svg viewBox="0 0 600 450" role="img" aria-label={`Round simulation: ${label}`}>
        <defs>
          <pattern id="dotgrid" width="18" height="18" patternUnits="userSpaceOnUse"><circle cx="1.5" cy="1.5" r="1.2" fill="#d6e4ef" /></pattern>
        </defs>
        <rect x="150" y="20" width="440" height="410" rx="28" fill="url(#dotgrid)" />

        {ST.map((s, i) => {
          const lie = liars.includes(i);
          const flagged = res.flagged[i];
          return (
            <g key={s.tag}>
              <path id={`w${i}`} d={wire(Y[i])} fill="none" stroke={lie ? "#ab5a4b" : "#131c22"} strokeWidth="1.6" strokeDasharray={lie ? "5 5" : undefined} />
              <circle r="5.5" fill={lie ? "#ab5a4b" : "#2978ac"} stroke="#fff" strokeWidth="2">
                <animateMotion dur="2.4s" begin={`${i * 0.35}s`} repeatCount="indefinite" keyPoints="0;1" keyTimes="0;1" calcMode="linear"><mpath href={`#w${i}`} /></animateMotion>
              </circle>
              <g className="station" onClick={() => toggle(i)} role="button" tabIndex={0} aria-pressed={lie} aria-label={`${s.name}: ${lie ? "lying" : "honest"}`}
                onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && (e.preventDefault(), toggle(i))}>
                <rect x="20" y={Y[i]} width="108" height="44" rx="10" fill={lie ? "#f6e3de" : "#fff"} stroke="#131c22" strokeWidth="1.8" />
                <rect x="30" y={Y[i] + 10} width="24" height="24" rx="6" fill={lie ? "#ab5a4b" : "#2978ac"} />
                <text x="42" y={Y[i] + 26.5} textAnchor="middle" fontSize="10.5" fontWeight="700" fill="#fff">{s.tag}</text>
                <line x1="62" x2="116" y1={Y[i] + 16} y2={Y[i] + 16} stroke="#131c22" strokeWidth="1.6" strokeLinecap="round" />
                <line x1="62" x2={lie ? 116 : 98} y1={Y[i] + 27} y2={Y[i] + 27} stroke={lie ? "#ab5a4b" : "#9fb3c2"} strokeWidth="1.6" strokeLinecap="round" />
                {flagged && <g><circle cx="128" cy={Y[i]} r="11" fill="#ab5a4b" /><text x="128" y={Y[i] + 4} textAnchor="middle" fontSize="12" fontWeight="700" fill="#fff">!</text></g>}
              </g>
            </g>
          );
        })}

        {/* the sextant: arc, scale ticks and a swinging arm that points at the median */}
        <g>
          <circle cx={CX} cy={CY} r="76" fill="#fff" stroke="#131c22" strokeWidth="2" />
          <path d={`M${CX} ${CY} L${CX + 58} ${CY - 50} A76 76 0 0 1 ${CX + 58} ${CY + 50} Z`} fill="#c9e2f6" stroke="#131c22" strokeWidth="1.6" />
          {Array.from({ length: 9 }, (_, k) => {
            const a = (-40 + k * 10) * (Math.PI / 180);
            return <line key={k} x1={CX + 62 * Math.cos(a)} y1={CY + 62 * Math.sin(a)} x2={CX + 70 * Math.cos(a)} y2={CY + 70 * Math.sin(a)} stroke="#131c22" strokeWidth="1.4" />;
          })}
          <g className="arm" style={{ transform: `rotate(${-swing}deg)`, transformOrigin: `${CX}px ${CY}px` }}>
            <line x1={CX} y1={CY} x2={CX + 92} y2={CY} stroke={kind === "corrupted" ? "#ab5a4b" : "#131c22"} strokeWidth="3" strokeLinecap="round" />
            <circle cx={CX + 92} cy={CY} r="5" fill={kind === "corrupted" ? "#ab5a4b" : "#2978ac"} />
          </g>
          <circle cx={CX} cy={CY} r="9" fill="#131c22" />
          <circle cx={CX} cy={CY} r="3.5" fill="#fff" />
        </g>

        {/* output: feed then lending */}
        <path d={`M${CX + 76} ${CY} C 450 ${CY}, 440 120, 472 120`} fill="none" stroke="#131c22" strokeWidth="1.6" strokeDasharray={kind === "frozen" ? "3 6" : undefined} />
        <path d={`M${CX + 76} ${CY} C 450 ${CY}, 440 330, 472 330`} fill="none" stroke="#131c22" strokeWidth="1.6" strokeDasharray={kind === "frozen" ? "3 6" : undefined} />
        <g>
          <rect x="472" y="92" width="112" height="56" rx="12" fill="#fff" stroke="#131c22" strokeWidth="1.8" />
          <text x="486" y="114" fontSize="11" fill="#52616c">SextantFeed</text>
          <text x="486" y="134" fontSize="15" fontWeight="700" fill={kind === "corrupted" ? "#ab5a4b" : "#131c22"} fontFamily="var(--font-mono)">
            {kind === "frozen" ? "holding" : `$${Math.round(res.median).toLocaleString()}`}
          </text>
        </g>
        <g>
          <rect x="472" y="302" width="112" height="56" rx="12" fill="#fff" stroke="#131c22" strokeWidth="1.8" />
          <text x="486" y="324" fontSize="11" fill="#52616c">MiniLend</text>
          <text x="486" y="344" fontSize="13" fontWeight="700" fill={kind === "corrupted" ? "#ab5a4b" : "#1f7a4d"}>{kind === "corrupted" ? "at risk" : "safe"}</text>
        </g>
      </svg>
      <div className={`verdict-pill ${kind}`} aria-live="polite"><i />{label}</div>
      <p className="machine-hint">Click a reporter to make it lie</p>
    </div>
  );
}
