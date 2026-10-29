import { substrate, evmAccount, fallbackAccountId, publicClient, fmt } from "./lib.ts";

// Moves tPOT from the native sr25519 wallet to the EVM deployer's native account.
const amount = BigInt(process.argv[2] ?? "200") * 10n ** 14n;
const { api, signer } = await substrate();
const to = fallbackAccountId(evmAccount().address);
await new Promise<void>((done, fail) =>
  api.tx.balances.transferKeepAlive(to, amount).signAndSend(signer, ({ status, dispatchError, txHash }) => {
    if (dispatchError) return fail(new Error(dispatchError.toString()));
    if (status.isFinalized) {
      console.log("tx", txHash.toHex(), "finalized in", status.asFinalized.toHex());
      done();
    }
  }).catch(fail),
);
console.log("evm balance", fmt(await publicClient.getBalance({ address: evmAccount().address }), 18), "tPOT");
await api.disconnect();
