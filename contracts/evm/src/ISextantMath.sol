// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

/// @notice Solidity view of the ink! v6 SextantMath contract (contracts/math).
/// Both run on pallet-revive, so this is an ordinary external call.
interface ISextantMath {
    function aggregate(uint128[16] calldata prices, uint8 n, uint128 outlierBps, uint128 madK)
        external
        view
        returns (uint128 median, uint128 mad, uint128 outlierMask);

    function twap(uint128[16] calldata prices, uint64[16] calldata times, uint8 n, uint64 nowTs)
        external
        view
        returns (uint128);

    function version() external view returns (uint32);
}
