// TypeScript port of the round rules in SextantMath (ink!) and SextantCore (Solidity).
export const OUTLIER_BPS = 250;
export const MAD_K = 30;

export type Report = { name: string; stake: number; price: number };
export type Outcome = "published" | "contested" | "open";
export type RoundResult = {
  outcome: Outcome;
  closedAfter: number;
  median: number;
  flagged: boolean[];
  flaggedStake: number;
  roundStake: number;
  totalStake: number;
};

export function weightedMedian(values: number[], weights: number[]) {
  const order = values.map((_, i) => i).sort((a, b) => values[a] - values[b]);
  const total = weights.reduce((a, b) => a + b, 0);
  let acc = 0;
  for (const i of order) {
    acc += weights[i];
    if (acc * 2 >= total) return values[i];
  }
  return values[order[order.length - 1]];
}

export const corruptionCost = (totalStake: number) => (totalStake * 4) / 9;

/** Reports arrive in array order; the round closes at 3+ reports holding 2/3 of total stake. */
export function runRound(reports: Report[]): RoundResult {
  const totalStake = reports.reduce((a, r) => a + r.stake, 0);
  const inRound: Report[] = [];
  let stake = 0;
  for (const r of reports) {
    inRound.push(r);
    stake += r.stake;
    if (inRound.length >= 3 && stake * 3 >= totalStake * 2) break;
  }
  const closed = inRound.length >= 3 && stake * 3 >= totalStake * 2;
  const prices = inRound.map((r) => r.price);
  const weights = inRound.map((r) => r.stake);
  const median = weightedMedian(prices, weights);
  const mad = weightedMedian(prices.map((p) => Math.abs(p - median)), weights);
  const flagged = reports.map((_, i) => {
    if (i >= inRound.length) return false;
    const dist = Math.abs(prices[i] - median);
    return (dist * 10_000) / median > OUTLIER_BPS && dist * 10 > mad * MAD_K;
  });
  const flaggedStake = weights.reduce((a, w, i) => a + (flagged[i] ? w : 0), 0);
  const outcome: Outcome = !closed ? "open" : flaggedStake * 3 > stake ? "contested" : "published";
  return { outcome, closedAfter: inRound.length, median, flagged, flaggedStake, roundStake: stake, totalStake };
}
