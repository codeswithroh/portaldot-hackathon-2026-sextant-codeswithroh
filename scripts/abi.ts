import { existsSync, readFileSync } from "node:fs";
import type { Abi, Address } from "viem";

const root = new URL("../", import.meta.url);
const out = (n: string) => JSON.parse(readFileSync(new URL(`contracts/evm/out/${n}.sol/${n}.json`, root), "utf8")).abi as Abi;

export const coreAbi = out("SextantCore");
export const lendAbi = out("MiniLend");
const file = new URL("deployments.json", root);
export const deployments = (existsSync(file) ? JSON.parse(readFileSync(file, "utf8")) : {}) as Record<string, { address: Address }>;
