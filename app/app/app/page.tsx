"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ReferenceDot, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AttackLab } from "@/components/AttackLab";
import { Mark } from "@/components/Mark";
import { Icon } from "@/components/dash/Icon";
import { Avatar, Donut, Gauge, Progress, Segments, Spark } from "@/components/dash/viz";
import { addresses, REPO } from "@/lib/chain";
import { useSextant, type Activity, type Live } from "@/lib/useSextant";

const NAV = [
  { group: "Feed", items: [["Overview", "grid"], ["Rounds", "rounds"], ["Reporters", "users"]] },
  { group: "Use", items: [["Lending", "bank"]] },
  { group: "Test", items: [["Attack Lab", "bolt"]] },
  { group: "Build", items: [["Contracts", "code"]] },
] as const;
type Tab = (typeof NAV)[number]["items"][number][0];

const STALL = 120;
const STALE = 15 * 60; // MiniLend rejects prices older than this
const OUT = { published: "var(--good)", slashed: "var(--accent)", frozen: "var(--warn)" } as const;

const n = (v?: number, d = 1) => (v === undefined ? "–" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
const usd = (v?: number, d = 0) => (v === undefined ? "–" : `$${v.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d })}`);
const ago = (t: number) => {
  const s = Math.max(0, Math.floor(Date.now() / 1000 - t));
  return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.floor(s / 60)}m ago` : s < 86400 ? `${Math.floor(s / 3600)}h ago` : `${Math.floor(s / 86400)}d ago`;
};
const short = (a: string) => `${a.slice(0, 6)}…${a.slice(-4)}`;

function ChainChip({ s }: { s: Live }) {
  if (s.loading) return <span className="chip off"><i className="pulse" />Connecting</span>;
  if (s.error || !s.head) return <span className="chip bad">Node unreachable</span>;
  if (s.head.age > STALL) return <span className="chip warn">Halted at #{s.head.number.toString()}</span>;
  return <span className="chip good"><i className="pulse" />#{s.head.number.toString()}</span>;
}

function Card({ title, icon, className = "", right, children }: { title?: string; icon?: string; className?: string; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <section className={`card ${className}`}>
      {title && <header className="card-h">{icon && <span className="ic"><Icon name={icon} size={16} /></span>}<h2>{title}</h2>{right && <div className="card-r">{right}</div>}</header>}
      {children}
    </section>
  );
}

function Kpi({ title, value, unit, hero, foot, children, loading }: { title: string; value: string; unit?: string; hero?: boolean; foot?: React.ReactNode; children?: React.ReactNode; loading?: boolean }) {
  return (
    <section className={`card kpi c3${hero ? " hero" : ""}`}>
      <h2>{title}</h2>
      <div className="kpi-row">
        {loading ? <div className="skeleton" /> : <div className="stat mono">{value}{unit && <small> {unit}</small>}</div>}
        {children}
      </div>
      {foot && <div className="kpi-foot">{foot}</div>}
    </section>
  );
}

function Empty({ icon = "layers", text }: { icon?: string; text: string }) {
  return <div className="empty"><span className="ic big"><Icon name={icon} size={22} /></span>{text}</div>;
}

const ACT: Record<Activity["kind"], { icon: string; tone: string; title: (a: Activity) => string; sub: (a: Activity) => string }> = {
  published: { icon: "check", tone: "good", title: (a) => `Round ${a.round} published`, sub: (a) => `${usd(a.price, 2)} · spread ${usd(a.mad, 2)}` },
  slashed: { icon: "slash", tone: "bad", title: (a) => `${a.who} slashed`, sub: (a) => `−${n(a.amount)} tPOT for ${usd(a.price)}` },
  frozen: { icon: "pause", tone: "warn", title: (a) => `Round ${a.round} frozen`, sub: (a) => `${n(a.flagged, 0)}/${n(a.roundStake, 0)} tPOT disagreed` },
  submitted: { icon: "send", tone: "info", title: (a) => `${a.who} reported`, sub: (a) => usd(a.price, 2) },
};

function Timeline({ items, limit = 9 }: { items: Activity[]; limit?: number }) {
  if (!items.length) return <Empty icon="clock" text="No activity yet" />;
  return (
    <ol className="timeline">
      {items.slice(0, limit).map((a, i) => {
        const m = ACT[a.kind];
        return (
          <li key={a.tx + a.kind + i}>
            <span className={`tl-ic ${m.tone}`}><Icon name={m.icon} size={14} /></span>
            <div><b>{m.title(a)}</b><span>{m.sub(a)}</span></div>
            <time>{ago(a.time)}</time>
          </li>
        );
      })}
    </ol>
  );
}

/** Each reporter's last report in a round against the published median. */
/** Give each pin a lane (0, -1, 1, -2, 2…) so pins with close prices stack instead of overlapping. */
function swarm(xs: number[], gap = 9) {
  const lanes = new Array<number>(xs.length);
  const taken: { x: number; lane: number }[] = [];
  xs.map((x, i) => ({ x, i })).sort((a, b) => a.x - b.x).forEach(({ x, i }) => {
    for (let k = 0; ; k++) {
      const lane = k % 2 ? -Math.ceil(k / 2) : k / 2;
      if (!taken.some((t) => t.lane === lane && Math.abs(t.x - x) < gap)) { lanes[i] = lane; taken.push({ x, lane }); break; }
    }
  });
  return lanes;
}

function RoundAnatomy({ s, round }: { s: Live; round?: number }) {
  const r = round ?? s.rounds.at(-1)?.round;
  const pub = s.rounds.filter((x) => x.round === r).at(-1);
  // A frozen attempt reuses the round id, so only count submits after the previous attempt closed.
  const prev = s.attempts.filter((a) => pub && a.block < pub.block).at(-1)?.block ?? 0;
  const subs = s.submissions.filter((x) => x.round === r && pub && x.block > prev && x.block <= pub.block);
  if (!subs.length || !pub) return <Empty text="Waiting for a round" />;
  const prices = subs.map((x) => x.price).concat(pub.price);
  // Keep at least ±0.5% of view so normal exchange spread doesn't look like an attack.
  const lo = Math.min(...prices, pub.price * 0.995), hi = Math.max(...prices, pub.price * 1.005);
  const x = (p: number) => (hi === lo ? 50 : 6 + ((p - lo) / (hi - lo)) * 88);
  const rep = new Map(s.reporters.map((v) => [v.address.toLowerCase(), v]));
  return (
    <div className="anatomy">
      <div className="track">
        <div className="median" style={{ left: `${x(pub.price)}%` }}><span>{usd(pub.price)}</span></div>
        {swarm(subs.map((v) => x(v.price))).map((lane, i) => {
          const v = subs[i];
          const who = rep.get(v.reporter.toLowerCase());
          const far = Math.abs(v.price - pub.price) / pub.price > 0.025;
          return <div key={i} className={`pin${far ? " far" : ""}`} title={`${who?.name}: ${usd(v.price, 2)}`} style={{ left: `${x(v.price)}%`, background: far ? "var(--accent)" : who?.color, top: 58 + lane * 32 }}>{who?.name.slice(0, 2)}</div>;
        })}
      </div>
      <div className="legend"><span><i style={{ background: "var(--text)" }} />Median</span><span><i style={{ background: "var(--accent)" }} />Over 2.5% off</span><span className="mono">Round {r}</span></div>
    </div>
  );
}

function PriceChart({ s, height = 250 }: { s: Live; height?: number }) {
  const slashed = new Set(s.attempts.filter((a) => a.outcome === "slashed").map((a) => a.round));
  if (!s.rounds.length) return <Empty text="No rounds yet" />;
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={s.rounds} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
        <defs><linearGradient id="pf" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2978ac" stopOpacity=".25" /><stop offset="1" stopColor="#2978ac" stopOpacity="0" /></linearGradient></defs>
        <CartesianGrid stroke="#e6eef5" vertical={false} />
        <XAxis dataKey="round" tickLine={false} axisLine={false} fontSize={12} tickFormatter={(v) => `R${v}`} />
        <YAxis domain={["auto", "auto"]} tickLine={false} axisLine={false} fontSize={12} width={70} tickFormatter={(v) => `$${Math.round(v).toLocaleString()}`} />
        <Tooltip contentStyle={{ borderRadius: 10, border: "1px solid #d6dee4", fontSize: 13 }} formatter={(v: number) => [usd(v, 2), "Price"]} labelFormatter={(v) => `Round ${v}`} />
        <Area type="monotone" dataKey="price" stroke="#2978ac" fill="url(#pf)" strokeWidth={2.5} isAnimationActive={false} />
        {s.rounds.filter((r) => slashed.has(r.round)).map((r) => <ReferenceDot key={r.round} x={r.round} y={r.price} r={6} fill="#ab5a4b" stroke="#fff" strokeWidth={2} />)}
      </AreaChart>
    </ResponsiveContainer>
  );
}

function Freshness({ s }: { s: Live }) {
  const age = s.updatedAt ? Math.max(0, Math.floor(Date.now() / 1000) - s.updatedAt) : undefined;
  if (age === undefined) return <Empty icon="clock" text="No price yet" />;
  const stale = age > STALE;
  const label = age < 60 ? `${age}s` : age < 3600 ? `${Math.floor(age / 60)}m` : `${Math.floor(age / 3600)}h`;
  return (
    <>
      <Gauge value={Math.min(age, STALE)} max={STALE} label={label} sub="since last price" tone={stale ? "var(--accent)" : "var(--primary)"} />
      <div className="gauge-foot"><span className={`chip ${stale ? "bad" : "good"}`}>{stale ? "Stale for lending" : "Fresh"}</span><span className="muted mono">limit 15m</span></div>
    </>
  );
}

function Outcomes({ s }: { s: Live }) {
  const c = { published: 0, slashed: 0, frozen: 0 };
  for (const a of s.attempts) c[a.outcome]++;
  return (
    <>
      <Segments parts={[{ value: c.published, color: OUT.published, label: "Clean" }, { value: c.slashed, color: OUT.slashed, label: "Liar slashed" }, { value: c.frozen, color: OUT.frozen, label: "Frozen" }]} />
      <div className="legend"><span><i style={{ background: OUT.published }} />{c.published} clean</span><span><i style={{ background: OUT.slashed }} />{c.slashed} slashed</span><span><i style={{ background: OUT.frozen }} />{c.frozen} frozen</span></div>
    </>
  );
}

function ReporterTable({ s }: { s: Live }) {
  if (!s.reporters.length) return <Empty icon="users" text="No reporters yet" />;
  const max = Math.max(...s.reporters.map((r) => r.bond), 1);
  return (
    <div className="scroll">
      <table className="table">
        <thead><tr><th>Reporter</th><th>Status</th><th>Bond</th><th>Accepted</th><th>Strikes</th><th>Earned</th><th>Last report</th></tr></thead>
        <tbody>
          {s.reporters.map((r) => (
            <tr key={r.address}>
              <td><div className="who"><Avatar name={r.name} color={r.color} size={30} /><div><b>{r.name}</b><span className="mono">{short(r.address)}</span></div></div></td>
              <td><span className={`chip ${r.active ? "good" : "off"}`}>{r.active ? "Active" : "Out"}</span></td>
              <td style={{ minWidth: 140 }}><div className="bondcell"><Progress value={r.bond / max} color={r.strikes ? "var(--accent)" : r.color} /><span className="mono">{n(r.bond)}</span></div></td>
              <td className="mono">{r.accepted}</td>
              <td>{r.strikes ? <span className="chip bad">{r.strikes}</span> : <span className="chip off">0</span>}</td>
              <td className="mono">{n(r.earned, 2)}</td>
              <td className="mono">{usd(r.lastPrice, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Overview({ s, go }: { s: Live; go: (t: Tab) => void }) {
  const prices = s.rounds.map((r) => r.price);
  const delta = prices.length > 1 ? ((prices.at(-1)! - prices.at(-2)!) / prices.at(-2)!) * 100 : undefined;
  return (
    <div className="grid">
      <Kpi title="Cost to corrupt" value={n(s.cost)} unit="tPOT" hero loading={s.loading}
        foot={<><span className="ic light"><Icon name="shield" size={14} /></span>4/9 of {n(s.stake, 0)} tPOT bonded</>} />
      <Kpi title="BTC / USD" value={usd(s.price)} loading={s.loading}
        foot={delta !== undefined && <span className={`delta ${delta >= 0 ? "up" : "down"}`}>{delta >= 0 ? "▲" : "▼"} {Math.abs(delta).toFixed(2)}%<em> vs last round</em></span>}>
        <Spark data={prices} />
      </Kpi>
      <Kpi title="Bonded stake" value={n(s.stake, 0)} unit="tPOT" loading={s.loading}
        foot={<div className="dots">{s.reporters.map((r) => <i key={r.address} title={r.name} style={{ background: r.color }} />)}<span>{s.reporters.filter((r) => r.active).length} reporters</span></div>}>
        <Donut parts={s.reporters.map((r) => ({ value: r.bond, color: r.color }))} size={64} stroke={10} />
      </Kpi>
      <Kpi title="Rounds" value={String(s.rounds.length)} loading={s.loading} foot={<Outcomes s={s} />} />

      <Card title="Published price" icon="coin" className="c8" right={<span className="chip off mono">{s.rounds.length} rounds</span>}><PriceChart s={s} /></Card>
      <Card title="Live activity" icon="clock" className="c4 rail" right={<button className="link" onClick={() => go("Rounds")}>All</button>}><Timeline items={s.activity} /></Card>

      <Card title="Feed freshness" icon="clock" className="c4"><Freshness s={s} /></Card>
      <Card title="Latest round" icon="rounds" className="c4"><RoundAnatomy s={s} /></Card>

      <Card title="Reporters" icon="users" className="c12" right={<button className="link" onClick={() => go("Reporters")}>Details</button>}><ReporterTable s={s} /></Card>
    </div>
  );
}

function Rounds({ s }: { s: Live }) {
  const [pick, setPick] = useState<number>();
  const chosen = pick ?? s.rounds.at(-1)?.round;
  const perRound = s.rounds.map((r) => ({ round: `R${r.round}`, clean: r.reports - r.outliers, outliers: r.outliers }));
  return (
    <div className="grid">
      <Card title="Every round attempt" icon="grid" className="c8" right={<div className="legend"><span><i style={{ background: OUT.published }} />Clean</span><span><i style={{ background: OUT.slashed }} />Slashed</span><span><i style={{ background: OUT.frozen }} />Frozen</span></div>}>
        {!s.attempts.length ? <Empty text="No rounds yet" /> : (
          <div className="heat">
            {s.attempts.map((a, i) => (
              <button key={i} className={`cell ${a.outcome}${a.round === chosen && a.outcome !== "frozen" ? " on" : ""}`} onClick={() => a.outcome !== "frozen" && setPick(a.round)} title={`Round ${a.round}: ${a.outcome}`}>
                <b>{a.round}</b><Icon name={a.outcome === "frozen" ? "pause" : a.outcome === "slashed" ? "slash" : "check"} size={14} />
              </button>
            ))}
          </div>
        )}
      </Card>
      <Card title="Reports per round" icon="rounds" className="c4">
        {!perRound.length ? <Empty text="No rounds yet" /> : (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={perRound} margin={{ top: 6, right: 0, left: -24, bottom: 0 }}>
              <CartesianGrid stroke="#e6eef5" vertical={false} />
              <XAxis dataKey="round" tickLine={false} axisLine={false} fontSize={12} />
              <YAxis allowDecimals={false} tickLine={false} axisLine={false} fontSize={12} />
              <Tooltip cursor={{ fill: "#f0f8ff" }} contentStyle={{ borderRadius: 10, fontSize: 13 }} />
              <Bar dataKey="clean" stackId="a" fill="#2978ac" radius={[0, 0, 4, 4]} isAnimationActive={false} />
              <Bar dataKey="outliers" stackId="a" fill="#ab5a4b" radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </Card>
      <Card title="Round anatomy" icon="rounds" className="c8"><RoundAnatomy s={s} round={chosen} /></Card>
      <Card title="Spread (MAD)" icon="coin" className="c4">
        {!s.rounds.length ? <Empty text="No rounds yet" /> : (
          <div className="madlist">{s.rounds.map((r) => (
            <div key={r.tx}><span className="mono">R{r.round}</span><Progress value={r.mad / Math.max(...s.rounds.map((x) => x.mad), 1)} /><span className="mono">{usd(r.mad, 2)}</span></div>
          ))}</div>
        )}
      </Card>
      <Card title="Round log" icon="layers" className="c12">
        {!s.rounds.length ? <Empty text="No rounds yet" /> : (
          <div className="scroll"><table className="table">
            <thead><tr><th>Round</th><th>Outcome</th><th>Price</th><th>Reports</th><th>Outliers</th><th>When</th><th>Tx</th></tr></thead>
            <tbody>{s.attempts.slice().reverse().map((a, i) => {
              const r = a.outcome === "frozen" ? undefined : s.rounds.find((x) => x.round === a.round);
              return (
                <tr key={i}>
                  <td className="mono">R{a.round}</td>
                  <td><span className={`chip ${a.outcome === "published" ? "good" : a.outcome === "slashed" ? "bad" : "warn"}`}>{a.outcome === "published" ? "Clean" : a.outcome === "slashed" ? "Liar slashed" : "Frozen"}</span></td>
                  <td className="mono">{r ? usd(r.price, 2) : "–"}</td>
                  <td>{r ? <div className="pips">{Array.from({ length: r.reports }, (_, k) => <i key={k} className={k >= r.reports - r.outliers ? "bad" : ""} />)}</div> : "–"}</td>
                  <td className="mono">{r?.outliers ?? "–"}</td>
                  <td className="muted">{ago(a.time)}</td>
                  <td className="mono muted">{r ? short(r.tx) : short(s.activity.find((x) => x.kind === "frozen" && x.block === a.block)?.tx ?? "")}</td>
                </tr>
              );
            })}</tbody>
          </table></div>
        )}
      </Card>
    </div>
  );
}

function Reporters({ s }: { s: Live }) {
  if (!s.reporters.length) return <div className="grid"><Card className="c12"><Empty icon="users" text="No reporters yet" /></Card></div>;
  const total = s.stake || 1;
  return (
    <div className="grid">
      {s.reporters.map((r) => {
        const delta = r.lastPrice && s.price ? ((r.lastPrice - s.price) / s.price) * 100 : undefined;
        return (
          <section key={r.address} className="card c4 rep-card">
            <div className="rep-top">
              <Avatar name={r.name} color={r.color} size={42} />
              <div><b>{r.name}</b><span className="mono muted">{short(r.address)}</span></div>
              <span className={`chip ${!r.active ? "off" : r.strikes ? "bad" : "good"}`}>{!r.active ? "Out" : r.strikes ? `${r.strikes} strike` : "Clean"}</span>
            </div>
            <div className="rep-mid">
              <Donut parts={[{ value: r.bond, color: r.color }, { value: Math.max(0, total - r.bond), color: "transparent" }]} size={88} stroke={10}>
                <b className="mono">{Math.round((r.bond / total) * 100)}%</b><span>of stake</span>
              </Donut>
              <dl>
                <div><dt>Bond</dt><dd className="mono">{n(r.bond)}</dd></div>
                <div><dt>Accepted</dt><dd className="mono">{r.accepted}</dd></div>
                <div><dt>Earned</dt><dd className="mono">{n(r.earned, 2)}</dd></div>
              </dl>
            </div>
            <div className="rep-foot">
              <span className="muted">Last</span><b className="mono">{usd(r.lastPrice, 2)}</b>
              {delta !== undefined && <span className={`chip ${Math.abs(delta) > 2.5 ? "bad" : "off"} mono`}>{delta >= 0 ? "+" : ""}{delta.toFixed(2)}%</span>}
            </div>
          </section>
        );
      })}
      <Card title="Stake split" icon="layers" className="c4">
        <Segments height={14} parts={s.reporters.map((r) => ({ value: r.bond, color: r.color, label: r.name }))} />
        <div className="madlist" style={{ marginTop: 16 }}>{s.reporters.map((r) => (
          <div key={r.address}><span><i className="sw" style={{ background: r.color }} />{r.name}</span><Progress value={r.bond / total} color={r.color} /><span className="mono">{n(r.bond)}</span></div>
        ))}</div>
      </Card>
    </div>
  );
}

function Lending({ s }: { s: Live }) {
  if (!addresses.MiniLend) return <div className="grid"><Card className="c12"><Empty icon="bank" text="MiniLend not deployed" /></Card></div>;
  const cap = s.cost ?? 0;
  const used = cap ? (s.debt ?? 0) / cap : 0;
  const rows = [
    { k: "Bonded stake", v: s.stake ?? 0, c: "#8fb3cf" },
    { k: "Cost to corrupt", v: cap, c: "var(--primary)" },
    { k: "Debt cap", v: cap, c: "var(--primary)" },
    { k: "Borrowed", v: s.debt ?? 0, c: "var(--accent)" },
  ];
  const top = Math.max(...rows.map((r) => r.v), 1);
  return (
    <div className="grid">
      <Card title="Cap used" icon="bank" className="c4">
        <Gauge value={used} max={1} label={`${Math.round(used * 100)}%`} sub={`${n(s.debt)} of ${n(cap)} tPOT`} tone={used > 0.8 ? "var(--accent)" : "var(--primary)"} />
      </Card>
      <Card title="Security budget" icon="shield" className="c8">
        <div className="funnel">{rows.map((r) => (
          <div key={r.k}><span>{r.k}</span><div className="fbar"><i style={{ width: `${(r.v / top) * 100}%`, background: r.c }} /></div><b className="mono">{n(r.v)}</b></div>
        ))}</div>
        <p className="caption">Borrowing can never exceed what it costs to fake the price.</p>
      </Card>
      <Kpi title="Room left" value={n(s.room)} unit="tPOT" hero />
      <Kpi title="Pool liquidity" value={n(s.liquidity)} unit="tPOT" />
      <Kpi title="BTC price used" value={usd(s.price)} />
      <Kpi title="Max LTV" value="50%" foot={<span className="muted">liquidation at 75%</span>} />
    </div>
  );
}

function CopyBtn({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  return <button className="iconbtn" aria-label="Copy address" onClick={() => { navigator.clipboard?.writeText(text); setOk(true); setTimeout(() => setOk(false), 1200); }}><Icon name={ok ? "check" : "copy"} size={14} /></button>;
}

function Contracts({ s }: { s: Live }) {
  const node = (k: keyof typeof addresses, vm: "Solidity" | "ink!", note: string) => {
    const v = addresses[k];
    return (
      <div className={`fnode ${vm === "ink!" ? "rust" : "sol"}`}>
        <span className={`chip ${vm === "ink!" ? "bad" : "info"}`}>{vm}</span>
        <b>{k}</b><span className="muted">{note}</span>
        {v ? <div className="addr"><span className="mono">{short(v.address)}</span><CopyBtn text={v.address} /></div> : <span className="chip off">Not deployed</span>}
      </div>
    );
  };
  const calls = s.attempts.length;
  return (
    <div className="grid">
      <Card title="How a price moves" icon="layers" className="c12">
        <div className="flowmap">
          <div className="fnode off"><span className="chip off">Off-chain</span><b>5 reporters</b><span className="muted">CEX prices</span><div className="avs">{s.reporters.map((r) => <Avatar key={r.address} name={r.name} color={r.color} size={24} />)}</div></div>
          <span className="farrow"><Icon name="arrow" /></span>
          {node("SextantCore", "Solidity", "bonds · rounds · slashing")}
          <span className="farrow"><Icon name="swap" /></span>
          {node("SextantMath", "ink!", "median · outliers")}
          <span className="farrow"><Icon name="arrow" /></span>
          {node("SextantFeed", "Solidity", "Chainlink interface")}
          <span className="farrow"><Icon name="arrow" /></span>
          {node("MiniLend", "Solidity", "debt cap")}
        </div>
      </Card>
      <Kpi title="Cross-VM calls" value={String(calls)} hero foot={<>Solidity → ink! inside one tx</>} />
      <Kpi title="ink! code" value="10.4" unit="KB" />
      <Kpi title="Core code" value="8.6" unit="KB" />
      <Kpi title="Chain" value="420420777" foot={<span className="muted">PortaldotV3 testnet</span>} />
      <Card title="Deployments" icon="code" className="c12" right={<a className="link" href={REPO} target="_blank" rel="noreferrer">Source <Icon name="ext" size={12} /></a>}>
        <div className="scroll"><table className="table">
          <thead><tr><th>Contract</th><th>VM</th><th>Address</th><th>Deploy tx</th></tr></thead>
          <tbody>{Object.entries(addresses).map(([k, v]) => (
            <tr key={k}>
              <td><b>{k}</b></td>
              <td><span className={`chip ${k === "SextantMath" ? "bad" : "info"}`}>{k === "SextantMath" ? "ink!" : "Solidity"}</span></td>
              <td><div className="addr"><span className="mono">{v!.address}</span><CopyBtn text={v!.address} /></div></td>
              <td className="mono muted">{short(v!.tx)}</td>
            </tr>
          ))}</tbody>
        </table></div>
      </Card>
    </div>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("Overview");
  const s = useSextant();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const h = decodeURIComponent(location.hash.slice(1));
    if (NAV.some((g) => g.items.some(([t]) => t === h))) setTab(h as Tab);
  }, []);
  const go = (t: Tab) => { setTab(t); history.replaceState(null, "", `#${t}`); };

  useEffect(() => {
    if (!panel.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(panel.current.querySelectorAll(".card"), { opacity: 0, y: 10 }, { opacity: 1, y: 0, duration: 0.3, stagger: 0.035, ease: "power2.out", clearProps: "all" });
  }, [tab]);

  const icon = useMemo(() => Object.fromEntries(NAV.flatMap((g) => g.items.map(([t, i]) => [t, i]))), []);

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/" className="brand"><Mark size={28} /><span>Sextant</span></Link>
        <nav>
          {NAV.map((g) => (
            <div key={g.group} className="navgroup">
              <span className="navlabel">{g.group}</span>
              {g.items.map(([t, i]) => (
                <button key={t} className="nav" aria-current={t === tab ? "page" : undefined} onClick={() => go(t)}><Icon name={i} />{t}</button>
              ))}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          <div className="netcard"><span className="muted">Network</span><b>PortaldotV3</b><ChainChip s={s} /></div>
          <a className="nav" href={REPO} target="_blank" rel="noreferrer"><Icon name="github" />Source</a>
        </div>
      </aside>
      <main className="main">
        <div className="top">
          <div className="crumb"><span className="ic"><Icon name={icon[tab]} size={16} /></span><span className="muted">Sextant</span><span className="muted">/</span><h1>{tab}</h1></div>
          <div className="top-r">
            <span className="feedpill"><i />BTC / USD</span>
            <ChainChip s={s} />
            {tab !== "Attack Lab" && <button className="btn sm" onClick={() => go("Attack Lab")}><Icon name="bolt" size={15} />Try an attack</button>}
          </div>
        </div>
        {s.head && s.head.age > STALL && <div className="banner"><Icon name="pause" size={16} />No new blocks for {Math.round(s.head.age / 60)} min. Showing the last block.</div>}
        {s.error && <div className="banner bad">Can't reach the testnet node. Retrying every 12s.</div>}
        <div ref={panel}>
          {tab === "Overview" && <Overview s={s} go={go} />}
          {tab === "Rounds" && <Rounds s={s} />}
          {tab === "Reporters" && <Reporters s={s} />}
          {tab === "Lending" && <Lending s={s} />}
          {tab === "Attack Lab" && <AttackLab />}
          {tab === "Contracts" && <Contracts s={s} />}
        </div>
      </main>
    </div>
  );
}
