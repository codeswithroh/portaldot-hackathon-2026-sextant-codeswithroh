import { readFileSync, writeFileSync } from "node:fs";
import { encodeDeployData, formatEther, parseEther, toHex, type Abi } from "viem";
import { evmAccount, publicClient, walletClient } from "./lib.ts";

// Deploys SextantMath (ink!), SextantCore, the BTC/USD SextantFeed and MiniLend through the Ethereum RPC.
const root = new URL("../", import.meta.url);
const read = (p: string) => readFileSync(new URL(p, root));
const wallet = walletClient();
const out: Record<string, { address: string; tx: string; block: number }> = {};

async function deploy(name: string, data: `0x${string}`) {
  const hash = await wallet.sendTransaction({ data });
  const r = await publicClient.waitForTransactionReceipt({ hash });
  if (r.status !== "success" || !r.contractAddress) throw new Error(`${name} failed: ${hash}`);
  console.log(name.padEnd(12), r.contractAddress, hash);
  out[name] = { address: r.contractAddress, tx: hash, block: Number(r.blockNumber) };
  return r.contractAddress;
}

function artifact(name: string) {
  const j = JSON.parse(read(`contracts/evm/out/${name}.sol/${name}.json`).toString());
  return { abi: j.abi as Abi, bytecode: j.bytecode.object as `0x${string}` };
}

const before = await publicClient.getBalance({ address: evmAccount().address });
const math = await deploy("SextantMath", toHex(read("contracts/math/target/ink/sextant_math.polkavm")));

const coreA = artifact("SextantCore");
const core = await deploy(
  "SextantCore",
  encodeDeployData({ ...coreA, args: [math, parseEther("10"), 3, 250n, 30n, 2_000n, 3600n] }),
);

const hash = await wallet.writeContract({
  address: core,
  abi: coreA.abi,
  functionName: "createFeed",
  args: ["BTC / USD", 8, parseEther("0.01")],
});
await publicClient.waitForTransactionReceipt({ hash });
console.log("createFeed  ", hash);

const feedA = artifact("SextantFeed");
const feed = await deploy("SextantFeed", encodeDeployData({ ...feedA, args: [core, 0n] }));

const lendA = artifact("MiniLend");
await deploy("MiniLend", encodeDeployData({ ...lendA, args: [core, feed] }));

const after = await publicClient.getBalance({ address: evmAccount().address });
console.log("spent", formatEther(before - after), "tPOT, left", formatEther(after));
writeFileSync(new URL("deployments.json", root), JSON.stringify(out, null, 2) + "\n");
