"use client";
import { useEffect, useRef, useState } from "react";
import { corruptionCost, runRound } from "@/lib/round";

const BASE = 78_300;

/** One reporter drifts away from the others. Past 2.5% the contract fines it. */
export function LiarSlider() {
  const [pct, setPct] = useState(0.4);
  const prices = [BASE + 6, BASE * (1 + pct / 100), BASE - 9, BASE + 12, BASE - 4];
  const res = runRound(prices.map((p, i) => ({ name: String(i), stake: 20, price: p })));
  const fined = res.flagged[1];
  const lo = BASE * 0.99, hi = BASE * 1.06;
  const x = (p: number) => 4 + ((Math.min(hi, p) - lo) / (hi - lo)) * 92;
  return (
    <div className="demo">
      <div className="dline">
        <div className="dzone" style={{ left: `${x(BASE * 1.025)}%` }}><span>2.5%</span></div>
        <div className="dmed" style={{ left: `${x(res.median)}%` }} />
        {prices.map((p, i) => <span key={i} className={`ddot${i === 1 ? " me" : ""}${i === 1 && fined ? " bad" : ""}`} style={{ left: `${x(p)}%`, top: i === 1 ? 18 : 30 + (i % 2) * 14 }} />)}
      </div>
      <input type="range" min={0} max={6} step={0.1} value={pct} onChange={(e) => setPct(+e.target.value)} aria-label="How far the reporter lies" />
      <div className="dfoot">
        <span className="mono">+{pct.toFixed(1)}% off</span>
        <span className={`chip ${fined ? "bad" : "good"}`}>{fined ? "Fined 4 tPOT" : "Accepted"}</span>
      </div>
    </div>
  );
}

/** A packet leaves Solidity, gets sorted in ink!, and comes back, all inside one call. */
export function VmBridge() {
  return (
    <div className="demo bridge">
      <svg viewBox="0 0 320 170" aria-hidden="true">
        <path id="vmgo" d="M92 62 C 150 20, 170 20, 228 62" fill="none" stroke="#131c22" strokeWidth="1.6" />
        <path id="vmback" d="M228 108 C 170 150, 150 150, 92 108" fill="none" stroke="#131c22" strokeWidth="1.6" strokeDasharray="4 5" />
        <circle r="6" fill="#2978ac"><animateMotion dur="3s" repeatCount="indefinite" keyPoints="0;1;1" keyTimes="0;.45;1" calcMode="linear"><mpath href="#vmgo" /></animateMotion></circle>
        <circle r="6" fill="#ab5a4b"><animateMotion dur="3s" repeatCount="indefinite" keyPoints="0;0;1" keyTimes="0;.55;1" calcMode="linear"><mpath href="#vmback" /></animateMotion></circle>
        <rect x="12" y="44" width="80" height="82" rx="14" fill="#fff" stroke="#131c22" strokeWidth="1.8" />
        <rect x="228" y="44" width="80" height="82" rx="14" fill="#c9e2f6" stroke="#131c22" strokeWidth="1.8" />
        <text x="52" y="82" textAnchor="middle" fontSize="12" fontWeight="700">Solidity</text>
        <text x="52" y="100" textAnchor="middle" fontSize="10" fill="#52616c">Core</text>
        <text x="268" y="82" textAnchor="middle" fontSize="12" fontWeight="700">ink!</text>
        <text x="268" y="100" textAnchor="middle" fontSize="10" fill="#52616c">Math</text>
        <text x="160" y="22" textAnchor="middle" fontSize="10" fill="#52616c" fontFamily="var(--font-mono)">prices[16]</text>
        <text x="160" y="160" textAnchor="middle" fontSize="10" fill="#52616c" fontFamily="var(--font-mono)">median, outliers</text>
      </svg>
      <div className="dfoot"><span className="chip info">1 transaction</span><span className="muted mono">2 VMs</span></div>
    </div>
  );
}

const CODE = "(, int256 answer,,,) = feed.latestRoundData();";

/** Types out the one line a Solidity app needs. */
export function TypingCode({ answer }: { answer?: number }) {
  const [n, setN] = useState(0);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setN(CODE.length + 30);
    const id = setInterval(() => setN((v) => (v > CODE.length + 30 ? 0 : v + 1)), 55);
    return () => clearInterval(id);
  }, []);
  const done = n >= CODE.length;
  return (
    <div className="demo" ref={ref}>
      <div className="prompt"><span className="mono">{CODE.slice(0, n)}</span><i className="caret" /></div>
      <div className={`result mono${done ? " on" : ""}`}>answer = {answer ? Math.round(answer * 1e8).toString() : "7830750000000"}<span className="muted">  // 8 decimals</span></div>
    </div>
  );
}

/** More bonded stake raises the cost to corrupt, which raises how much MiniLend will lend. */
export function StakeToCap() {
  const [stake, setStake] = useState(96);
  const cap = corruptionCost(stake);
  return (
    <div className="demo">
      <div className="caprow"><span>Bonded</span><div className="fbar"><i style={{ width: `${(stake / 500) * 100}%`, background: "#8fb3cf" }} /></div><b className="mono">{stake}</b></div>
      <div className="caprow"><span>Debt cap</span><div className="fbar"><i style={{ width: `${(cap / 500) * 100}%`, background: "var(--primary)" }} /></div><b className="mono">{cap.toFixed(1)}</b></div>
      <input type="range" min={40} max={500} value={stake} onChange={(e) => setStake(+e.target.value)} aria-label="Bonded stake in tPOT" />
      <div className="dfoot"><span className="mono">cap = 4/9 × stake</span><span className="chip info">{cap.toFixed(0)} tPOT</span></div>
    </div>
  );
}

/** Counts up to a number once it scrolls into view. */
export function Count({ to, decimals = 0, prefix = "" }: { to?: number; decimals?: number; prefix?: string }) {
  const [v, setV] = useState(0);
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (to === undefined || !el.current) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) return setV(to);
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e.isIntersecting) return;
      io.disconnect();
      const t0 = performance.now();
      const step = (t: number) => {
        const k = Math.min(1, (t - t0) / 900);
        setV(to * (1 - Math.pow(1 - k, 3)));
        if (k < 1) raf = requestAnimationFrame(step);
      };
      raf = requestAnimationFrame(step);
    });
    io.observe(el.current);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to]);
  return <span ref={el}>{to === undefined ? "–" : prefix + v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}</span>;
}
