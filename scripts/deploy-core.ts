import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { encodeDeployData, parseEther, toHex } from "viem";
import { publicClient, walletClient } from "./lib.ts";

// Deploys the ink! v6 SextantCore PolkaVM blob through the Ethereum RPC.
const dir = new URL("../contracts/core/target/ink/", import.meta.url);
const abi = JSON.parse(readFileSync(new URL("sextant_core.abi", dir), "utf8"));
const code = toHex(readFileSync(new URL("sextant_core.polkavm", dir)));

const MIN_BOND = parseEther("10"); // 10 tPOT
const QUORUM = 3;
const OUTLIER_BPS = 250n; // 2.5% from the median
const SLASH_BPS = 2_000n; // lose 20% of the bond per strike

const wallet = walletClient();
const data = encodeDeployData({ abi, bytecode: code, args: [MIN_BOND, QUORUM, OUTLIER_BPS, SLASH_BPS] });
const hash = await wallet.sendTransaction({ data });
console.log("deploy tx", hash);
const rcpt = await publicClient.waitForTransactionReceipt({ hash });
console.log("status", rcpt.status, "SextantCore at", rcpt.contractAddress, "gasUsed", rcpt.gasUsed);

const file = new URL("../deployments.json", import.meta.url);
const d = existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {};
d.SextantCore = { address: rcpt.contractAddress, tx: hash, block: Number(rcpt.blockNumber), params: { MIN_BOND: MIN_BOND.toString(), QUORUM, OUTLIER_BPS: Number(OUTLIER_BPS), SLASH_BPS: Number(SLASH_BPS) } };
writeFileSync(file, JSON.stringify(d, null, 2) + "\n");
