// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {SextantCore} from "./SextantCore.sol";
import {AggregatorV3Interface} from "./SextantFeed.sol";

/// @title MiniLend
/// @notice Demo pool: borrow tPOT against synthetic BTC. Total debt can never exceed
/// the oracle's published corruption cost, so stealing the pool through a fake price
/// needs more bonded capital than the pool holds. Borrowing stops on a stale feed.
contract MiniLend {
    uint256 public constant LTV_BPS = 5_000;
    uint256 public constant LIQUIDATION_BPS = 7_500;
    uint256 public constant MAX_AGE = 15 minutes;
    /// @dev tPOT per USD for this demo; POT has no market price on testnet.
    uint256 public constant TPOT_PER_USD = 1;

    SextantCore public immutable core;
    AggregatorV3Interface public immutable feed;

    mapping(address => uint256) public collateral; // 1e18 = 1 BTC
    mapping(address => uint256) public debt; // tPOT wei
    uint256 public totalDebt;

    event Deposited(address indexed user, uint256 amount);
    event Borrowed(address indexed user, uint256 amount);
    event Repaid(address indexed user, uint256 amount);
    event Liquidated(address indexed user, address indexed by, uint256 debt, uint256 collateral);

    error StalePrice();
    error OverLTV();
    error OverSecurityCap();
    error Healthy();
    error TransferFailed();

    constructor(SextantCore core_, AggregatorV3Interface feed_) {
        core = core_;
        feed = feed_;
    }

    receive() external payable {}

    /// @notice Testnet faucet-style deposit of synthetic BTC.
    function deposit(uint256 amount) external {
        collateral[msg.sender] += amount;
        emit Deposited(msg.sender, amount);
    }

    function price() public view returns (uint256) {
        (,int256 answer,, uint256 updatedAt,) = feed.latestRoundData();
        if (block.timestamp - updatedAt > MAX_AGE) revert StalePrice();
        return uint256(answer);
    }

    /// @notice What `user`'s collateral is worth in tPOT wei.
    function collateralValue(address user) public view returns (uint256) {
        return collateral[user] * price() * TPOT_PER_USD / 1e8;
    }

    /// @notice Remaining room under the oracle's corruption cost.
    function securityRoom() public view returns (uint256) {
        uint256 cap = core.corruptionCost();
        return cap > totalDebt ? cap - totalDebt : 0;
    }

    function borrow(uint256 amount) external {
        if (amount > securityRoom()) revert OverSecurityCap();
        if ((debt[msg.sender] + amount) * 10_000 > collateralValue(msg.sender) * LTV_BPS) revert OverLTV();
        debt[msg.sender] += amount;
        totalDebt += amount;
        (bool ok,) = msg.sender.call{value: amount}("");
        if (!ok) revert TransferFailed();
        emit Borrowed(msg.sender, amount);
    }

    function repay() external payable {
        uint256 amount = msg.value > debt[msg.sender] ? debt[msg.sender] : msg.value;
        debt[msg.sender] -= amount;
        totalDebt -= amount;
        emit Repaid(msg.sender, amount);
    }

    /// @notice Clears a position over the liquidation line; the liquidator repays its debt and takes the BTC.
    function liquidate(address user) external payable {
        uint256 d = debt[user];
        if (d * 10_000 <= collateralValue(user) * LIQUIDATION_BPS) revert Healthy();
        if (msg.value < d) revert TransferFailed();
        uint256 c = collateral[user];
        (debt[user], collateral[user]) = (0, 0);
        totalDebt -= d;
        collateral[msg.sender] += c;
        emit Liquidated(user, msg.sender, d, c);
    }
}
