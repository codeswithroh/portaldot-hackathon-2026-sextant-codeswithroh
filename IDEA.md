# Sextant — the price oracle for Portaldot, written in Rust, readable from Solidity

**One line:** Bonded reporters sign prices with their native Portaldot keys, an ink! v6 contract aggregates and slashes liars, and any Solidity app reads it through the standard Chainlink interface, in one transaction across both VMs.

## Why this wins

### 1. It fills the biggest hole in the field
Rechecked against all 68 builds on 2026-11-01: **none is a general price oracle**. FairDot, Potake and Ballast each have a private oracle for their own data, and DotProof avoids prices by design. PASTX trades stocks at fixed prices. Plenty of them need one:
lending (collateral checks), stablecoin and dollar payments, RWA invoice vaults, memecoin protection, DEX analytics.
They all hardcode prices or rely on an admin. Sextant is the shared piece they're missing.

### 2. It makes Portaldot's headline V3 feature do real work
The judging criteria call out WASM/EVM compatibility explicitly (Innovation, 30%).
The live testnet runs `pallet-revive` (EVM RPC reports `eth-rpc/...`), so ink! v6 and Solidity contracts share one VM and one address space.
Umbra has built an ink! proof verifier but lists deploying it as roadmap, so a live Solidity-to-ink! call inside a production transaction is still open.
Sextant uses both VMs for what each is good at:
- **ink! (Rust):** median/TWAP math, outlier detection, sr25519 signature checks, bond and slash accounting. This is heavy logic that is cheap and safe in Rust.
- **Solidity:** a drop-in `AggregatorV3Interface` (Chainlink-compatible), so existing Aave- or Compound-style code ports to Portaldot without changes.

### 3. The demo has a moment people remember
Live on Demo Day: one reporter starts submitting a fake BTC price. The feed doesn't move (the median holds), the contract flags the outlier, and the liar's bond gets slashed on-chain.
At the same moment, a sample Solidity lending pool keeps liquidating correctly. The explorer shows one tx hop EVM → ink! and back.

## Architecture

```
 CEX APIs (Binance, Coinbase, Kraken, ...)
        │
 ┌──────▼───────┐  sr25519-signed reports (native "5..." keys)
 │ Reporter node│──────────────────────────────┐
 │ (Rust / TS)  │  x N bonded reporters         │
 └──────────────┘                               ▼
                               ┌────────────────────────────────┐
                               │ ink! v6  SextantCore           │
                               │ - reporter registry + tPOT bond│
                               │ - quorum median, TWAP ring buf │
                               │ - deviation/heartbeat rounds   │
                               │ - outlier flags, dispute+slash │
                               │ - fee accrual -> reporters     │
                               └───────────▲────────────────────┘
                                           │ cross-VM call (Solidity ABI, same revive VM)
                               ┌───────────┴────────────────────┐
                               │ Solidity SextantFeed (per pair)│
                               │ AggregatorV3Interface          │
                               └───────────▲────────────────────┘
                                           │
                     Demo consumer: MiniLend.sol (borrow / liquidate on Sextant prices)

 Dashboard (Next.js): live feeds, reporter set + bonds, deviation chart,
 slash log, cross-VM call trace per tx.
```

## Scope for 7 days (code freeze Nov 6, 04:00 UTC)
| Day | Deliverable |
|---|---|
| 1 | Repo, README, architecture diagram. Toolchain check: deploy hello-world ink! v6 + Solidity to V3, prove one cross-VM call, record tx hashes |
| 2 | `SextantCore` (ink!): registry, bond, submit, median, rounds. Unit tests |
| 3 | `SextantFeed.sol` + `MiniLend.sol`. Cross-VM integration test on testnet |
| 4 | Reporter node (3–5 instances, real CEX data), sr25519 signing, heartbeat/deviation logic |
| 5 | Slashing and disputes, TWAP, fee accrual. "Rogue reporter" demo script |
| 6 | Dashboard, Vercel deploy, explorer links |
| 7 | Demo video (<3 min), pitch deck PDF, final README and deployment info. Submit early |

Commit daily. Rules require at least 3 commits and no core modules dumped in the last 24h.

## Business model and ecosystem story
- Data fees per feed (paid in POT), shared with reporters. Premium feeds: FX, commodities, and RWA attestations (invoice and assay data).
- Reporter staking creates real POT demand and a role for node operators.
- Every DeFi or RWA team on Portaldot can integrate on day one with the Chainlink interface they already use.

## Risks to check on Day 1
- ink! v6 deploys on V3 revive (expected, since revive runs PolkaVM). Fallback: write the core in Solidity and keep a Rust off-chain aggregator with on-chain verification.
- sr25519 verification from the contract (revive System precompile `sr25519Verify`). Fallback: ecdsa reporters.
