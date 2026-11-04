// One independent exchange per reporter, so a single API going bad can't sway the median.
type Source = { name: string; url: string; pick: (j: any) => string | number };

export const sources: Source[] = [
  { name: "Coinbase", url: "https://api.exchange.coinbase.com/products/BTC-USD/ticker", pick: (j) => j.price },
  { name: "Kraken", url: "https://api.kraken.com/0/public/Ticker?pair=XBTUSD", pick: (j) => (Object.values(j.result)[0] as any).c[0] },
  { name: "Bitstamp", url: "https://www.bitstamp.net/api/v2/ticker/btcusd/", pick: (j) => j.last },
  { name: "Gemini", url: "https://api.gemini.com/v1/pubticker/btcusd", pick: (j) => j.last },
  { name: "Bitfinex", url: "https://api-pub.bitfinex.com/v2/ticker/tBTCUSD", pick: (j) => j[6] },
];

/** BTC/USD with 8 decimals. */
export async function fetchPrice(s: Source, tries = 3): Promise<bigint> {
  try {
    return await fetchOnce(s);
  } catch (e) {
    if (tries <= 1) throw e;
    await new Promise((r) => setTimeout(r, 1500));
    return fetchPrice(s, tries - 1);
  }
}

async function fetchOnce(s: Source): Promise<bigint> {
  const res = await fetch(s.url, { signal: AbortSignal.timeout(8_000), headers: { "user-agent": "sextant-reporter" } });
  if (!res.ok) throw new Error(`${s.name} ${res.status}`);
  const n = Number(s.pick(await res.json()));
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${s.name} bad price`);
  return BigInt(Math.round(n * 1e8));
}
