"use client";
import { useEffect, useRef } from "react";
import Link from "next/link";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { Mark } from "./Mark";
import { Icon } from "./dash/Icon";
import { RoundMachine } from "./landing/RoundMachine";
import { Count, LiarSlider, StakeToCap, TypingCode, VmBridge } from "./landing/Demos";
import { REPO } from "@/lib/chain";
import { useSextant } from "@/lib/useSextant";

const SOURCES = ["Coinbase", "Kraken", "Bitstamp", "Gemini", "Bitfinex"];

const TILES = [
  { icon: "shield", label: "Bonded reporters", tint: "#c9e2f6" },
  { icon: "slash", label: "Liars fined", tint: "#f6e3de" },
  { icon: "pause", label: "Collusion freezes", tint: "#f8ecc9" },
  { icon: "swap", label: "Solidity ⇄ ink!", tint: "#c9e2f6" },
  { icon: "coin", label: "BTC / USD", tint: "#d8f0e3" },
  { icon: "bank", label: "Capped lending", tint: "#c9e2f6" },
  { icon: "clock", label: "15 min freshness", tint: "#f8ecc9" },
  { icon: "code", label: "Chainlink interface", tint: "#d8f0e3" },
];

const CASES = [
  { tone: "good", dots: [0, 0, 0, 0, 1], head: "One reporter lies", body: "The price holds. The contract takes 20% of the liar's bond and pays the honest four." },
  { tone: "warn", dots: [0, 0, 0, 1, 1], head: "Two reporters team up", body: "Over a third of the round disagrees, so the contract publishes nothing and fines nobody." },
  { tone: "bad", dots: [0, 0, 1, 1, 1], head: "An attacker brings stake", body: "With 4/9 of all bonded stake you can force a price. The contract shows you that number upfront." },
  { tone: "info", dots: [], head: "The price goes stale", body: "MiniLend refuses any price older than 15 minutes, so a stalled feed can't drain the pool." },
];

function Tile({ icon, label, tint }: (typeof TILES)[number]) {
  return (
    <div className="tile">
      <div className="tile-art">
        <span className="blob" style={{ background: tint }} />
        <Icon name={icon} size={54} />
      </div>
      <span>{label}</span>
    </div>
  );
}

export function Landing() {
  const root = useRef<HTMLDivElement>(null);
  const s = useSextant();
  const slashed = s.activity.filter((a) => a.kind === "slashed").reduce((t, a) => t + (a.amount ?? 0), 0);
  const frozen = s.attempts.filter((a) => a.outcome === "frozen").length;

  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger);
    const mm = gsap.matchMedia();
    mm.add("(prefers-reduced-motion: no-preference)", () => {
      const ctx = gsap.context(() => {
        gsap.timeline()
          .from(".hero h1 .w", { yPercent: 110, duration: 0.7, stagger: 0.05, ease: "power4.out" })
          .from(".hero-copy > *:not(h1)", { y: 16, opacity: 0, duration: 0.5, stagger: 0.07, ease: "power2.out" }, "-=.45")
          .from(".machine", { opacity: 0, scale: 0.96, duration: 0.7, ease: "power2.out" }, "-=.6")
          .from(".station", { x: -16, opacity: 0, duration: 0.4, stagger: 0.06, ease: "back.out(2)" }, "-=.4");
        gsap.utils.toArray<HTMLElement>("[data-reveal]").forEach((el) =>
          gsap.from(el, { y: 28, opacity: 0, duration: 0.6, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 88%" } }),
        );
        gsap.utils.toArray<HTMLElement>("[data-stagger]").forEach((el) =>
          gsap.from(el.children, { y: 24, opacity: 0, duration: 0.5, stagger: 0.08, ease: "power2.out", scrollTrigger: { trigger: el, start: "top 85%" } }),
        );
        gsap.to(".band-glass", { scale: 1.02, ease: "none", scrollTrigger: { trigger: ".band", scrub: true } });
      }, root);
      return () => ctx.revert();
    });
    return () => mm.revert();
  }, []);

  const words = "A price feed that tells you what it costs to corrupt it.".split(" ");

  return (
    <div ref={root} className="land">
      <header className="lnav wrap">
        <Link href="/" className="brand"><Mark size={28} /><span>Sextant</span></Link>
        <nav className="lnav-links">
          <a href="#how">How it works</a>
          <a href="#attacks">Attacks</a>
          <a href="#proof">Live proof</a>
          <a href={REPO} target="_blank" rel="noreferrer">Code</a>
        </nav>
        <div className="lnav-cta">
          <Link href="/app#Attack%20Lab" className="btn ghost sm">Try an attack</Link>
          <Link href="/app" className="btn sm">Open dashboard</Link>
        </div>
      </header>

      <section className="hero wrap">
        <div className="hero-copy">
          <span className="eyebrow"><i className="pulse" />Live on PortaldotV3 testnet</span>
          <h1>{words.map((w, i) => <span key={i}><span className="wm"><span className="w">{w}</span></span>{" "}</span>)}</h1>
          <p>Five bonded reporters post the BTC price. A Rust contract finds the median and fines anyone who lies. Your Solidity app reads the result the same way it reads Chainlink.</p>
          <div className="hero-btns">
            <Link href="/app" className="btn">Open dashboard <Icon name="arrow" size={16} /></Link>
            <a href={REPO} target="_blank" rel="noreferrer" className="btn ghost"><Icon name="github" size={16} />Read the code</a>
          </div>
          <div className="hero-stats">
            <div><b className="mono"><Count to={s.cost} decimals={1} /></b><span>tPOT to corrupt</span></div>
            <div><b className="mono"><Count to={s.loading ? undefined : s.rounds.length} /></b><span>rounds on-chain</span></div>
            <div><b className="mono"><Count to={s.loading ? undefined : slashed} decimals={0} /></b><span>tPOT slashed</span></div>
          </div>
        </div>
        <RoundMachine base={s.price ?? 78_300} />
      </section>

      <section className="sources wrap" data-reveal>
        <span>Prices from</span>
        <div>{SOURCES.map((x) => <b key={x}>{x}</b>)}</div>
      </section>

      <section className="band" aria-label="Try to break it">
        <div className="marquee"><div className="track">{[...TILES, ...TILES].map((t, i) => <Tile key={i} {...t} />)}</div></div>
        <div className="marquee rev"><div className="track">{[...TILES.slice(4), ...TILES, ...TILES.slice(0, 4)].map((t, i) => <Tile key={i} {...t} />)}</div></div>
        <div className="band-glass">
          <h2>Try to break it</h2>
          <p>Pick reporters, make them lie, change their stake. The Attack Lab runs the same rules as the contract.</p>
          <div className="hero-btns center">
            <Link href="/app#Attack%20Lab" className="btn"><Icon name="bolt" size={16} />Open the Attack Lab</Link>
          </div>
        </div>
      </section>

      <section id="how" className="wrap sec">
        <div className="sec-head" data-reveal>
          <div><h2>How it holds up</h2><p>Four pieces, all running on the PortaldotV3 testnet today.</p></div>
          <Link href="/app" className="btn ghost sm">See it live</Link>
        </div>
        <div className="bento" data-stagger>
          <article className="bcard wide">
            <h3>Liars pay</h3>
            <p>Drag the slider. Once a report sits 2.5% past the median, the contract takes 20% of that reporter's bond.</p>
            <LiarSlider />
          </article>
          <article className="bcard">
            <h3>Two VMs, one transaction</h3>
            <p>SextantCore is Solidity. SextantMath is ink!. Each round calls from one into the other and back.</p>
            <VmBridge />
          </article>
          <article className="bcard">
            <h3>Reads like Chainlink</h3>
            <p>Point existing Aave or Compound code at SextantFeed. It returns what that code expects.</p>
            <TypingCode answer={s.price} />
          </article>
          <article className="bcard wide">
            <h3>Lending sized to the risk</h3>
            <p>MiniLend caps total debt at the cost to corrupt the feed. Bond more stake and the cap goes up with it.</p>
            <StakeToCap />
          </article>
        </div>
      </section>

      <section className="stats wrap" data-stagger>
        <div><b className="mono"><Count to={s.stake} /></b><span>tPOT bonded</span></div>
        <div><b className="mono"><Count to={s.loading ? undefined : s.attempts.length} /></b><span>rounds attempted</span></div>
        <div><b className="mono"><Count to={s.loading ? undefined : frozen} /></b><span>attacks frozen</span></div>
        <div><b className="mono"><Count to={s.loading ? undefined : s.reporters.length} /></b><span>reporters</span></div>
      </section>

      <section id="attacks" className="wrap sec split">
        <div className="split-copy" data-reveal>
          <h2>What an attacker gets</h2>
          <p>Each case below runs in the contract. You can replay all four in the Attack Lab.</p>
          <Link href="/app#Attack%20Lab" className="btn sm">Replay them</Link>
        </div>
        <div className="cases" data-stagger>
          {CASES.map((c) => (
            <article key={c.head} className={`case ${c.tone}`}>
              <div className="case-dots">{c.dots.length ? c.dots.map((d, i) => <i key={i} className={d ? "liar" : ""} />) : <Icon name="clock" size={22} />}</div>
              <h3>{c.head}</h3>
              <p>{c.body}</p>
            </article>
          ))}
        </div>
      </section>

      <section id="proof" className="wrap sec">
        <div className="sec-head" data-reveal>
          <div><h2>Running on PortaldotV3 now</h2><p>Every row is a real transaction. The dashboard reads them straight from the chain.</p></div>
          <Link href="/app#Rounds" className="btn ghost sm">All rounds</Link>
        </div>
        <div className="proof" data-stagger>
          {(s.attempts.length ? s.attempts.slice(-6).reverse() : []).map((a, i) => (
            <div key={i} className="prow">
              <span className={`pdot ${a.outcome}`}><Icon name={a.outcome === "frozen" ? "pause" : a.outcome === "slashed" ? "slash" : "check"} size={15} /></span>
              <b>Round {a.round}</b>
              <span className={`chip ${a.outcome === "published" ? "good" : a.outcome === "slashed" ? "bad" : "warn"}`}>{a.outcome === "published" ? "Clean" : a.outcome === "slashed" ? "Liar fined" : "Frozen"}</span>
              <span className="mono">{a.price ? `$${a.price.toLocaleString(undefined, { maximumFractionDigits: 2 })}` : "no price"}</span>
            </div>
          ))}
          {!s.attempts.length && <div className="prow muted">{s.loading ? "Reading the chain…" : "No rounds yet"}</div>}
        </div>
      </section>

      <section className="wrap sec cta" data-reveal>
        <Mark size={44} />
        <h2>See the live feed</h2>
        <p>Price, stake, slashes and the cost to corrupt, updated every block.</p>
        <div className="hero-btns center"><Link href="/app" className="btn">Open dashboard <Icon name="arrow" size={16} /></Link></div>
      </section>

      <footer className="foot wrap">
        <span>Sextant · built for Portaldot Hacker House 2026</span>
        <a href={REPO} target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </div>
  );
}
