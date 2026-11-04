# Sextant demo video script

Target: about 2:30. Record it as one take, facing the camera. Pause for a beat between sections so the cuts land clean. Lines in [brackets] are what I'll cut to on screen. You only read the plain text.

---

**1. Hook (0:00–0:15)**

Every lending app trusts one number: the price. If someone can fake that price, they can drain the pool.

So here's the question nobody answers: how much would it cost to fake it?

[Landing page hero, headline animating in]

---

**2. What Sextant is (0:15–0:40)**

I built Sextant. It's a price oracle on Portaldot that publishes that number on-chain.

Five reporters each put up a bond and post the Bitcoin price from a different exchange. A Rust contract takes the median. If someone lies, they lose part of their bond.

[Hero machine: packets flowing from five stations into the sextant]

---

**3. One liar (0:40–1:00)**

Here's a real round on the Portaldot testnet. One reporter said Bitcoin was a hundred and seventeen thousand dollars. The real price was seventy-eight thousand.

The price didn't move. The contract caught the liar and took twenty percent of their bond.

[Dashboard → Rounds: red tile on round 2, then the slash in the activity feed]

---

**4. Two colluding (1:00–1:20)**

Then two reporters teamed up. That's over a third of the round disagreeing.

The contract doesn't guess who's right. It freezes the round. No price, no fines. A bad price never reaches the app.

[Rounds: yellow frozen tile on round 3. Then Attack Lab running the same case]

---

**5. The number (1:20–1:45)**

So when does it break? An attacker needs four-ninths of all the bonded stake. Right now that's forty-two point seven tPOT.

That's the cost to corrupt, and it's live on-chain. The lending app reads it and never lends more than that. Faking the price costs more than you can steal.

[Overview: blue cost-to-corrupt card. Then Lending: gauge at 23%, security budget bars]

---

**6. Why Portaldot (1:45–2:10)**

This only works because of Portaldot. The core is Solidity. The maths is ink!, written in Rust. Every round crosses both VMs in a single transaction.

And apps read it with the same line of code they use for Chainlink. Nothing to rewrite.

[Contracts page: flow map. Then landing page bento: the Solidity ⇄ ink! animation and the typed code line]

---

**7. Close (2:10–2:30)**

It's live on the V3 testnet right now. Four contracts, real slashes, a real loan.

The dashboard is at sextant-oracle.vercel.app, and the code is on GitHub. Try to break it.

[Dashboard overview, then end card: logo, URL, GitHub link]

---

## Recording notes

- Frame from the chest up, eye level, light facing you. A plain background is fine.
- 1080p or 4K, landscape. Phone footage works.
- Record room tone: 5 seconds of silence before you start.
- If you fumble a line, pause and say it again. I'll cut the retake.
- Send the raw file as it is. I'll add the screen recordings, captions and the end card.
