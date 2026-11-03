## Week 2 update: Sextant

**Project name:** Sextant, a price oracle for Portaldot that tells you what it costs to corrupt it
**Repository:** https://github.com/codeswithroh/portaldot-hackathon-2026-sextant-codeswithroh
**Network:** PortaldotV3 testnet (chain ID 420420777)

### What it does
Reporters bond tPOT and submit BTC/USD prices from 5 exchanges. Each round, an ink! (Rust) contract computes a stake-weighted median and flags outliers.
- **One liar:** the price holds, and the liar loses 20% of their bond.
- **Two colluding liars out of five:** the round freezes, nothing is published and nobody is slashed.
- **Any attacker:** needs 4/9 of total stake to move the price. That number is readable on-chain as `corruptionCost()`.

Solidity apps read the price through the standard Chainlink `AggregatorV3Interface`. The demo lending pool caps total borrowing at `corruptionCost()`, so an attack is never cheaper than what it can steal.

### Progress since week 1
- **ink! math contract deployed on V3:** `SextantMath` at `0x5bc4f7bed4064425c0115dd190628dec5f8f6865`, deploy tx `0x82908ae49d21df90e0c9711532c5cce2a2349bd5e6ef4a5cf07912e8c92b5b2c`.
- **Cross-VM call works on-chain.** A Solidity-ABI call into the ink! contract returned the median, the MAD and an outlier mask that flagged the fake price.
- **Found and fixed a PolkaVM stack overflow:** decoding two `[u128;16]` arrays trapped the ink! contract. Raising the stack with `min_stack_size!` fixed it, and the fix is now deployed.
- **Solidity contracts finished and tested:** `SextantCore`, `SextantFeed` and `MiniLend`. 9 Forge tests pass, covering the liar, collusion, whale, unbonding and lending-cap cases. The ink! unit tests pass too.
- **Reporter node:** pulls BTC/USD from Coinbase, Kraken, Bitstamp, Gemini and Bitfinex. A `--lie` flag runs the attack demos.
- **Dashboard:** a Next.js app with live feed, reporter bonds, slash log and an Attack Lab where you can try every attack and see the outcome before it runs on-chain.

### Blocker
The rest of the deployment (Core, Feed and MiniLend, plus demo rounds) needs about 1,400 tPOT. Storage deposits on V3 cost 0.06 tPOT per byte. The wallet has about 190 tPOT. I've requested more from the team and will deploy within the hour they arrive.

### Next (before Nov 6)
1. Deploy Core, Feed and MiniLend, then run live rounds including the liar and collusion demos, with tx hashes in the README.
2. Public dashboard URL.
3. Demo video (under 3 minutes) and pitch deck.
