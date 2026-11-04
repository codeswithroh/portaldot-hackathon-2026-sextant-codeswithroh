import { formatEther, parseEther } from "viem";
import { deployments, lendAbi } from "./abi.ts";
import { publicClient, walletClient } from "./lib.ts";

// Funds MiniLend, then the deployer posts 0.001 synthetic BTC as collateral and borrows against the live feed.
// Usage: npx tsx lend-demo.ts <liquidity tPOT> <borrow tPOT>
const lend = deployments.MiniLend.address;
const [liq = "60", amt = "10"] = process.argv.slice(2);
const me = walletClient(0);
const send = async (hash: `0x${string}`, what: string) => {
  const r = await publicClient.waitForTransactionReceipt({ hash });
  console.log(what.padEnd(10), r.status, hash);
};

if (+liq > 0) await send(await me.sendTransaction({ to: lend, value: parseEther(liq) }), "fund");
await send(await me.writeContract({ address: lend, abi: lendAbi, functionName: "deposit", args: [parseEther("0.001")] }), "deposit");
await send(await me.writeContract({ address: lend, abi: lendAbi, functionName: "borrow", args: [parseEther(amt)] }), "borrow");
const room = await publicClient.readContract({ address: lend, abi: lendAbi, functionName: "securityRoom" }) as bigint;
console.log("security room left", formatEther(room), "tPOT");
