import { coreAbi } from "./abi.ts";
import { publicClient, walletClient } from "./lib.ts";
import v1 from "../docs/deployments.v1.json" with { type: "json" };

// Pulls bonds back out of the abandoned v1 core after the unbonding delay.
const core = v1.SextantCore.address as `0x${string}`;
for (let i = 1; i <= 5; i++) {
  try {
    const hash = await walletClient(i).writeContract({ address: core, abi: coreAbi, functionName: "withdraw" });
    const r = await publicClient.waitForTransactionReceipt({ hash });
    console.log("withdrew", i, r.status, hash);
  } catch (e) {
    console.log("skip", i, (e as Error).message.split("\n")[0]);
  }
}
