"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Mark } from "./Mark";

const CASES = [
  { chip: "good", tag: "1 of 5 lies", head: "Price holds", body: "The stake-weighted median ignores the liar, who loses 20% of their bond.", dots: [0, 0, 0, 0, 1] },
  { chip: "warn", tag: "2 of 5 collude", head: "Feed freezes", body: "Over 1/3 of the round disagrees. Nothing is published and no honest reporter is slashed.", dots: [0, 0, 0, 1, 1] },
  { chip: "bad", tag: "4/9 of all stake", head: "That is the price", body: "This much bonded capital can force a false price. The contract publishes the number.", dots: [0, 0, 1, 1, 1] },
];

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        gsap.timeline()
          .from(".lhero h1", { y: 18, opacity: 0, duration: 0.5, ease: "power3.out" })
          .from(".lhero p, .lhero .btn", { y: 12, opacity: 0, duration: 0.35, stagger: 0.06, ease: "power2.out" }, "-=.2")
          .from(".heroDot", { scale: 0.4, opacity: 0, duration: 0.3, stagger: 0.06, ease: "back.out(2)" }, "-=.2")
          .to(".heroLiar", { left: "88%", duration: 0.7, ease: "power2.inOut" })
          .to(".heroLiar", { backgroundColor: "#ab5a4b", duration: 0.2 });
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) =>
          gsap.from(el, { y: 20, opacity: 0, duration: 0.5, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 85%" } }),
        );
      }, root);
      return () => ctx.revert();
    });
    return () => mm.revert();
  }, []);

  return (
    <div ref={root}>
      <div className="wrap">
        <nav className="lnav">
          <span className="brand" style={{ padding: 0 }}><Mark /> Sextant</span>
          <Link href="/app" className="btn ghost">Dashboard</Link>
        </nav>
        <section className="lhero">
          <div>
            <h1>A price feed that tells you what it costs to corrupt it.</h1>
            <p>Sextant is an oracle for Portaldot V3. Bonded reporters set the price, and every feed publishes the capital needed to fake it.</p>
            <Link href="/app" className="btn">Try to break it</Link>
          </div>
          <div className="lcard" aria-label="Five reporters on a price line; one moves away and is flagged">
            <h2 style={{ fontSize: 13, color: "var(--muted)", marginBottom: 8 }}>BTC / USD round</h2>
            <div className="line">
              <div className="medianMark" style={{ left: "24%" }} />
              {[14, 19, 24, 29].map((l) => <div key={l} className="dot heroDot" style={{ left: `${l}%`, width: 24, height: 24, background: "var(--primary)", opacity: 0.85 }} />)}
              <div className="dot heroDot heroLiar" style={{ left: "34%", width: 24, height: 24, background: "var(--primary)", opacity: 0.85 }} />
            </div>
            <p className="mono muted" style={{ fontSize: 13 }}>median $77,413 · liar flagged, 20% slashed</p>
          </div>
        </section>
      </div>

      <section className="lsec tint">
        <div className="wrap">
          <h2 data-reveal>Lending pools trust a price they can&apos;t measure. Sextant puts a number on that trust.</h2>
          <div className="three">
            {CASES.map((c) => (
              <div className="lcard" key={c.head} data-reveal>
                <span className={`chip ${c.chip}`}>{c.tag}</span>
                <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
                  {c.dots.map((d, i) => <span key={i} style={{ width: 18, height: 18, borderRadius: "50%", background: d ? "var(--accent)" : "var(--primary)" }} />)}
                </div>
                <h3>{c.head}</h3>
                <p>{c.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="lsec">
        <div className="wrap">
          <h2 data-reveal>Solidity holds the money. Rust does the maths. One transaction crosses both.</h2>
          <div className="stack" data-reveal>
            <div className="lcard"><span className="chip info">Solidity</span><h3>SextantCore</h3><p>Bonds, rounds, slashing</p></div>
            <span className="arrow">→</span>
            <div className="lcard"><span className="chip bad">ink! / Rust</span><h3>SextantMath</h3><p>Weighted median, MAD outliers</p></div>
            <span className="arrow">→</span>
            <div className="lcard"><span className="chip info">Solidity</span><h3>SextantFeed</h3><p>Chainlink interface</p></div>
          </div>
        </div>
      </section>

      <section className="lsec tint">
        <div className="wrap">
          <h2 data-reveal>Cap your exposure at the oracle&apos;s security in three lines.</h2>
          <pre className="code" data-reveal>{`function borrow(uint256 amount) external {
    if (totalDebt + amount > core.corruptionCost()) revert OverSecurityCap();
    (, int256 price,, uint256 updatedAt,) = feed.latestRoundData();
    // the same call you already make to Chainlink
}`}</pre>
          <p style={{ marginTop: 32 }}><Link href="/app" className="btn">Open the dashboard</Link></p>
        </div>
      </section>

      <div className="wrap"><footer className="foot"><span>Sextant, built for Portaldot Hacker House 2026</span><span>PortaldotV3 testnet, chain 420420777</span></footer></div>
    </div>
  );
}
