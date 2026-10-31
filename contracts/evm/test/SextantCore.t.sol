// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SextantCore} from "../src/SextantCore.sol";
import {SextantFeed} from "../src/SextantFeed.sol";
import {MathRef} from "./MathRef.sol";
import {MiniLend} from "../src/MiniLend.sol";

contract SextantCoreTest is Test {
    SextantCore core;
    SextantFeed btc;
    address[5] reps;

    function setUp() public {
        core = new SextantCore(new MathRef(), 10 ether, 3, 250, 30, 2_000, 1 hours);
        core.createFeed("BTC / USD", 8, 0.1 ether);
        core.fundFeed{value: 5 ether}(0);
        btc = new SextantFeed(core, 0);
        for (uint256 i; i < 5; ++i) {
            reps[i] = makeAddr(string.concat("reporter", vm.toString(i)));
            vm.deal(reps[i], 100 ether);
            vm.prank(reps[i]);
            core.join{value: 10 ether}();
        }
    }

    function _round(uint64 id, uint128[5] memory px) internal {
        for (uint256 i; i < 5; ++i) {
            if (core.feed(0).latestRound >= id) return; // closed early at 2/3 stake
            vm.prank(reps[i]);
            core.submit(0, id, px[i]);
        }
    }

    function test_roundFinalizesAtQuorumAndPaysReporters() public {
        vm.warp(1_000);
        _round(1, [uint128(100_000e8), 100_010e8, 99_990e8, 100_005e8, 99_995e8]);
        (uint80 id, int256 answer,, uint256 updatedAt,) = btc.latestRoundData();
        assertEq(id, 1);
        assertEq(answer, 100_000e8);
        assertEq(updatedAt, 1_000);
        assertEq(btc.description(), "BTC / USD");
        assertEq(btc.decimals(), 8);
        (,uint128 earned,,,,) = core.reporters(reps[0]);
        assertEq(earned, 0.1 ether);
    }

    function test_liarIsSlashedAndFeedHolds() public {
        _round(1, [uint128(100_000e8), 150_000e8, 100_200e8, 99_900e8, 100_100e8]);
        (, int256 answer,,,) = btc.latestRoundData();
        assertEq(answer, 100_000e8); // closed on the first 4 of 5, lower median
        (uint128 bond,,, uint32 strikes, bool active,) = core.reporters(reps[1]);
        assertEq(bond, 8 ether);
        assertEq(strikes, 1);
        assertFalse(active); // bond fell below minBond
        vm.prank(reps[1]);
        vm.expectRevert(SextantCore.NotReporter.selector);
        core.submit(0, 2, 1);
    }

    function test_rejectsBadSubmissions() public {
        vm.startPrank(reps[0]);
        vm.expectRevert(SextantCore.WrongRound.selector);
        core.submit(0, 2, 1);
        vm.expectRevert(SextantCore.ZeroPrice.selector);
        core.submit(0, 1, 0);
        core.submit(0, 1, 5);
        vm.expectRevert(SextantCore.AlreadySubmitted.selector);
        core.submit(0, 1, 5);
        vm.stopPrank();
        vm.expectRevert(SextantCore.NotReporter.selector);
        core.submit(0, 1, 5);
    }

    function test_twapAcrossRounds() public {
        vm.warp(100);
        _round(1, [uint128(100), 100, 100, 100, 100]);
        vm.warp(130);
        _round(2, [uint128(200), 200, 200, 200, 200]);
        vm.warp(140);
        assertEq(core.twap(0, 2), (100 * 30 + 200 * 10) / 40);
    }

    function test_leaveLocksBondUntilDelayPasses() public {
        _round(1, [uint128(100), 100, 100, 100, 100]);
        uint256 before = reps[0].balance;
        vm.startPrank(reps[0]);
        core.requestLeave();
        assertEq(core.totalStake(), 40 ether);
        vm.expectRevert(SextantCore.StillLocked.selector);
        core.withdraw();
        skip(1 hours);
        core.withdraw();
        vm.stopPrank();
        assertEq(reps[0].balance - before, 10.1 ether);
    }

    function test_twoLiarsInFiveFreezeTheRoundAndNobodyIsSlashed() public {
        uint128 lie = 150_000e8;
        uint128[4] memory px = [lie, lie, 100_000e8, 100_100e8];
        for (uint256 i; i < 4; ++i) {
            vm.prank(reps[i]);
            core.submit(0, 1, px[i]);
        }
        assertEq(core.feed(0).latestRound, 0);
        assertEq(core.pending(0).length, 0);
        (uint128 bond,,,,,) = core.reporters(reps[2]);
        assertEq(bond, 10 ether);
        (bond,,,,,) = core.reporters(reps[0]);
        assertEq(bond, 10 ether);
    }

    function test_corruptionCostIsFourNinthsOfStake() public view {
        assertEq(core.corruptionCost(), uint128(uint256(50 ether) * 4 / 9));
    }

    function test_attackerWithLessStakeThanCostCannotMovePrice() public {
        // Honest stake 50. Attacker brings 39.9 total, just under 4/9 of 89.9.
        address a = makeAddr("attacker");
        vm.deal(a, 100 ether);
        vm.prank(a);
        core.join{value: 39.9 ether}();
        vm.prank(a);
        core.submit(0, 1, 500_000e8);
        for (uint256 i; i < 2; ++i) {
            vm.prank(reps[i]);
            core.submit(0, 1, 100_000e8);
        }
        assertEq(core.feed(0).latestRound, 0, "needs 2/3 stake");
        vm.prank(reps[2]);
        core.submit(0, 1, 100_000e8);
        assertEq(core.feed(0).latestRound, 0, "contested, not published");
        assertEq(core.pending(0).length, 0);
    }

    function test_lendingCapFollowsCorruptionCost() public {
        MiniLend lend = new MiniLend(core, btc);
        vm.deal(address(lend), 1_000 ether);
        _round(1, [uint128(100_000e8), 100_000e8, 100_000e8, 100_000e8, 100_000e8]);
        address u = makeAddr("user");
        vm.startPrank(u);
        lend.deposit(1 ether);
        uint256 cap = core.corruptionCost();
        vm.expectRevert(MiniLend.OverSecurityCap.selector);
        lend.borrow(cap + 1);
        lend.borrow(cap);
        vm.stopPrank();
        assertEq(u.balance, cap);
        vm.warp(block.timestamp + 16 minutes);
        vm.expectRevert(MiniLend.StalePrice.selector);
        lend.price();
    }
}
