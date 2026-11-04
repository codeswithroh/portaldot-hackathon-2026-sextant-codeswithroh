# DoraHacks BUIDL form

## Left column

**Logo:** upload `docs/brand/logo.png`

**Name of your Build:** Sextant

**Brief description:** A price oracle for Portaldot that publishes, on-chain, how much stake it would take to corrupt it.

**Tags:** Oracle, DeFi, ink!, Solidity, Rust, Portaldot

**Team Info:** Rohit Purkait (solo). Contracts, reporter node, dashboard.

**Project URL (globe field):** https://sextant-oracle.vercel.app

**+ GitHub Repo:** https://github.com/codeswithroh/portaldot-hackathon-2026-sextant-codeswithroh

**+ Video:** required by the form. Add the YouTube/Loom link once the demo is recorded.

**+ X / LinkedIn:** your own profiles (optional)

**Contact Info:** your email and Discord handle `codeswithroh`

---

## Description (paste into the editor)

### Basic Info
- **Project Name:** Sextant
- **Repository URL:** https://github.com/codeswithroh/portaldot-hackathon-2026-sextant-codeswithroh
- **Demo Video URL:** (coming before Nov 6)

### The problem
Lending, stablecoins and RWA apps on Portaldot all need prices. Today each team hardcodes them or trusts an admin key. And when a protocol does use an oracle, it can't tell how much an attacker would need to spend to fake a price, so it can't size its risk.

### How it works
1. Reporters bond tPOT and submit BTC/USD from 5 exchanges (Coinbase, Kraken, Bitstamp, Gemini, Bitfinex).
2. A round closes once reporters holding 2/3 of the stake have reported.
3. **SextantMath (ink!, Rust)** computes a stake-weighted median and MAD, and flags outliers.
4. **SextantCore (Solidity)** applies the result:

| Attack | What happens |
|---|---|
| 1 of 5 reporters lies | Price holds. The liar loses 20% of their bond. |
| 2 of 5 collude | Round freezes. Nothing is published and nobody is slashed. |
| Attacker with stake | Needs 4/9 of total stake. Published as `corruptionCost()`. |

5. **SextantFeed** serves the price through Chainlink's `AggregatorV3Interface`, so existing Solidity code reads it unchanged.
6. **MiniLend**, the demo consumer, caps total debt at `corruptionCost()` and rejects prices older than 15 minutes. An attack never costs less than what it could steal.

### Demo scene
Five reporters post live BTC prices. Reporter 2 starts lying by +50%: the feed doesn't move, the liar gets slashed on-chain, and the honest reporters get paid. Then two reporters collude: the round freezes instead of publishing a bad price. The dashboard's Attack Lab lets anyone try each attack and see the outcome before it runs on-chain.

### Technical highlights
- **Both of Portaldot's VMs in one transaction:** a Solidity contract calls an ink! v6 contract through the Solidity ABI, both running on the V3 runtime.
- **Live on V3 testnet:** all four contracts are deployed (addresses in the README). Round 2 slashed a reporter who posted $117,507 while the price held at $78,343.83 (tx `0x8e6d12c0628b146923e4cbff0ea068ab0e6fd9bd763f9bb4aed05b389435456c`). A two-reporter collusion froze round 3 (tx `0x7140b1e5fd7e6a3ec3838d2d511b063f01b4542a747d0425e09a10b761fb9c17`). MiniLend lent 10 tPOT against the live price.
- **Found and fixed a PolkaVM stack overflow:** decoding two `[u128;16]` arrays trapped the contract. The fix is `min_stack_size!(262144)`, documented in the README.
- **Small contracts, measured costs:** the ink! blob is 10.4 KB and SextantCore is 8.6 KB. Per-byte storage deposits are measured and listed in the README.
- **Tests:** 9 Forge tests (liar, collusion, whale, unbonding, lending cap, TWAP) and 5 ink! unit tests.
- **Stack:** ink! v6, Solidity 0.8.28 (Foundry), TypeScript reporter (viem, polkadot.js), Next.js dashboard.

### Status
- **Deployed on PortaldotV3:** SextantMath (ink!), SextantCore, SextantFeed, MiniLend.
- **Live:** 6 published rounds, 1 liar slashed, 1 collusion frozen, 1 loan open.
- **Dashboard:** https://sextant-oracle.vercel.app

### Declaration
I confirm that:
1. All code was independently developed during this hackathon.
2. All delivery requirements of this specification have been met.
3. The organizing committee may publicly review and technically reproduce the code.
