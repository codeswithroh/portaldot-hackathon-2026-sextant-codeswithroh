#![cfg_attr(not(feature = "std"), no_std, no_main)]

//! SextantMath: a stateless robust-statistics engine for EVM contracts.
//!
//! Solidity contracts on Portaldot V3 call it through pallet-revive like any
//! other contract. It does the work that is awkward and expensive in Solidity:
//! sorting, median, median absolute deviation (MAD) and time-weighted averages.

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
        LengthMismatch,
    }

    #[ink(storage)]
    pub struct SextantMath {}

    impl SextantMath {
        #[ink(constructor)]
        pub fn new() -> Self {
            Self {}
        }

        /// Median, MAD and an outlier bitmask (bit i = prices[i]).
        ///
        /// A report is an outlier when it is more than `outlier_bps` from the
        /// median AND more than `mad_k / 10` MADs away. The second test stops a
        /// calm market (tiny MAD) from flagging honest jitter, and the first
        /// stops a noisy market from hiding a large lie.
        #[ink(message)]
        pub fn aggregate(&self, prices: [u128; N], n: u8, outlier_bps: u128, mad_k: u128) -> Result<(u128, u128, u128), Error> {
            aggregate(prices, n as usize, outlier_bps, mad_k)
        }

        /// Time-weighted average of `prices[i]`, each valid from `times[i]`
        /// until the next timestamp (or `now` for the last one).
        #[ink(message)]
        pub fn twap(&self, prices: [u128; N], times: [u64; N], n: u8, now: u64) -> Result<u128, Error> {
            let n = (n as usize).min(N);
            twap(&prices[..n], &times[..n], now)
        }

        #[ink(message)]
        pub fn version(&self) -> u32 {
            1
        }
    }

    pub fn aggregate(prices: [u128; N], n: usize, outlier_bps: u128, mad_k: u128) -> Result<(u128, u128, u128), Error> {
        if n == 0 {
            return Err(Error::Empty);
        }
        if n > N {
            return Err(Error::TooMany);
        }
        let mut sorted = prices;
        let med = median(&mut sorted[..n]);
        let mut devs = [0u128; N];
        for i in 0..n {
            devs[i] = prices[i].abs_diff(med);
        }
        let mad = median(&mut devs[..n]);

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

    pub fn twap(prices: &[u128], times: &[u64], now: u64) -> Result<u128, Error> {
        if prices.is_empty() {
            return Err(Error::Empty);
        }
        if prices.len() != times.len() {
            return Err(Error::LengthMismatch);
        }
        let (mut acc, mut total) = (0u128, 0u128);
        for i in 0..prices.len() {
            let end = if i + 1 < times.len() { times[i + 1] } else { now };
            let dt = end.saturating_sub(times[i]).max(1) as u128;
            acc = acc.saturating_add(prices[i].saturating_mul(dt));
            total += dt;
        }
        Ok(acc / total)
    }

    /// Insertion sort then middle element; inputs are small and core's sort adds ~10 KB.
    fn median(v: &mut [u128]) -> u128 {
        for i in 1..v.len() {
            let mut j = i;
            while j > 0 && v[j - 1] > v[j] {
                v.swap(j - 1, j);
                j -= 1;
            }
        }
        let n = v.len();
        if n % 2 == 1 {
            v[n / 2]
        } else {
            let (a, b) = (v[n / 2 - 1], v[n / 2]);
            a / 2 + b / 2 + (a % 2 + b % 2) / 2
        }
    }

    #[cfg(test)]
    mod tests {
        use super::*;

        fn agg(v: &[u128]) -> (u128, u128, u128) {
            let mut a = [0u128; N];
            a[..v.len()].copy_from_slice(v);
            aggregate(a, v.len(), 250, 30).unwrap()
        }

        #[ink::test]
        fn median_odd_even() {
            assert_eq!(median(&mut [3, 1, 2]), 2);
            assert_eq!(median(&mut [4, 1, 3, 2]), 2);
            assert_eq!(median(&mut [5, 6]), 5);
        }

        #[ink::test]
        fn honest_jitter_is_not_flagged() {
            let (med, _, mask) = agg(&[100_000, 100_010, 99_990, 100_005, 99_995]);
            assert_eq!(med, 100_000);
            assert_eq!(mask, 0);
        }

        #[ink::test]
        fn liar_is_flagged() {
            let (med, mad, mask) = agg(&[100_000, 150_000, 100_200, 99_900, 100_100]);
            assert_eq!(med, 100_100);
            assert_eq!(mad, 100);
            assert_eq!(mask, 0b00010);
        }

        #[ink::test]
        fn two_liars_in_five_are_flagged() {
            let (_, _, mask) = agg(&[1, 100_000, 100_100, 99_950, 500_000]);
            assert_eq!(mask, 0b10001);
        }

        #[ink::test]
        fn twap_weights_by_time() {
            assert_eq!(twap(&[100, 200], &[0, 30], 40).unwrap(), (100 * 30 + 200 * 10) / 40);
            assert_eq!(twap(&[1], &[1, 2], 3), Err(Error::LengthMismatch));
        }
    }
}
