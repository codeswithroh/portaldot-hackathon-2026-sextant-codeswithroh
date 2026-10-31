import { parseEther, formatEther } from "viem";
import { evmAccount, publicClient, walletClient } from "./lib.ts";

// Keeps reporter keys above the upfront balance a submit needs (~24 tPOT per tx, mostly refunded).
const target = parseEther(process.argv[2] ?? "60");
for (let i = 1; i <= 5; i++) {
  const a = evmAccount(i).address;
  const have = await publicClient.getBalance({ address: a });
  if (have < target) {
    const hash = await walletClient(0).sendTransaction({ to: a, value: target - have });
    await publicClient.waitForTransactionReceipt({ hash });
  }
  console.log(i, formatEther(await publicClient.getBalance({ address: a })));
}
