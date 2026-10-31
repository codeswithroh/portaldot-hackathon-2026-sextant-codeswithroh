import { parseEther } from "viem";
import { coreAbi, deployments } from "./abi.ts";
import { evmAccount, publicClient, walletClient } from "./lib.ts";

// Funds the five reporter keys (mnemonic indexes 1-5) and bonds them.
const BOND = parseEther("20");
const GAS = parseEther("30");
const core = deployments.SextantCore.address;
const owner = walletClient(0);

for (let i = 1; i <= 5; i++) {
  const a = evmAccount(i).address;
  const have = await publicClient.getBalance({ address: a });
  if (have < BOND + GAS) {
    const hash = await owner.sendTransaction({ to: a, value: BOND + GAS - have });
    await publicClient.waitForTransactionReceipt({ hash });
  }
  const hash = await walletClient(i).writeContract({ address: core, abi: coreAbi, functionName: "join", value: BOND });
  await publicClient.waitForTransactionReceipt({ hash });
  console.log(`reporter ${i}`, a, hash);
}
const hash = await owner.writeContract({ address: core, abi: coreAbi, functionName: "fundFeed", args: [0n], value: parseEther("20") });
await publicClient.waitForTransactionReceipt({ hash });
console.log("feed funded", hash);
