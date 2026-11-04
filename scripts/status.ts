import { decodeEventLog, formatEther } from "viem";
import { coreAbi, deployments } from "./abi.ts";
import { publicClient } from "./lib.ts";

// Prints the latest round and the events from a given tx: npx tsx status.ts [txHash]
const core = deployments.SextantCore.address;
const r = await publicClient.readContract({ address: core, abi: coreAbi, functionName: "latestRoundData", args: [0n] });
console.log("latestRoundData", r);
console.log("totalStake", formatEther(await publicClient.readContract({ address: core, abi: coreAbi, functionName: "totalStake" }) as bigint));
console.log("corruptionCost", formatEther(await publicClient.readContract({ address: core, abi: coreAbi, functionName: "corruptionCost" }) as bigint));
const tx = process.argv[2] as `0x${string}` | undefined;
if (tx) {
  const rc = await publicClient.getTransactionReceipt({ hash: tx });
  console.log("block", rc.blockNumber, "gasUsed", rc.gasUsed, "status", rc.status);
  for (const l of rc.logs) {
    try { const e = decodeEventLog({ abi: coreAbi, ...l }); console.log(e.eventName, e.args); } catch {}
  }
}
