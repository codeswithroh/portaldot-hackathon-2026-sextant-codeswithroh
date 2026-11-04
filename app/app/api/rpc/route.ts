import { EVM_RPC } from "@/lib/chain";

// The testnet RPC doesn't always send CORS headers, so the browser talks to it through here.
export async function POST(req: Request) {
  const res = await fetch(EVM_RPC, { method: "POST", headers: { "content-type": "application/json" }, body: await req.text(), cache: "no-store" });
  return new Response(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}
