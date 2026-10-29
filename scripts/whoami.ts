import { substrate, evmAccount, fallbackAccountId, nativeToH160, publicClient, fmt } from "./lib.ts";

const { api, signer } = await substrate();
const evm = evmAccount();
const evmFallback = fallbackAccountId(evm.address);

const native = (await api.query.system.account(signer.address)) as any;
const fallback = (await api.query.system.account(evmFallback)) as any;
const evmBal = await publicClient.getBalance({ address: evm.address });

console.log("chain              ", (await api.rpc.system.chain()).toString());
console.log("native (sr25519)   ", signer.address, "free", fmt(native.data.free.toBigInt()), "tPOT");
console.log("  mapped H160      ", nativeToH160(signer.publicKey));
console.log("evm deployer (eth) ", evm.address, "balance", fmt(evmBal, 18), "tPOT");
console.log("  as native account", evmFallback, "free", fmt(fallback.data.free.toBigInt()), "tPOT");
await api.disconnect();
