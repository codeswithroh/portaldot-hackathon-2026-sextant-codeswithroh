// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {ISextantMath} from "../src/ISextantMath.sol";

/// @notice Solidity port of contracts/math/lib.rs, used only so Forge tests can
/// run without a PolkaVM. The on-chain integration test exercises the real ink! code.
contract MathRef is ISextantMath {
    uint256 internal constant BPS = 10_000;

    function aggregate(uint128[16] calldata prices, uint8 n, uint128 outlierBps, uint128 madK)
        external
        pure
        returns (uint128 med, uint128 mad, uint128 mask)
    {
        uint128[16] memory s = prices;
        med = _median(s, n);
        uint128[16] memory d;
        for (uint256 i; i < n; ++i) d[i] = _dist(prices[i], med);
        mad = _median(d, n);
        for (uint256 i; i < n; ++i) {
            uint256 dist = _dist(prices[i], med);
            bool far = med == 0 || dist * BPS / med > outlierBps;
            bool abnormal = dist * 10 > uint256(mad) * madK;
            if (far && abnormal) mask |= uint128(1) << i;
        }
    }

    function twap(uint128[16] calldata prices, uint64[16] calldata times, uint8 n, uint64 nowTs)
        external
        pure
        returns (uint128)
    {
        uint256 acc;
        uint256 total;
        for (uint256 i; i < n; ++i) {
            uint64 end = i + 1 < n ? times[i + 1] : nowTs;
            uint256 dt = end > times[i] ? end - times[i] : 1;
            acc += uint256(prices[i]) * dt;
            total += dt;
        }
        return uint128(acc / total);
    }

    function version() external pure returns (uint32) {
        return 1;
    }

    function _dist(uint128 a, uint128 b) internal pure returns (uint128) {
        return a > b ? a - b : b - a;
    }

    function _median(uint128[16] memory v, uint8 n) internal pure returns (uint128) {
        for (uint256 i = 1; i < n; ++i) {
            for (uint256 j = i; j > 0 && v[j - 1] > v[j]; --j) (v[j - 1], v[j]) = (v[j], v[j - 1]);
        }
        if (n % 2 == 1) return v[n / 2];
        (uint128 a, uint128 b) = (v[n / 2 - 1], v[n / 2]);
        return a / 2 + b / 2 + (a % 2 + b % 2) / 2;
    }
}
