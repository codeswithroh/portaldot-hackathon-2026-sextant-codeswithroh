#![cfg_attr(not(feature = "std"), no_std, no_main)]

//! SextantCore: bonded price reporters, median aggregation and slashing.
//!
//! Reporters bond tPOT and submit one price per round. When a round reaches
//! quorum, the median becomes the answer. Any submission that deviates from
//! the median by more than `outlier_bps` is struck and loses `slash_bps` of its
//! bond to the feed's reward pool; honest submissions are paid from that pool.
//!
//! The contract is built with the Solidity ABI so EVM contracts (SextantFeed)
//! call it directly through pallet-revive.

#[ink::contract]
mod sextant_core {
    use ink::storage::Mapping;
    
    const BPS: u128 = 10_000;
    /// Rounds kept per feed for TWAP reads.
    const HISTORY: u64 = 64;
    /// Largest quorum; reports live in fixed slots so the contract never allocates.
    const MAX_QUORUM: usize = 9;

    #[ink::error]
    #[derive(Debug, PartialEq, Eq)]
    pub enum Error {
        NotOwner,
        BondTooLow,
        NotReporter,
        AlreadyReporter,
        UnknownFeed,
        FeedExists,
        WrongRound,
        AlreadySubmitted,
        ZeroPrice,
        NoData,
        TransferFailed,
        BadParams,
    }

    #[derive(Clone, Default)]
    #[ink::storage_item(packed)]
    pub struct Reporter {
        bond: u128,
        active: bool,
        accepted: u64,
        strikes: u32,
        earned: u128,
    }

    #[derive(Clone, Default)]
    #[ink::storage_item(packed)]
    pub struct Feed {
        decimals: u8,
        latest_round: u64,
        pool: u128,
        reward: u128,
    }

    #[derive(Clone, Default)]
    #[ink::storage_item(packed)]
    pub struct Round {
        answer: u128,
        started_at: u64,
        updated_at: u64,
        reports: u32,
        outliers: u32,
    }

    #[derive(Clone, Default)]
    #[ink::storage_item(packed)]
    pub struct Pending {
        n: u32,
        who: [Address; MAX_QUORUM],
        price: [u128; MAX_QUORUM],
    }

    #[ink(event)]
    pub struct ReporterJoined {
        #[ink(topic)]
        reporter: Address,
        bond: u128,
    }

    #[ink(event)]
    pub struct ReporterLeft {
        #[ink(topic)]
        reporter: Address,
        refund: u128,
    }

    #[ink(event)]
    pub struct FeedCreated {
        #[ink(topic)]
        feed_id: u32,
        decimals: u8,
    }

    #[ink(event)]
    pub struct Submitted {
        #[ink(topic)]
        feed_id: u32,
        #[ink(topic)]
        reporter: Address,
        round_id: u64,
        price: u128,
    }

    #[ink(event)]
    pub struct RoundFinalized {
        #[ink(topic)]
        feed_id: u32,
        round_id: u64,
        answer: u128,
        reports: u32,
        outliers: u32,
    }

    #[ink(event)]
    pub struct Slashed {
        #[ink(topic)]
        feed_id: u32,
        #[ink(topic)]
        reporter: Address,
        round_id: u64,
        price: u128,
        median: u128,
        deviation_bps: u128,
        amount: u128,
    }

    #[ink(storage)]
    pub struct SextantCore {
        owner: Address,
        min_bond: u128,
        quorum: u32,
        outlier_bps: u128,
        slash_bps: u128,
        reporters: Mapping<Address, Reporter>,
        
        feed_count: u32,
        feeds: Mapping<u32, Feed>,
        rounds: Mapping<(u32, u64), Round>,
        pending: Mapping<u32, Pending>,
        started: Mapping<u32, u64>,
    }

    pub type Result<T> = core::result::Result<T, Error>;

    impl SextantCore {
        #[ink(constructor)]
        pub fn new(min_bond: u128, quorum: u32, outlier_bps: u128, slash_bps: u128) -> Self {
            Self {
                owner: Self::env().caller(),
                min_bond,
                quorum: quorum.clamp(1, MAX_QUORUM as u32),
                outlier_bps,
                slash_bps: slash_bps.min(BPS),
                reporters: Mapping::default(),
                feed_count: 0,
                feeds: Mapping::default(),
                rounds: Mapping::default(),
                pending: Mapping::default(),
                started: Mapping::default(),
            }
        }

        // ---------- admin ----------

        #[ink(message)]
        pub fn create_feed(&mut self, decimals: u8, reward: u128) -> Result<u32> {
            self.only_owner()?;
            let id = self.feed_count;
            self.feeds.insert(id, &Feed { decimals, latest_round: 0, pool: 0, reward });
            self.feed_count = id + 1;
            self.env().emit_event(FeedCreated { feed_id: id, decimals });
            Ok(id)
        }

        #[ink(message)]
        pub fn set_params(&mut self, quorum: u32, outlier_bps: u128, slash_bps: u128) -> Result<()> {
            self.only_owner()?;
            if quorum == 0 || quorum as usize > MAX_QUORUM || slash_bps > BPS {
                return Err(Error::BadParams);
            }
            self.quorum = quorum;
            self.outlier_bps = outlier_bps;
            self.slash_bps = slash_bps;
            Ok(())
        }

        /// Anyone (usually a dApp consuming the feed) can top up its reward pool.
        #[ink(message, payable)]
        pub fn fund_feed(&mut self, feed_id: u32) -> Result<()> {
            let mut feed = self.feeds.get(feed_id).ok_or(Error::UnknownFeed)?;
            feed.pool = feed.pool.saturating_add(self.value());
            self.feeds.insert(feed_id, &feed);
            Ok(())
        }

        // ---------- reporters ----------

        #[ink(message, payable)]
        pub fn join(&mut self) -> Result<()> {
            let who = self.env().caller();
            let bond = self.value();
            let mut r = self.reporters.get(who).unwrap_or_default();
            if r.active {
                return Err(Error::AlreadyReporter);
            }
            if bond.saturating_add(r.bond) < self.min_bond {
                return Err(Error::BondTooLow);
            }
            r.bond = r.bond.saturating_add(bond);
            r.active = true;
            self.reporters.insert(who, &r);
            self.env().emit_event(ReporterJoined { reporter: who, bond: r.bond });
            Ok(())
        }

        /// Withdraws the remaining bond plus earned rewards.
        #[ink(message)]
        pub fn leave(&mut self) -> Result<()> {
            let who = self.env().caller();
            let mut r = self.reporters.get(who).ok_or(Error::NotReporter)?;
            if !r.active {
                return Err(Error::NotReporter);
            }
            let refund = r.bond.saturating_add(r.earned);
            r.bond = 0;
            r.earned = 0;
            r.active = false;
            self.reporters.insert(who, &r);
            if refund != 0 {
                self.env().transfer(who, ink::U256::from(refund)).map_err(|_| Error::TransferFailed)?;
            }
            self.env().emit_event(ReporterLeft { reporter: who, refund });
            Ok(())
        }

        /// Submit a price for `round_id`, which must be `latest_round + 1`.
        #[ink(message)]
        pub fn submit(&mut self, feed_id: u32, round_id: u64, price: u128) -> Result<()> {
            let who = self.env().caller();
            let r = self.reporters.get(who).ok_or(Error::NotReporter)?;
            if !r.active || r.bond < self.min_bond {
                return Err(Error::NotReporter);
            }
            let feed = self.feeds.get(feed_id).ok_or(Error::UnknownFeed)?;
            if round_id != feed.latest_round + 1 {
                return Err(Error::WrongRound);
            }
            if price == 0 {
                return Err(Error::ZeroPrice);
            }
            let mut pending = self.pending.get(feed_id).unwrap_or_default();
            let n = pending.n as usize;
            if pending.who[..n].contains(&who) {
                return Err(Error::AlreadySubmitted);
            }
            if n == 0 {
                self.started.insert(feed_id, &self.now());
            }
            pending.who[n] = who;
            pending.price[n] = price;
            pending.n += 1;
            self.env().emit_event(Submitted { feed_id, reporter: who, round_id, price });

            if pending.n >= self.quorum {
                self.finalize(feed_id, feed, pending);
            } else {
                self.pending.insert(feed_id, &pending);
            }
            Ok(())
        }

        fn finalize(&mut self, feed_id: u32, mut feed: Feed, pending: Pending) {
            let round_id = feed.latest_round + 1;
            let n = pending.n as usize;
            let answer = median(pending.price, n);
            let mut outliers = 0u32;

            for (who, price) in pending.who[..n].iter().zip(pending.price[..n].iter()) {
                let mut r = self.reporters.get(who).unwrap_or_default();
                let dev = deviation_bps(*price, answer);
                if dev > self.outlier_bps {
                    let amount = r.bond.saturating_mul(self.slash_bps) / BPS;
                    r.bond = r.bond.saturating_sub(amount);
                    r.strikes += 1;
                    if r.bond < self.min_bond {
                        r.active = false;
                    }
                    feed.pool = feed.pool.saturating_add(amount);
                    outliers += 1;
                    self.env().emit_event(Slashed {
                        feed_id,
                        reporter: *who,
                        round_id,
                        price: *price,
                        median: answer,
                        deviation_bps: dev,
                        amount,
                    });
                } else {
                    r.accepted += 1;
                    let pay = feed.reward.min(feed.pool);
                    feed.pool = feed.pool.saturating_sub(pay);
                    r.earned = r.earned.saturating_add(pay);
                }
                self.reporters.insert(who, &r);
            }

            let now = self.now();
            self.rounds.insert(
                (feed_id, round_id),
                &Round {
                    answer,
                    started_at: self.started.get(feed_id).unwrap_or(now),
                    updated_at: now,
                    reports: pending.n,
                    outliers,
                },
            );
            if round_id > HISTORY {
                self.rounds.remove((feed_id, round_id - HISTORY));
            }
            feed.latest_round = round_id;
            self.feeds.insert(feed_id, &feed);
            self.pending.remove(feed_id);
            self.env().emit_event(RoundFinalized { feed_id, round_id, answer, reports: pending.n, outliers });
        }

        // ---------- reads (Chainlink-shaped) ----------

        /// (roundId, answer, startedAt, updatedAt) with timestamps in seconds.
        #[ink(message)]
        pub fn latest_round_data(&self, feed_id: u32) -> Result<(u64, u128, u64, u64)> {
            let feed = self.feeds.get(feed_id).ok_or(Error::UnknownFeed)?;
            self.round_data(feed_id, feed.latest_round)
        }

        #[ink(message)]
        pub fn get_round_data(&self, feed_id: u32, round_id: u64) -> Result<(u64, u128, u64, u64)> {
            self.round_data(feed_id, round_id)
        }

        /// Time-weighted average of the last `window` rounds (8 decimals like the feed).
        #[ink(message)]
        pub fn twap(&self, feed_id: u32, window: u64) -> Result<u128> {
            let feed = self.feeds.get(feed_id).ok_or(Error::UnknownFeed)?;
            let latest = feed.latest_round;
            if latest == 0 {
                return Err(Error::NoData);
            }
            let first = latest.saturating_sub(window.clamp(1, HISTORY - 1)) + 1;
            let mut until = self.now();
            let (mut acc, mut total) = (0u128, 0u128);
            let mut id = latest;
            while id >= first {
                let Some(r) = self.rounds.get((feed_id, id)) else { break };
                let dt = until.saturating_sub(r.updated_at).max(1) as u128;
                acc = acc.saturating_add(r.answer.saturating_mul(dt));
                total += dt;
                until = r.updated_at;
                id -= 1;
            }
            if total == 0 {
                return Err(Error::NoData);
            }
            Ok(acc / total)
        }

        /// (decimals, latestRound, rewardPool, rewardPerReport)
        #[ink(message)]
        pub fn feed(&self, feed_id: u32) -> Result<(u8, u64, u128, u128)> {
            let f = self.feeds.get(feed_id).ok_or(Error::UnknownFeed)?;
            Ok((f.decimals, f.latest_round, f.pool, f.reward))
        }

        #[ink(message)]
        pub fn feed_count(&self) -> u32 {
            self.feed_count
        }

        /// (bond, active, accepted, strikes, earned)
        #[ink(message)]
        pub fn reporter(&self, who: Address) -> (u128, bool, u64, u32, u128) {
            let r = self.reporters.get(who).unwrap_or_default();
            (r.bond, r.active, r.accepted, r.strikes, r.earned)
        }


        /// Number of submissions in the open round of `feed_id`.
        #[ink(message)]
        pub fn pending_count(&self, feed_id: u32) -> u32 {
            self.pending.get(feed_id).map(|p| p.n).unwrap_or(0)
        }

        /// (minBond, quorum, outlierBps, slashBps, owner)
        #[ink(message)]
        pub fn params(&self) -> (u128, u32, u128, u128, Address) {
            (self.min_bond, self.quorum, self.outlier_bps, self.slash_bps, self.owner)
        }

        // ---------- internal ----------

        fn round_data(&self, feed_id: u32, round_id: u64) -> Result<(u64, u128, u64, u64)> {
            let r = self.rounds.get((feed_id, round_id)).ok_or(Error::NoData)?;
            Ok((round_id, r.answer, r.started_at, r.updated_at))
        }

        fn only_owner(&self) -> Result<()> {
            if self.env().caller() != self.owner {
                return Err(Error::NotOwner);
            }
            Ok(())
        }

        fn value(&self) -> u128 {
            self.env().transferred_value().low_u128()
        }

        fn now(&self) -> u64 {
            self.env().block_timestamp() / 1000
        }
    }

    fn median(mut v: [u128; MAX_QUORUM], n: usize) -> u128 {
        let v = &mut v[..n];
        // Insertion sort: rounds hold a handful of reports, and core's sort is ~10 KB of code.
        for i in 1..n {
            let mut j = i;
            while j > 0 && v[j - 1] > v[j] {
                v.swap(j - 1, j);
                j -= 1;
            }
        }
        if n % 2 == 1 {
            v[n / 2]
        } else {
            v[n / 2 - 1] / 2 + v[n / 2] / 2 + (v[n / 2 - 1] % 2 + v[n / 2] % 2) / 2
        }
    }

    fn deviation_bps(price: u128, reference: u128) -> u128 {
        if reference == 0 {
            return u128::MAX;
        }
        price.abs_diff(reference).saturating_mul(BPS) / reference
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn accounts() -> ink::env::test::DefaultAccounts {
            ink::env::test::default_accounts()
        }

        fn as_caller(a: Address) {
            ink::env::test::set_caller(a);
        }

        fn bond(v: u128) {
            ink::env::test::set_value_transferred(ink::U256::from(v));
        }

        fn setup() -> SextantCore {
            let acc = accounts();
            as_caller(acc.alice);
            let mut c = SextantCore::new(u128::from(100u128), 3, 200, 5_000);
            c.create_feed(8, 1).unwrap();
            for who in [acc.alice, acc.bob, acc.charlie, acc.django] {
                as_caller(who);
                bond(100);
                c.join().unwrap();
            }
            bond(0);
            c
        }

        #[ink::test]
        fn median_and_deviation() {
            let a = |v: &[u128]| {
                let mut x = [0u128; MAX_QUORUM];
                x[..v.len()].copy_from_slice(v);
                median(x, v.len())
            };
            assert_eq!(a(&[3, 1, 2]), 2);
            assert_eq!(a(&[4, 1, 3, 2]), 2);
            assert_eq!(a(&[5, 6]), 5);
            assert_eq!(deviation_bps(102, 100), 200);
            assert_eq!(deviation_bps(97, 100), 300);
        }

        #[ink::test]
        fn round_finalizes_at_quorum() {
            let acc = accounts();
            let mut c = setup();
            as_caller(acc.alice);
            c.submit(0, 1, 100_000).unwrap();
            as_caller(acc.bob);
            c.submit(0, 1, 100_100).unwrap();
            assert_eq!(c.latest_round_data(0), Err(Error::NoData));
            as_caller(acc.charlie);
            c.submit(0, 1, 99_900).unwrap();
            let (round, answer, _, _) = c.latest_round_data(0).unwrap();
            assert_eq!((round, answer), (1, 100_000));
            assert_eq!(c.pending_count(0), 0);
        }

        #[ink::test]
        fn liar_is_slashed_and_feed_holds() {
            let acc = accounts();
            let mut c = setup();
            as_caller(acc.alice);
            c.submit(0, 1, 100_000).unwrap();
            as_caller(acc.bob);
            c.submit(0, 1, 150_000).unwrap(); // +50%
            as_caller(acc.charlie);
            c.submit(0, 1, 100_200).unwrap();
            let (_, answer, _, _) = c.latest_round_data(0).unwrap();
            assert_eq!(answer, 100_200);
            let (bond, active, _, strikes, _) = c.reporter(acc.bob);
            assert_eq!((bond, active, strikes), (50u128, false, 1));
            as_caller(acc.bob);
            assert_eq!(c.submit(0, 2, 1), Err(Error::NotReporter));
        }

        #[ink::test]
        fn rejects_bad_submissions() {
            let acc = accounts();
            let mut c = setup();
            as_caller(acc.alice);
            assert_eq!(c.submit(0, 2, 1), Err(Error::WrongRound));
            assert_eq!(c.submit(0, 1, 0), Err(Error::ZeroPrice));
            c.submit(0, 1, 5).unwrap();
            assert_eq!(c.submit(0, 1, 5), Err(Error::AlreadySubmitted));
            as_caller(acc.eve);
            assert_eq!(c.submit(0, 1, 5), Err(Error::NotReporter));
            assert_eq!(c.create_feed(8, 0), Err(Error::NotOwner));
        }
    }
}
