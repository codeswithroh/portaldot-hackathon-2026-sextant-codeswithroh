// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {ISextantMath} from "./ISextantMath.sol";

/// @title SextantCore
/// @notice Bonded price reporters, rounds and slashing. The statistics (stake-weighted
/// median, MAD outlier detection) run in the ink! SextantMath contract.
///
/// A round closes once 2/3 of active stake has reported. If more than 1/3 of the
/// round's stake disagrees with the median the round is contested: nothing is
/// published and nobody is slashed, because the chain can't tell who is lying.
/// So moving the price needs 2/3 of a round holding 2/3 of the stake: 4/9 of all
/// active stake. `corruptionCost` publishes that number for consumers to act on.
contract SextantCore {
    uint256 internal constant BPS = 10_000;
    uint8 public constant MAX_QUORUM = 16;
    uint64 internal constant HISTORY = 16;

    struct Reporter {
        uint128 bond;
        uint128 earned;
        uint64 accepted;
        uint32 strikes;
        bool active;
        uint64 unlockAt; // set by requestLeave; 0 while bonded
    }

    struct Feed {
        string description;
        uint8 decimals;
        uint64 latestRound;
        uint128 pool; // rewards available to honest reporters
        uint128 reward; // paid per accepted report
    }

    struct Round {
        uint128 answer;
        uint128 mad;
        uint64 startedAt;
        uint64 updatedAt;
        uint8 reports;
        uint8 outliers;
    }

    ISextantMath public immutable math;
    address public owner;
    uint128 public minBond;
    uint8 public quorum;
    uint128 public outlierBps;
    uint128 public madK; // tenths of a MAD
    uint128 public slashBps;
    uint64 public unbondDelay;
    uint128 public totalStake; // sum of active bonds

    mapping(address => Reporter) public reporters;
    address[] internal reporterList;
    mapping(address => bool) internal seen;
    Feed[] internal feeds;
    mapping(uint256 => mapping(uint64 => Round)) internal rounds;
    mapping(uint256 => address[]) internal pendingWho;
    mapping(uint256 => uint128[]) internal pendingPrice;

    event ReporterJoined(address indexed reporter, uint128 bond);
    event LeaveRequested(address indexed reporter, uint64 unlockAt);
    event ReporterLeft(address indexed reporter, uint128 refund);
    event RoundContested(uint256 indexed feedId, uint64 roundId, uint128 median, uint128 flaggedStake, uint128 roundStake);
    event GuardianSlashed(address indexed reporter, uint128 amount);
    event FeedCreated(uint256 indexed feedId, string description, uint8 decimals);
    event FeedFunded(uint256 indexed feedId, address indexed from, uint128 amount);
    event Submitted(uint256 indexed feedId, address indexed reporter, uint64 roundId, uint128 price);
    event RoundFinalized(uint256 indexed feedId, uint64 roundId, uint128 answer, uint128 mad, uint8 reports, uint8 outliers);
    event Slashed(
        uint256 indexed feedId,
        address indexed reporter,
        uint64 roundId,
        uint128 price,
        uint128 median,
        uint128 amount
    );

    error NotOwner();
    error BondTooLow();
    error NotReporter();
    error AlreadyReporter();
    error UnknownFeed();
    error WrongRound();
    error AlreadySubmitted();
    error ZeroPrice();
    error NoData();
    error BadParams();
    error TransferFailed();
    error StillLocked();

    modifier onlyOwner() {
        if (msg.sender != owner) revert NotOwner();
        _;
    }

    constructor(ISextantMath math_, uint128 minBond_, uint8 quorum_, uint128 outlierBps_, uint128 madK_, uint128 slashBps_, uint64 unbondDelay_) {
        math = math_;
        unbondDelay = unbondDelay_;
        owner = msg.sender;
        minBond = minBond_;
        _setParams(quorum_, outlierBps_, madK_, slashBps_);
    }

    // ---------------------------------------------------------------- admin

    function createFeed(string calldata description, uint8 decimals, uint128 reward) external onlyOwner returns (uint256 id) {
        id = feeds.length;
        feeds.push(Feed(description, decimals, 0, 0, reward));
        emit FeedCreated(id, description, decimals);
    }

    function setParams(uint8 quorum_, uint128 outlierBps_, uint128 madK_, uint128 slashBps_) external onlyOwner {
        _setParams(quorum_, outlierBps_, madK_, slashBps_);
    }

    function _setParams(uint8 quorum_, uint128 outlierBps_, uint128 madK_, uint128 slashBps_) internal {
        if (quorum_ == 0 || quorum_ > MAX_QUORUM || slashBps_ > BPS) revert BadParams();
        (quorum, outlierBps, madK, slashBps) = (quorum_, outlierBps_, madK_, slashBps_);
    }

    /// @notice Consumers top up a feed's reward pool; honest reporters are paid from it.
    function fundFeed(uint256 feedId) external payable {
        Feed storage f = _feed(feedId);
        f.pool += uint128(msg.value);
        emit FeedFunded(feedId, msg.sender, uint128(msg.value));
    }

    // ------------------------------------------------------------ reporters

    function join() external payable {
        Reporter storage r = reporters[msg.sender];
        if (r.active) revert AlreadyReporter();
        uint128 bond = r.bond + uint128(msg.value);
        if (bond < minBond) revert BondTooLow();
        if (!seen[msg.sender]) {
            seen[msg.sender] = true;
            reporterList.push(msg.sender);
        }
        r.bond = bond;
        r.active = true;
        r.unlockAt = 0;
        totalStake += bond;
        emit ReporterJoined(msg.sender, bond);
    }

    /// @notice Stop reporting. The bond stays slashable until the delay passes,
    /// so a reporter can't lie and walk out in the same block.
    function requestLeave() external {
        Reporter storage r = reporters[msg.sender];
        if (!r.active) revert NotReporter();
        r.active = false;
        r.unlockAt = uint64(block.timestamp) + unbondDelay;
        totalStake -= r.bond;
        emit LeaveRequested(msg.sender, r.unlockAt);
    }

    /// @notice Withdraw remaining bond plus earned rewards after the delay.
    function withdraw() external {
        Reporter storage r = reporters[msg.sender];
        if (r.active || r.bond + r.earned == 0) revert NotReporter();
        if (block.timestamp < r.unlockAt) revert StillLocked();
        uint128 refund = r.bond + r.earned;
        (r.bond, r.earned) = (0, 0);
        (bool ok,) = msg.sender.call{value: refund}("");
        if (!ok) revert TransferFailed();
        emit ReporterLeft(msg.sender, refund);
    }

    /// @notice Last resort when a majority-stake attack did get through: burn the
    /// attackers' bonds into the feed pool. Owner-only in this version.
    function guardianSlash(uint256 feedId, address reporter) external onlyOwner {
        Reporter storage r = reporters[reporter];
        Feed storage f = _feed(feedId);
        uint128 amount = r.bond;
        if (r.active) totalStake -= amount;
        (r.bond, r.active) = (0, false);
        f.pool += amount;
        emit GuardianSlashed(reporter, amount);
    }

    /// @notice Report `price` for `roundId`, which must be `latestRound + 1`.
    function submit(uint256 feedId, uint64 roundId, uint128 price) external {
        Reporter storage r = reporters[msg.sender];
        if (!r.active) revert NotReporter();
        Feed storage f = _feed(feedId);
        if (roundId != f.latestRound + 1) revert WrongRound();
        if (price == 0) revert ZeroPrice();

        address[] storage who = pendingWho[feedId];
        for (uint256 i; i < who.length; ++i) {
            if (who[i] == msg.sender) revert AlreadySubmitted();
        }
        if (who.length == 0) rounds[feedId][roundId].startedAt = uint64(block.timestamp);
        who.push(msg.sender);
        pendingPrice[feedId].push(price);
        emit Submitted(feedId, msg.sender, roundId, price);

        uint256 stake;
        for (uint256 i; i < who.length; ++i) stake += reporters[who[i]].bond;
        if (who.length >= quorum && stake * 3 >= uint256(totalStake) * 2) _finalize(feedId, f, roundId);
    }

    function _finalize(uint256 feedId, Feed storage f, uint64 roundId) internal {
        address[] storage who = pendingWho[feedId];
        uint128[] storage px = pendingPrice[feedId];
        uint8 n = uint8(who.length);

        uint128[16] memory prices;
        uint128[16] memory weights;
        uint128 roundStake;
        for (uint256 i; i < n; ++i) {
            prices[i] = px[i];
            weights[i] = reporters[who[i]].bond;
            roundStake += weights[i];
        }

        // Cross-VM call: EVM bytecode -> ink! (PolkaVM) on the same chain.
        (uint128 median, uint128 mad, uint128 mask) = math.aggregate(prices, weights, n, outlierBps, madK);

        uint128 flagged;
        for (uint256 i; i < n; ++i) {
            if (mask & (uint128(1) << i) != 0) flagged += weights[i];
        }
        if (uint256(flagged) * 3 > roundStake) {
            delete pendingWho[feedId];
            delete pendingPrice[feedId];
            emit RoundContested(feedId, roundId, median, flagged, roundStake);
            return;
        }

        uint8 outliers;
        for (uint256 i; i < n; ++i) {
            Reporter storage r = reporters[who[i]];
            if (mask & (uint128(1) << i) != 0) {
                uint128 amount = uint128(uint256(r.bond) * slashBps / BPS);
                r.bond -= amount;
                r.strikes += 1;
                totalStake -= amount;
                if (r.bond < minBond) {
                    r.active = false;
                    totalStake -= r.bond;
                }
                f.pool += amount;
                ++outliers;
                emit Slashed(feedId, who[i], roundId, prices[i], median, amount);
            } else {
                r.accepted += 1;
                uint128 pay = f.reward < f.pool ? f.reward : f.pool;
                f.pool -= pay;
                r.earned += pay;
            }
        }

        Round storage rd = rounds[feedId][roundId];
        (rd.answer, rd.mad, rd.updatedAt, rd.reports, rd.outliers) = (median, mad, uint64(block.timestamp), n, outliers);
        f.latestRound = roundId;
        delete pendingWho[feedId];
        delete pendingPrice[feedId];
        emit RoundFinalized(feedId, roundId, median, mad, n, outliers);
    }

    // ---------------------------------------------------------------- reads

    function latestRoundData(uint256 feedId)
        external
        view
        returns (uint80 roundId, int256 answer, uint256 startedAt, uint256 updatedAt, uint80 answeredInRound)
    {
        return getRoundData(feedId, _feed(feedId).latestRound);
    }

    function getRoundData(uint256 feedId, uint64 roundId)
        public
        view
        returns (uint80, int256, uint256, uint256, uint80)
    {
        Round storage rd = rounds[feedId][roundId];
        if (rd.updatedAt == 0) revert NoData();
        return (roundId, int256(uint256(rd.answer)), rd.startedAt, rd.updatedAt, roundId);
    }

    /// @notice Time-weighted average over the last `window` rounds (max 16).
    function twap(uint256 feedId, uint8 window) external view returns (uint128) {
        uint64 latest = _feed(feedId).latestRound;
        if (latest == 0) revert NoData();
        if (window == 0 || window > HISTORY) window = uint8(HISTORY);
        if (window > latest) window = uint8(latest);
        uint256 acc;
        uint256 total;
        uint64 end = uint64(block.timestamp);
        for (uint64 i; i < window; ++i) {
            Round storage rd = rounds[feedId][latest - i];
            uint256 dt = end > rd.updatedAt ? end - rd.updatedAt : 1;
            acc += rd.answer * dt;
            total += dt;
            end = rd.updatedAt;
        }
        return uint128(acc / total);
    }

    /// @notice Stake an attacker must control to publish a false price: 4/9 of active stake.
    function corruptionCost() public view returns (uint128) {
        return uint128(uint256(totalStake) * 4 / 9);
    }

    function feed(uint256 feedId) external view returns (Feed memory) {
        return _feed(feedId);
    }

    function feedCount() external view returns (uint256) {
        return feeds.length;
    }

    function round(uint256 feedId, uint64 roundId) external view returns (Round memory) {
        return rounds[feedId][roundId];
    }

    function reporterSet() external view returns (address[] memory) {
        return reporterList;
    }

    function pending(uint256 feedId) external view returns (address[] memory) {
        return pendingWho[feedId];
    }

    function _feed(uint256 feedId) internal view returns (Feed storage) {
        if (feedId >= feeds.length) revert UnknownFeed();
        return feeds[feedId];
    }
}
