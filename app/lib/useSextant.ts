"use client";
import { useEffect, useState } from "react";
import { formatEther, type Address } from "viem";
import { addresses, blockAge, client, coreAbi, events, lendAbi } from "./chain";

export type ReporterRow = { address: Address; bond: number; earned: number; accepted: number; strikes: number; active: boolean };
export type RoundRow = { round: number; price: number; reports: number; outliers: number; block: number };
export type EventRow = { kind: "slashed" | "contested"; round: number; detail: string; tx: string };

export type Live = {
  loading: boolean;
  error?: string;
  head?: { number: bigint; age: number };
  stake?: number;
  cost?: number;
  debt?: number;
  room?: number;
  price?: number;
  updatedAt?: number;
  reporters: ReporterRow[];
  rounds: RoundRow[];
  incidents: EventRow[];
};

const tpot = (v: bigint) => Number(formatEther(v));
const usd = (v: bigint) => Number(v) / 1e8;

async function load(): Promise<Partial<Live>> {
  const head = await blockAge();
  const core = addresses.SextantCore?.address;
  if (!core) return { head };
  const [stake, cost, set] = await Promise.all([
    client.readContract({ address: core, abi: coreAbi, functionName: "totalStake" }),
    client.readContract({ address: core, abi: coreAbi, functionName: "corruptionCost" }),
    client.readContract({ address: core, abi: coreAbi, functionName: "reporterSet" }),
  ]);
  const reporters = await Promise.all(
    set.map(async (address): Promise<ReporterRow> => {
      const [bond, earned, accepted, strikes, active] = await client.readContract({ address: core, abi: coreAbi, functionName: "reporters", args: [address] });
      return { address, bond: tpot(bond), earned: tpot(earned), accepted: Number(accepted), strikes, active };
    }),
  );
  const fromBlock = head.number > 5000n ? head.number - 5000n : 0n;
  const [rounds, slashed, contested] = await Promise.all([
    client.getLogs({ address: core, event: events.round, fromBlock }),
    client.getLogs({ address: core, event: events.slashed, fromBlock }),
    client.getLogs({ address: core, event: events.contested, fromBlock }),
  ]);
  const latest = await client.readContract({ address: core, abi: coreAbi, functionName: "latestRoundData", args: [0n] }).catch(() => null);
  const lend = addresses.MiniLend?.address;
  const [debt, room] = lend
    ? await Promise.all([
        client.readContract({ address: lend, abi: lendAbi, functionName: "totalDebt" }),
        client.readContract({ address: lend, abi: lendAbi, functionName: "securityRoom" }),
      ])
    : [undefined, undefined];
  return {
    head,
    stake: tpot(stake),
    cost: tpot(cost),
    debt: debt === undefined ? undefined : tpot(debt),
    room: room === undefined ? undefined : tpot(room),
    price: latest ? usd(latest[1] as unknown as bigint) : undefined,
    updatedAt: latest ? Number(latest[3]) : undefined,
    reporters,
    rounds: rounds.map((l) => ({
      round: Number(l.args.roundId),
      price: usd(l.args.answer!),
      reports: l.args.reports!,
      outliers: l.args.outliers!,
      block: Number(l.blockNumber),
    })),
    incidents: [
      ...slashed.map((l): EventRow => ({
        kind: "slashed",
        round: Number(l.args.roundId),
        detail: `${l.args.reporter!.slice(0, 8)} lost ${tpot(l.args.amount!).toFixed(1)} tPOT for reporting $${usd(l.args.price!).toLocaleString()}`,
        tx: l.transactionHash,
      })),
      ...contested.map((l): EventRow => ({
        kind: "contested",
        round: Number(l.args.roundId),
        detail: `${tpot(l.args.flaggedStake!).toFixed(0)} of ${tpot(l.args.roundStake!).toFixed(0)} tPOT disagreed. Nothing published.`,
        tx: l.transactionHash,
      })),
    ].sort((a, b) => b.round - a.round),
  };
}

export function useSextant(): Live {
  const [state, set] = useState<Live>({ loading: true, reporters: [], rounds: [], incidents: [] });
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
