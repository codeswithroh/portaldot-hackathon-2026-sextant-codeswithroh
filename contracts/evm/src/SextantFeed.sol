// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {SextantCore} from "./SextantCore.sol";

/// @notice Chainlink AggregatorV3Interface, so existing Solidity code can read Sextant unchanged.
interface AggregatorV3Interface {
    function decimals() external view returns (uint8);
    function description() external view returns (string memory);
    function version() external view returns (uint256);
    function getRoundData(uint80 roundId)
        external
        view
        returns (uint80 roundId_, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
    function latestRoundData()
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound);
}

/// @title SextantFeed
/// @notice One address per price pair, pointing at a feed inside SextantCore.
contract SextantFeed is AggregatorV3Interface {
    SextantCore public immutable core;
    uint256 public immutable feedId;

    constructor(SextantCore core_, uint256 feedId_) {
        core = core_;
        feedId = feedId_;
    }

    function decimals() external view returns (uint8) {
        return core.feed(feedId).decimals;
    }

    function description() external view returns (string memory) {
        return core.feed(feedId).description;
    }

    function version() external pure returns (uint256) {
        return 1;
    }

    function getRoundData(uint80 roundId) external view returns (uint80, int256, uint256, uint256, uint80) {
        return core.getRoundData(feedId, uint64(roundId));
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return core.latestRoundData(feedId);
    }
}
