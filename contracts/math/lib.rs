#![cfg_attr(not(feature = "std"), no_std, no_main)]

//! SextantMath: a stateless robust-statistics engine for EVM contracts.
//!
//! Solidity contracts on Portaldot V3 call it through pallet-revive like any
//! other contract. It does the work that is awkward and expensive in Solidity:
//! sorting, stake-weighted median and median absolute deviation (MAD).

// Decoding two uint128[16] arrays overflows PolkaVM's default stack and traps the call.
#[cfg(not(feature = "std"))]
ink::polkavm_derive::min_stack_size!(262144);

#[ink::contract]
mod sextant_math {
    const BPS: u128 = 10_000;
    /// Max reports per call. Fixed-size arrays keep the contract allocation-free (and small).
    pub const N: usize = 16;

    #[ink::error]
    #[derive(Debug, PartialEq, Eq)]
    pub enum Error {
        Empty,
        TooMany,
    }

    #[ink(storage)]
    pub struct SextantMath {}

    impl SextantMath {
        #[ink(constructor)]
        pub fn new() -> Self {
            Self {}
        }

        /// Stake-weighted median, weighted MAD and an outlier bitmask (bit i = prices[i]).
        ///
        /// Weighting by bond means splitting one bond across many fake reporters
        /// buys no extra influence. A report is an outlier when it is more than
        /// `outlier_bps` from the median AND more than `mad_k / 10` MADs away: the
        /// second test stops a calm market (tiny MAD) from flagging honest jitter,
        /// the first stops a noisy market from hiding a large lie.
        #[ink(message)]
        pub fn aggregate(
            &self,
            prices: [u128; N],
            weights: [u128; N],
            n: u8,
            outlier_bps: u128,
            mad_k: u128,
        ) -> Result<(u128, u128, u128), Error> {
            aggregate(prices, weights, n as usize, outlier_bps, mad_k)
        }

        #[ink(message)]
        pub fn version(&self) -> u32 {
            1
        }
    }

    pub fn aggregate(
        prices: [u128; N],
        weights: [u128; N],
        n: usize,
        outlier_bps: u128,
        mad_k: u128,
    ) -> Result<(u128, u128, u128), Error> {
        if n == 0 {
            return Err(Error::Empty);
        }
        if n > N {
            return Err(Error::TooMany);
        }
        let med = weighted_median(prices, weights, n);
        let mut devs = [0u128; N];
        for i in 0..n {
            devs[i] = prices[i].abs_diff(med);
        }
        let mad = weighted_median(devs, weights, n);

        let mut mask = 0u128;
        for (i, p) in prices[..n].iter().enumerate() {
            let dist = p.abs_diff(med);
            let far = med == 0 || dist.saturating_mul(BPS) / med > outlier_bps;
            let abnormal = dist.saturating_mul(10) > mad.saturating_mul(mad_k);
            if far && abnormal {
                mask |= 1 << i;
            }
        }
        Ok((med, mad, mask))
    }

    /// Lowest value whose cumulative weight reaches half the total. Insertion sort:
    /// inputs are small and core's sort adds ~10 KB of code.
    fn weighted_median(mut v: [u128; N], mut w: [u128; N], n: usize) -> u128 {
        for i in 1..n {
            let mut j = i;
            while j > 0 && v[j - 1] > v[j] {
                v.swap(j - 1, j);
                w.swap(j - 1, j);
                j -= 1;
            }
        }
        let total = w[..n].iter().fold(0u128, |a, b| a.saturating_add(*b));
        let mut acc = 0u128;
        for i in 0..n {
            acc = acc.saturating_add(w[i]);
            if acc.saturating_mul(2) >= total {
                return v[i];
            }
        }
        v[n - 1]
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn arr(v: &[u128]) -> [u128; N] {
            let mut a = [0u128; N];
            a[..v.len()].copy_from_slice(v);
            a
        }

        fn agg(v: &[u128], w: &[u128]) -> (u128, u128, u128) {
            aggregate(arr(v), arr(w), v.len(), 250, 30).unwrap()
        }

        #[ink::test]
        fn equal_weights_behave_like_a_median() {
            assert_eq!(weighted_median(arr(&[3, 1, 2]), arr(&[1, 1, 1]), 3), 2);
            assert_eq!(weighted_median(arr(&[5, 6]), arr(&[1, 1]), 2), 5);
        }

        #[ink::test]
        fn stake_outvotes_headcount() {
            // Four 1-bond sybils cannot outvote one 10-bond reporter.
            let (med, _, mask) = agg(&[100_000, 1, 1, 1, 1], &[10, 1, 1, 1, 1]);
            assert_eq!(med, 100_000);
            assert_eq!(mask, 0b11110);
        }

        #[ink::test]
        fn honest_jitter_is_not_flagged() {
            let (med, _, mask) = agg(&[100_000, 100_010, 99_990, 100_005, 99_995], &[1; 5]);
            assert_eq!(med, 100_000);
            assert_eq!(mask, 0);
        }

        #[ink::test]
        fn liar_is_flagged() {
            let (med, mad, mask) = agg(&[100_000, 150_000, 100_200, 99_900, 100_100], &[1; 5]);
            assert_eq!(med, 100_100);
            assert_eq!(mad, 100);
            assert_eq!(mask, 0b00010);
        }

        #[ink::test]
        fn two_liars_in_five_are_flagged() {
            let (_, _, mask) = agg(&[1, 100_000, 100_100, 99_950, 500_000], &[1; 5]);
            assert_eq!(mask, 0b10001);
        }
    }
}
