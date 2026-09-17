import type { ChainClient } from "../types.ts";
import { lamportsToSol } from "../units.ts";
import { postJson } from "./http.ts";

/**
 * Solana via the public mainnet JSON-RPC (keyless). Verified 2026-09-16
 * (see resources/06-implementation-resources.md).
 */
const RPC_URL = "https://api.mainnet-beta.solana.com";

interface RpcResponse<T> {
  result?: T;
  error?: { code: number; message: string };
}

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  const res = await postJson<RpcResponse<T>>(RPC_URL, { jsonrpc: "2.0", id: 1, method, params });
  if (res.error) throw new Error(`solana rpc ${method}: ${res.error.message}`);
  if (res.result === undefined) throw new Error(`solana rpc ${method}: empty response`);
  return res.result;
}

export const solana: ChainClient = {
  chain: "solana",

  async fetchActivity(address) {
    const [balance, signatures] = await Promise.all([
      rpc<{ value: number }>("getBalance", [address]),
      // Newest signature only — blockTime is Unix seconds, or null while unconfirmed.
      rpc<Array<{ blockTime: number | null }>>("getSignaturesForAddress", [address, { limit: 1 }]),
    ]);

    const newest = signatures.find((sig) => sig.blockTime !== null);
    return {
      balance: lamportsToSol(balance.value),
      currency: "SOL",
      // The RPC has no total-count endpoint (signatures page 1000 at a time,
      // unbounded) — an empty cell is more honest than a capped guess.
      txCount: null,
      lastSeen: newest?.blockTime != null ? new Date(newest.blockTime * 1000).toISOString() : null,
    };
  },
};
