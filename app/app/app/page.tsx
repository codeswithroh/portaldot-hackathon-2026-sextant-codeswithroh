"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import gsap from "gsap";
import { Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { AttackLab } from "@/components/AttackLab";
import { Mark } from "@/components/Mark";
import { addresses } from "@/lib/chain";
import { useSextant, type Live } from "@/lib/useSextant";

const TABS = ["Overview", "Attack Lab", "Reporters", "Lending", "Contracts"] as const;
type Tab = (typeof TABS)[number];

const n = (v?: number, d = 1) => (v === undefined ? "-" : v.toLocaleString(undefined, { maximumFractionDigits: d }));
const STALL = 120;

function ChainChip({ s }: { s: Live }) {
  if (s.loading) return <span className="chip off">Connecting</span>;
  if (s.error || !s.head) return <span className="chip bad">Node unreachable</span>;
  if (s.head.age > STALL) return <span className="chip warn">Testnet halted at #{s.head.number.toString()}</span>;
  return <span className="chip good">Block #{s.head.number.toString()}</span>;
}

function Stat({ title, value, unit, hero, loading }: { title: string; value: string; unit?: string; hero?: boolean; loading?: boolean }) {
  return (
    <div className={`card c3${hero ? " hero" : ""}`}>
      <h2>{title}</h2>
      {loading ? <div className="skeleton" /> : <div className="stat mono">{value} {unit && <small>{unit}</small>}</div>}
    </div>
  );
}

function NotDeployed() {
  return <div className="card c12 empty"><strong>Contracts not on testnet yet</strong><span>Open the Attack Lab to run the round rules now.</span></div>;
}

function Overview({ s }: { s: Live }) {
  const deployed = !!addresses.SextantCore;
  return (
    <div className="grid">
      <Stat title="Cost to corrupt" value={n(s.cost)} unit="tPOT" hero loading={s.loading} />
      <Stat title="BTC / USD" value={s.price ? `$${n(s.price, 0)}` : "-"} loading={s.loading} />
      <Stat title="Active stake" value={n(s.stake)} unit="tPOT" loading={s.loading} />
      <Stat title="Rounds" value={String(s.rounds.length)} loading={s.loading} />
      {!deployed && !s.loading ? <NotDeployed /> : (
        <>
          <div className="card c8">
            <h2>Published price</h2>
            {s.rounds.length === 0 ? <div className="empty">No rounds yet</div> : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={s.rounds}>
                  <XAxis dataKey="round" tickLine={false} axisLine={false} fontSize={12} />
                  <YAxis domain={["auto", "auto"]} tickLine={false} axisLine={false} fontSize={12} width={64} />
                  <Tooltip />
                  <Area dataKey="price" stroke="#2978ac" fill="#c9e2f6" strokeWidth={2} isAnimationActive={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div className="card c4">
            <h2>Incidents</h2>
            {s.incidents.length === 0 ? <div className="empty">None</div> : s.incidents.slice(0, 6).map((e) => (
              <p key={e.tx + e.detail} style={{ fontSize: 14, padding: "8px 0", borderTop: "1px solid var(--surface)" }}>
                <span className={`chip ${e.kind === "slashed" ? "bad" : "warn"}`}>{e.kind === "slashed" ? "Slashed" : "Frozen"} · #{e.round}</span>
                <br />{e.detail}
              </p>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function Reporters({ s }: { s: Live }) {
  if (!addresses.SextantCore) return <div className="grid"><NotDeployed /></div>;
  const total = s.stake || 1;
  return (
    <div className="card scroll">
      <table className="table">
        <thead><tr><th>Reporter</th><th>Status</th><th>Bond</th><th>Share</th><th>Accepted</th><th>Strikes</th><th>Earned</th></tr></thead>
        <tbody>
          {s.reporters.map((r) => (
            <tr key={r.address}>
              <td className="mono">{r.address.slice(0, 10)}</td>
              <td><span className={`chip ${r.active ? "good" : "off"}`}>{r.active ? "Active" : "Out"}</span></td>
              <td className="mono">{n(r.bond)}</td>
              <td style={{ minWidth: 100 }}><div className="bar"><i style={{ width: "100%", transform: `scaleX(${r.active ? r.bond / total : 0})` }} /></div></td>
              <td className="mono">{r.accepted}</td>
              <td className="mono">{r.strikes}</td>
              <td className="mono">{n(r.earned, 2)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Lending({ s }: { s: Live }) {
  if (!addresses.MiniLend) return <div className="grid"><NotDeployed /></div>;
  const used = s.cost ? (s.debt ?? 0) / s.cost : 0;
  return (
    <div className="grid">
      <Stat title="Debt cap" value={n(s.cost)} unit="tPOT" hero />
      <Stat title="Total debt" value={n(s.debt)} unit="tPOT" />
      <Stat title="Room left" value={n(s.room)} unit="tPOT" />
      <Stat title="Cap used" value={`${Math.round(used * 100)}%`} />
      <div className="card c12">
        <h2>Debt against corruption cost</h2>
        <div className="bar"><i style={{ width: "100%", transform: `scaleX(${Math.min(1, used)})` }} /></div>
      </div>
    </div>
  );
}

function Contracts() {
  const rows = Object.entries(addresses);
  return (
    <div className="card scroll">
      {rows.length === 0 ? <div className="empty">Not deployed</div> : (
        <table className="table">
          <thead><tr><th>Contract</th><th>VM</th><th>Address</th><th>Deploy tx</th></tr></thead>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td>{k}</td>
                <td><span className={`chip ${k === "SextantMath" ? "bad" : "info"}`}>{k === "SextantMath" ? "ink! / Rust" : "Solidity"}</span></td>
                <td className="mono">{v!.address}</td>
                <td className="mono">{v!.tx.slice(0, 14)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [tab, setTab] = useState<Tab>("Overview");
  const s = useSextant();
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!panel.current || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    gsap.fromTo(panel.current.querySelectorAll(".card"), { opacity: 0, y: 8 }, { opacity: 1, y: 0, duration: 0.22, stagger: 0.03, ease: "power2.out", clearProps: "all" });
  }, [tab]);

  return (
    <div className="shell">
      <aside className="side">
        <Link href="/" className="brand"><Mark /> Sextant</Link>
        {TABS.map((t) => (
          <button key={t} className="nav" aria-current={t === tab ? "page" : undefined} onClick={() => setTab(t)}>{t}</button>
        ))}
      </aside>
      <main className="main">
        <div className="top"><h1>{tab}</h1><ChainChip s={s} /></div>
        {s.head && s.head.age > STALL && <div className="banner">No new blocks for {Math.round(s.head.age / 60)} min. Figures below are from the last block.</div>}
        <div ref={panel}>
          {tab === "Overview" && <Overview s={s} />}
          {tab === "Attack Lab" && <AttackLab />}
          {tab === "Reporters" && <Reporters s={s} />}
          {tab === "Lending" && <Lending s={s} />}
          {tab === "Contracts" && <Contracts />}
        </div>
      </main>
    </div>
  );
}
