import { createPublicClient, defineChain, http, parseAbi, parseAbiItem, type Address } from "viem";
import deployments from "./deployments.json";

export const EVM_RPC = "https://test-evm-rpc-v3.portaldot.dev";
export const NODE_RPC = "https://test-node-v3.portaldot.dev";

const chain = defineChain({
  id: 420420777,
  name: "PortaldotV3 Testnet",
  nativeCurrency: { name: "tPOT", symbol: "tPOT", decimals: 18 },
  rpcUrls: { default: { http: [EVM_RPC] } },
});

export const client = createPublicClient({ chain, transport: http(EVM_RPC) });

export const addresses = deployments as Partial<Record<"SextantMath" | "SextantCore" | "SextantFeed" | "MiniLend", { address: Address; tx: string }>>;

export const coreAbi = parseAbi([
  "function totalStake() view returns (uint128)",
  "function corruptionCost() view returns (uint128)",
  "function reporterSet() view returns (address[])",
  "function reporters(address) view returns (uint128 bond, uint128 earned, uint64 accepted, uint32 strikes, bool active, uint64 unlockAt)",
  "function latestRoundData(uint256) view returns (uint80, int256, uint256, uint256, uint80)",
  "function pending(uint256) view returns (address[])",
]);
export const lendAbi = parseAbi([
  "function totalDebt() view returns (uint256)",
  "function securityRoom() view returns (uint256)",
]);

export const events = {
  round: parseAbiItem("event RoundFinalized(uint256 indexed feedId, uint64 roundId, uint128 answer, uint128 mad, uint8 reports, uint8 outliers)"),
  slashed: parseAbiItem("event Slashed(uint256 indexed feedId, address indexed reporter, uint64 roundId, uint128 price, uint128 median, uint128 amount)"),
  contested: parseAbiItem("event RoundContested(uint256 indexed feedId, uint64 roundId, uint128 median, uint128 flaggedStake, uint128 roundStake)"),
};

/** Seconds since the last block, or null if the node can't be reached. */
export async function blockAge() {
  const block = await client.getBlock();
  return { number: block.number, age: Math.max(0, Math.floor(Date.now() / 1000) - Number(block.timestamp)) };
}
