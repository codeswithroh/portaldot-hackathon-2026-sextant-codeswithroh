// SPDX-License-Identifier: Apache-2.0
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {SextantCore} from "../src/SextantCore.sol";
import {SextantFeed} from "../src/SextantFeed.sol";
import {MathRef} from "./MathRef.sol";

contract SextantCoreTest is Test {
    SextantCore core;
    SextantFeed btc;
    address[5] reps;

    function setUp() public {
        core = new SextantCore(new MathRef(), 10 ether, 5, 250, 30, 2_000);
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
        (,uint128 earned,,,) = core.reporters(reps[0]);
        assertEq(earned, 0.1 ether);
    }

    function test_liarIsSlashedAndFeedHolds() public {
        _round(1, [uint128(100_000e8), 150_000e8, 100_200e8, 99_900e8, 100_100e8]);
        (, int256 answer,,,) = btc.latestRoundData();
        assertEq(answer, 100_100e8);
        (uint128 bond,,, uint32 strikes, bool active) = core.reporters(reps[1]);
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

    function test_leaveRefundsBondAndRewards() public {
        _round(1, [uint128(100), 100, 100, 100, 100]);
        uint256 before = reps[0].balance;
        vm.prank(reps[0]);
        core.leave();
        assertEq(reps[0].balance - before, 10.1 ether);
    }
}
