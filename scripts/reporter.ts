import { sources, fetchPrice } from "../reporter/sources.ts";
import { coreAbi, deployments } from "./abi.ts";
import { evmAccount, publicClient, walletClient } from "./lib.ts";

// Usage: tsx reporter.ts [--interval 60] [--lie 2,3] [--lie-pct 50] [--once] [--dry-run]
const arg = (k: string, d?: string) => {
  const i = process.argv.indexOf(`--${k}`);
  return i < 0 ? d : process.argv[i + 1];
};
const flag = (k: string) => process.argv.includes(`--${k}`);
const interval = Number(arg("interval", "60")) * 1000;
const liars = new Set((arg("lie", "") as string).split(",").filter(Boolean).map(Number));
const liePct = BigInt(arg("lie-pct", "50")!);
const core = !flag("dry-run") ? deployments.SextantCore.address : undefined;

async function tick() {
  const latest = core
    ? ((await publicClient.readContract({ address: core, abi: coreAbi, functionName: "feed", args: [0n] })) as any).latestRound
    : 0n;
  const round = BigInt(latest) + 1n;
  const quotes = await Promise.allSettled(sources.map(fetchPrice));
  for (let i = 0; i < sources.length; i++) {
    const q = quotes[i];
    if (q.status === "rejected") {
      console.log(`  ${sources[i].name}: skipped (${q.reason.message})`);
      continue;
    }
    const lying = liars.has(i + 1);
    const price = lying ? (q.value * (100n + liePct)) / 100n : q.value;
    const shown = `$${(Number(price) / 1e8).toFixed(2)}`;
    if (!core) {
      console.log(`  ${sources[i].name.padEnd(9)} ${shown}${lying ? "  LIE" : ""}`);
      continue;
    }
    try {
      const hash = await walletClient(i + 1).writeContract({
        address: core,
        abi: coreAbi,
        functionName: "submit",
        args: [0n, round, price],
      });
      await publicClient.waitForTransactionReceipt({ hash });
      console.log(`  r${i + 1} ${evmAccount(i + 1).address.slice(0, 8)} ${sources[i].name.padEnd(9)} ${shown}${lying ? "  LIE" : ""} ${hash}`);
    } catch (e: any) {
      // WrongRound just means the round closed at 2/3 stake before this reporter got in.
      console.log(`  r${i + 1} ${sources[i].name}: ${e.shortMessage ?? e.message}`.slice(0, 120));
    }
  }
}

do {
  console.log(new Date().toISOString(), "tick");
  await tick().catch((e) => console.log("tick failed:", e.message));
  if (flag("once")) break;
  await new Promise((r) => setTimeout(r, interval));
} while (true);
