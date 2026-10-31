import { coreAbi, deployments } from "./abi.ts";
import { publicClient, walletClient } from "./lib.ts";
for (let i = 1; i <= 5; i++) {
  const hash = await walletClient(i).writeContract({ address: deployments.SextantCore.address, abi: coreAbi, functionName: "requestLeave" });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log("left", i);
}
