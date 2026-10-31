# Sextant

A price oracle for Portaldot V3 that publishes what it would cost to corrupt it.

Bonded reporters post prices from five independent exchanges. `SextantCore` (Solidity) holds bonds and rounds, and calls `SextantMath` (ink!, Rust) for a stake-weighted median, MAD outlier detection and TWAP. `SextantFeed` exposes the Chainlink `AggregatorV3Interface`, so existing Solidity code reads it unchanged.

## What happens when someone lies

| Attack (5 equal reporters) | Result |
|---|---|
| 1 lies | Median holds, liar loses 20% of bond |
| 2 collude | Over 1/3 of the round disagrees: frozen, nothing published, nobody slashed |
| 4/9 of all active stake | Can publish a false price |

A round closes at 2/3 of active stake and freezes if over 1/3 of it is flagged. So a false price needs 2/3 of 2/3 of the stake, which is 4/9. `corruptionCost()` returns this number on-chain, and `MiniLend` caps total debt at it.

## Layout

```
contracts/math   ink! v6 SextantMath, compiled to PolkaVM
contracts/evm    SextantCore, SextantFeed, MiniLend (Foundry)
contracts/core   First all-ink! core, kept for reference and not deployed
reporter         Exchange price sources
scripts          Fund, deploy, reporter setup, reporter node
app              Landing page (/) and dashboard (/app)
```

## Run it

Requires Rust, `cargo-contract` 6.0.0-beta.2, Foundry, Node 22+ and pnpm. Put a testnet mnemonic in `.env` (see `.env.example`).

```bash
(cd contracts/math && cargo test && cargo contract build --release)
(cd contracts/evm && forge test && forge build)
cd scripts && pnpm install
npx tsx fund-evm.ts 2500
pnpm deploy && pnpm setup
pnpm reporter                     # honest reporters, 60s rounds
pnpm reporter --once --lie 2      # reporter 2 lies by 50%
pnpm reporter --once --lie 1,2    # two collude: the round freezes
cp ../deployments.json ../app/lib/deployments.json
cd ../app && pnpm install && pnpm dev
```

## Costs

V3 charges about 0.08 tPOT per byte of deployed code. This is why reports use fixed-size `uint128[16]` arrays, which keeps the ink! contract allocation-free at 12 KB.

## Known limits

- `guardianSlash` is owner-only. An attacker above 4/9 of stake is stopped by the unbonding delay plus this manual slash, so it should move to governance.
- Forge tests use `MathRef`, a Solidity port of the ink! maths. Only the on-chain run exercises the real cross-VM call.
- `MiniLend` uses synthetic BTC and a fixed 1 tPOT = 1 USD, because POT has no testnet market price.
- The Attack Lab runs a TypeScript port of the round rules in the browser. It's a simulator, and on-chain results are on the Overview and Reporters tabs.
