"use client";
import { useMemo, useState } from "react";
import { corruptionCost, runRound, type Report } from "@/lib/round";

const BASE = 77_400;
const NAMES = ["Coinbase", "Kraken", "Bitstamp", "Gemini", "Bitfinex"];
type Row = { stake: number; lie: boolean };
const PRESETS: Record<string, Row[]> = {
  "All honest": NAMES.map(() => ({ stake: 20, lie: false })),
  "One liar": NAMES.map((_, i) => ({ stake: 20, lie: i === 1 })),
  "Two collude": NAMES.map((_, i) => ({ stake: 20, lie: i < 2 })),
  "Whale attack": NAMES.map((_, i) => ({ stake: i === 0 ? 90 : 20, lie: i === 0 })),
  "Stake majority": NAMES.map((_, i) => ({ stake: i < 3 ? 40 : 10, lie: i < 3 })),
};

const jitter = [0, 12, -9, 18, -14];

export function AttackLab() {
  const [rows, setRows] = useState<Row[]>(PRESETS["One liar"]);
  const [liePct, setLiePct] = useState(50);
  const set = (i: number, r: Partial<Row>) => setRows((x) => x.map((v, j) => (j === i ? { ...v, ...r } : v)));

  // Liars report first: the attacker's best ordering.
  const reports = useMemo<(Report & { i: number; lie: boolean })[]>(
    () =>
      rows
        .map((r, i) => ({ i, lie: r.lie, name: NAMES[i], stake: r.stake, price: r.lie ? BASE * (1 + liePct / 100) : BASE + jitter[i] }))
        .sort((a, b) => Number(b.lie) - Number(a.lie)),
    [rows, liePct],
  );
  const res = runRound(reports);
  const cost = corruptionCost(res.totalStake);
  const liarStake = rows.reduce((a, r) => a + (r.lie ? r.stake : 0), 0);
  const moved = res.outcome === "published" && Math.abs(res.median - BASE) / BASE > 0.025;
  const kind = res.outcome === "open" ? "open" : res.outcome === "contested" ? "contested" : moved ? "corrupted" : "published";
  const verdict = {
    open: ["Waiting", "Round needs 3 reports and 2/3 of stake."],
    published: [res.flaggedStake ? "Price held, liar slashed" : "Price published", res.flaggedStake ? `${res.flaggedStake} tPOT flagged, 20% of it taken.` : "Every report near the median."],
    contested: ["Frozen", `${res.flaggedStake} of ${res.roundStake} tPOT disagree. No price, no slashing.`],
    corrupted: ["Price corrupted", `Attacker held ${liarStake} tPOT, over the ${cost.toFixed(1)} tPOT cost.`],
  }[kind];

  const min = Math.min(...reports.map((r) => r.price), res.median);
  const max = Math.max(...reports.map((r) => r.price), res.median);
  const x = (p: number) => (max === min ? 50 : 4 + ((p - min) / (max - min)) * 92);

  return (
    <div className="grid">
      <div className="card c7">
        <h2>Reporters</h2>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
          {Object.entries(PRESETS).map(([k, v]) => (
            <button key={k} className="toggle" onClick={() => setRows(v)}>{k}</button>
          ))}
        </div>
        {rows.map((r, i) => (
          <div className="rep" key={NAMES[i]}>
            <span>{NAMES[i]}</span>
            <input aria-label={`${NAMES[i]} stake`} type="range" min={10} max={100} value={r.stake} onChange={(e) => set(i, { stake: +e.target.value })} />
            <span className="mono">{r.stake}</span>
            <button className="toggle" aria-pressed={r.lie} onClick={() => set(i, { lie: !r.lie })}>{r.lie ? "Lying" : "Honest"}</button>
          </div>
        ))}
        <div className="rep">
          <span>Lie size</span>
          <input aria-label="Lie size" type="range" min={5} max={200} value={liePct} onChange={(e) => setLiePct(+e.target.value)} />
          <span className="mono">+{liePct}%</span>
          <span />
        </div>
      </div>

      <div className="card c5" style={{ display: "grid", gap: 16, alignContent: "start" }}>
        <div className={`verdict ${kind}`} aria-live="polite">
          <b>{verdict[0]}</b>
          <span>{verdict[1]}</span>
        </div>
        <div>
          <h2>Attacker stake vs corruption cost</h2>
          <div className="bar"><i style={{ width: "100%", transform: `scaleX(${Math.min(1, liarStake / Math.max(cost, 1))})`, background: liarStake >= cost ? "var(--accent)" : "var(--primary)" }} /></div>
          <p className="mono muted" style={{ fontSize: 13, marginTop: 6 }}>{liarStake} / {cost.toFixed(1)} tPOT</p>
        </div>
        <div>
          <h2>Flagged stake vs 1/3 freeze line</h2>
          <div className="bar"><i style={{ width: "100%", transform: `scaleX(${Math.min(1, (res.flaggedStake * 3) / Math.max(res.roundStake, 1))})`, background: "var(--warn)" }} /></div>
          <p className="mono muted" style={{ fontSize: 13, marginTop: 6 }}>{res.flaggedStake} / {(res.roundStake / 3).toFixed(1)} tPOT</p>
        </div>
      </div>

      <div className="card c12">
        <h2>The round: dot size is stake, black line is the stake-weighted median</h2>
        <div className="line">
          <div className="medianMark" style={{ left: `${x(res.median)}%` }} />
          {reports.map((r, n) => {
            const size = 12 + r.stake / 2.5;
            const counted = n < res.closedAfter;
            return <div key={r.name} className="dot" title={r.name} style={{ left: `${x(r.price)}%`, width: size, height: size, opacity: counted ? 0.85 : 0.25, background: res.flagged[n] ? "var(--accent)" : "var(--primary)" }} />;
          })}
        </div>
        <p className="mono muted" style={{ fontSize: 13 }}>Median ${Math.round(res.median).toLocaleString()} · round closed after {res.closedAfter} of 5 reports · liars report first</p>
      </div>
    </div>
  );
}
