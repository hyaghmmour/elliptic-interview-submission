import type { Activity } from "../types.ts";
import { weiToNative } from "../units.ts";
import { getJson } from "./http.ts";

/**
 * EVM fallback via the Etherscan v2 API — one key covers all chains via the
 * chainid param. Free tier, but needs an API key (ETHERSCAN_API_KEY) — so this
 * is never the default path; it only runs when Blockscout fails for a chain
 * and a key is configured.
 */
const BASE_URL = "https://api.etherscan.io/v2/api";

/**
 * Every response is wrapped in this envelope. status "0" with a string result
 * is a real error (bad key, rate limit); status "0" with an empty array is
 * just "no transactions found" and must not throw.
 */
interface Envelope<T> {
  status: string;
  message: string;
  result: T;
}

async function call<T>(chainId: string, params: Record<string, string>, apiKey: string): Promise<T> {
  const query = new URLSearchParams({ chainid: chainId, ...params, apikey: apiKey });
  const envelope = await getJson<Envelope<T>>(`${BASE_URL}?${query}`);
  if (envelope.status !== "1" && typeof envelope.result === "string") {
    throw new Error(`etherscan: ${envelope.message}: ${envelope.result}`);
  }
  return envelope.result;
}

export async function fetchActivityFromEtherscan(
  chainId: string,
  currency: string,
  address: string,
  apiKey: string,
): Promise<Activity> {
  const [wei, txs] = await Promise.all([
    call<string>(chainId, { module: "account", action: "balance", address, tag: "latest" }, apiKey),
    // Newest transaction only — enough for last_seen.
    call<Array<{ timeStamp: string }>>(
      chainId,
      { module: "account", action: "txlist", address, page: "1", offset: "1", sort: "desc" },
      apiKey,
    ),
  ]);

  const newest = txs[0];
  return {
    balance: weiToNative(wei),
    currency,
    // Etherscan has no total-transaction-count endpoint, and the nonce-based
    // count has different semantics (outgoing only) — an empty cell is more
    // honest than a number that means something else per run.
    txCount: null,
    lastSeen: newest ? new Date(Number(newest.timeStamp) * 1000).toISOString() : null,
  };
}
