"use client";
import { useEffect, useState } from "react";
import { formatEther, type Address } from "viem";
import { addresses, blockAge, client, coreAbi, events, lendAbi } from "./chain";

/** Reporters join in this order (scripts/setup-reporters.ts), one exchange each. */
export const EXCHANGES = ["Coinbase", "Kraken", "Bitstamp", "Gemini", "Bitfinex"];
export const PALETTE = ["#2978ac", "#ab5a4b", "#3f8f6b", "#b08a2e", "#6a5fa8", "#4f6b7d"];

export type ReporterRow = { address: Address; name: string; color: string; bond: number; earned: number; accepted: number; strikes: number; active: boolean; lastPrice?: number };
export type RoundRow = { round: number; price: number; mad: number; reports: number; outliers: number; block: number; time: number; tx: string };
export type Kind = "published" | "slashed" | "frozen" | "submitted";
export type Activity = { kind: Kind; round: number; block: number; time: number; tx: string; who?: string; color?: string; price?: number; amount?: number; flagged?: number; roundStake?: number; median?: number; mad?: number };
export type Attempt = { round: number; outcome: "published" | "slashed" | "frozen"; block: number; time: number; price?: number };
export type Submission = { round: number; reporter: Address; price: number; block: number };

export type Live = {
  loading: boolean;
  error?: string;
  head?: { number: bigint; age: number };
  stake?: number;
  cost?: number;
  debt?: number;
  room?: number;
  liquidity?: number;
  pool?: number;
  reward?: number;
  price?: number;
  updatedAt?: number;
  reporters: ReporterRow[];
  rounds: RoundRow[];
  attempts: Attempt[];
  activity: Activity[];
  submissions: Submission[];
};

const tpot = (v: bigint) => Number(formatEther(v));
const usd = (v: bigint) => Number(v) / 1e8;

async function load(): Promise<Partial<Live>> {
  const head = await blockAge();
  const core = addresses.SextantCore?.address;
  if (!core) return { head };
  const fromBlock = head.number > 20_000n ? head.number - 20_000n : 0n;
  const [stake, cost, set, feed, latest, rounds, slashed, contested, submitted, past] = await Promise.all([
    client.readContract({ address: core, abi: coreAbi, functionName: "totalStake" }),
    client.readContract({ address: core, abi: coreAbi, functionName: "corruptionCost" }),
    client.readContract({ address: core, abi: coreAbi, functionName: "reporterSet" }),
    client.readContract({ address: core, abi: coreAbi, functionName: "feed", args: [0n] }).catch(() => null),
    client.readContract({ address: core, abi: coreAbi, functionName: "latestRoundData", args: [0n] }).catch(() => null),
    client.getLogs({ address: core, event: events.round, fromBlock }),
    client.getLogs({ address: core, event: events.slashed, fromBlock }),
    client.getLogs({ address: core, event: events.contested, fromBlock }),
    client.getLogs({ address: core, event: events.submitted, fromBlock }),
    client.getBlock({ blockNumber: head.number > 200n ? head.number - 200n : 0n }),
  ]);

  // Estimate event times from the average block time instead of one RPC call per block.
  const span = Number(head.number - past.number) || 1;
  const blockTime = (head.time - Number(past.timestamp)) / span;
  const at = (b: bigint | null) => Math.round(head.time - Number(head.number - (b ?? head.number)) * blockTime);

  const named = new Map(set.map((a, i) => [a.toLowerCase(), { name: EXCHANGES[i] ?? `Reporter ${i + 1}`, color: PALETTE[i % PALETTE.length] }]));
  const who = (a: string) => named.get(a.toLowerCase()) ?? { name: a.slice(0, 8), color: "#8796a3" };

  const submissions: Submission[] = submitted.map((l) => ({ round: Number(l.args.roundId), reporter: l.args.reporter!, price: usd(l.args.price!), block: Number(l.blockNumber) }));
  const lastPrice = new Map<string, number>();
  for (const s of submissions) lastPrice.set(s.reporter.toLowerCase(), s.price);

  const reporters = await Promise.all(
    set.map(async (address): Promise<ReporterRow> => {
      const [bond, earned, accepted, strikes, active] = await client.readContract({ address: core, abi: coreAbi, functionName: "reporters", args: [address] });
      return { address, ...who(address), bond: tpot(bond), earned: tpot(earned), accepted: Number(accepted), strikes, active, lastPrice: lastPrice.get(address.toLowerCase()) };
    }),
  );

  const lend = addresses.MiniLend?.address;
  const [debt, room, liquidity] = lend
    ? await Promise.all([
        client.readContract({ address: lend, abi: lendAbi, functionName: "totalDebt" }),
        client.readContract({ address: lend, abi: lendAbi, functionName: "securityRoom" }),
        client.getBalance({ address: lend }),
      ])
    : [undefined, undefined, undefined];

  const roundRows: RoundRow[] = rounds.map((l) => ({
    round: Number(l.args.roundId), price: usd(l.args.answer!), mad: usd(l.args.mad!), reports: l.args.reports!, outliers: l.args.outliers!,
    block: Number(l.blockNumber), time: at(l.blockNumber), tx: l.transactionHash,
  }));
  const slashedRounds = new Set(slashed.map((l) => Number(l.args.roundId)));

  const activity: Activity[] = [
    ...roundRows.map((r): Activity => ({ kind: "published", round: r.round, block: r.block, time: r.time, tx: r.tx, price: r.price, mad: r.mad })),
    ...slashed.map((l): Activity => ({ kind: "slashed", round: Number(l.args.roundId), block: Number(l.blockNumber), time: at(l.blockNumber), tx: l.transactionHash, ...who(l.args.reporter!), who: who(l.args.reporter!).name, price: usd(l.args.price!), median: usd(l.args.median!), amount: tpot(l.args.amount!) })),
    ...contested.map((l): Activity => ({ kind: "frozen", round: Number(l.args.roundId), block: Number(l.blockNumber), time: at(l.blockNumber), tx: l.transactionHash, flagged: tpot(l.args.flaggedStake!), roundStake: tpot(l.args.roundStake!), median: usd(l.args.median!) })),
    ...submitted.map((l): Activity => ({ kind: "submitted", round: Number(l.args.roundId), block: Number(l.blockNumber), time: at(l.blockNumber), tx: l.transactionHash, ...who(l.args.reporter!), who: who(l.args.reporter!).name, price: usd(l.args.price!) })),
  ].sort((a, b) => b.block - a.block || rank(a.kind) - rank(b.kind));

  const attempts: Attempt[] = [
    ...roundRows.map((r): Attempt => ({ round: r.round, outcome: slashedRounds.has(r.round) ? "slashed" : "published", block: r.block, time: r.time, price: r.price })),
    ...contested.map((l): Attempt => ({ round: Number(l.args.roundId), outcome: "frozen", block: Number(l.blockNumber), time: at(l.blockNumber) })),
  ].sort((a, b) => a.block - b.block);

  return {
    head,
    stake: tpot(stake),
    cost: tpot(cost),
    debt: debt === undefined ? undefined : tpot(debt),
    room: room === undefined ? undefined : tpot(room),
    liquidity: liquidity === undefined ? undefined : tpot(liquidity),
    pool: feed ? tpot(feed.pool) : undefined,
    reward: feed ? tpot(feed.reward) : undefined,
    price: latest ? usd(latest[1] as unknown as bigint) : undefined,
    updatedAt: latest ? Number(latest[3]) : undefined,
    reporters,
    rounds: roundRows,
    attempts,
    activity,
    submissions,
  };
}

// Within one block, show the outcome above the submit that caused it.
const rank = (k: Kind) => ({ slashed: 0, frozen: 0, published: 1, submitted: 2 })[k];

export function useSextant(): Live {
  const [state, set] = useState<Live>({ loading: true, reporters: [], rounds: [], attempts: [], activity: [], submissions: [] });
  useEffect(() => {
    let live = true;
    const tick = () =>
      load()
        .then((d) => live && set((s) => ({ ...s, ...d, loading: false, error: undefined })))
        .catch((e) => live && set((s) => ({ ...s, loading: false, error: e.shortMessage ?? e.message })));
    tick();
    const id = setInterval(tick, 12_000);
    return () => {
      live = false;
      clearInterval(id);
    };
  }, []);
  return state;
}
