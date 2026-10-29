import "dotenv/config";
import { config } from "dotenv";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { ApiPromise, WsProvider } from "@polkadot/api";
import { Keyring } from "@polkadot/keyring";
import { cryptoWaitReady, encodeAddress, keccakAsU8a } from "@polkadot/util-crypto";
import { u8aToHex, hexToU8a } from "@polkadot/util";
import { mnemonicToAccount } from "viem/accounts";
import { createPublicClient, createWalletClient, defineChain, http } from "viem";

const here = dirname(fileURLToPath(import.meta.url));
config({ path: resolve(here, "../.env") });

export const env = {
  mnemonic: must("MNEMONIC"),
  nodeWs: process.env.NODE_WS ?? "wss://test-node-v3.portaldot.dev",
  evmRpc: process.env.EVM_RPC ?? "https://test-evm-rpc-v3.portaldot.dev",
  chainId: Number(process.env.CHAIN_ID ?? 420420777),
};

function must(k: string): string {
  const v = process.env[k];
  if (!v) throw new Error(`missing ${k} in .env`);
  return v;
}

export const portaldot = defineChain({
  id: env.chainId,
  name: "PortaldotV3 Testnet",
  nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
  rpcUrls: { default: { http: [env.evmRpc] } },
});

// Native tPOT has 14 decimals; the eth-rpc view scales balances to 18.
export const NATIVE_DECIMALS = 14;

export async function substrate() {
  await cryptoWaitReady();
  const api = await ApiPromise.create({ provider: new WsProvider(env.nodeWs), noInitWarn: true });
  const keyring = new Keyring({ type: "sr25519", ss58Format: 42 });
  const signer = keyring.addFromMnemonic(env.mnemonic);
  return { api, signer };
}

export function evmAccount(index = 0) {
  return mnemonicToAccount(env.mnemonic, { addressIndex: index });
}

export const publicClient = createPublicClient({ chain: portaldot, transport: http(env.evmRpc) });

export function walletClient(index = 0) {
  return createWalletClient({ account: evmAccount(index), chain: portaldot, transport: http(env.evmRpc) });
}

// pallet-revive: an Ethereum-derived H160 maps to AccountId32 = h160 ++ 0xEE * 12.
export function fallbackAccountId(h160: `0x${string}`): string {
  const bytes = new Uint8Array(32).fill(0xee);
  bytes.set(hexToU8a(h160), 0);
  return encodeAddress(bytes, 42);
}

// pallet-revive: a native AccountId32 maps to keccak256(id)[12..] once `map_account` is called.
export function nativeToH160(pubkey: Uint8Array): `0x${string}` {
  return u8aToHex(keccakAsU8a(pubkey).slice(12)) as `0x${string}`;
}

export const fmt = (planck: bigint, decimals = NATIVE_DECIMALS) =>
  (Number(planck) / 10 ** decimals).toLocaleString(undefined, { maximumFractionDigits: 4 });
