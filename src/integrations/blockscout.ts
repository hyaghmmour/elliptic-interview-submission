import type { Activity, EvmChain } from "../types.ts";
import { weiToNative } from "../units.ts";
import { getJson } from "./http.ts";

/**
 * EVM chains via Blockscout (keyless). All instances serve the identical API,
 * so one client parameterised by base URL covers every chain. Verified
 * 2026-09-16 (see resources/06-implementation-resources.md).
 */
export interface EvmChainConfig {
  chain: EvmChain;
  baseUrl: string;
  etherscanChainId: string;
  /** Native currency ticker (the L2s settle in ETH; Polygon PoS in POL). */
  currency: string;
}

export const EVM_CHAINS: readonly EvmChainConfig[] = [
  { chain: "ethereum", baseUrl: "https://eth.blockscout.com/api/v2", etherscanChainId: "1", currency: "ETH" },
  { chain: "polygon", baseUrl: "https://polygon.blockscout.com/api/v2", etherscanChainId: "137", currency: "POL" },
  { chain: "base", baseUrl: "https://base.blockscout.com/api/v2", etherscanChainId: "8453", currency: "ETH" },
  { chain: "arbitrum", baseUrl: "https://arbitrum.blockscout.com/api/v2", etherscanChainId: "42161", currency: "ETH" },
  { chain: "optimism", baseUrl: "https://explorer.optimism.io/api/v2", etherscanChainId: "10", currency: "ETH" },
];

/**
 * GET /addresses/:address
 * A never-seen address is HTTP 200 with coin_balance: null — NOT a 404.
 * Malformed addresses are HTTP 422 (detection prevents us ever sending one).
 */
interface AddressResponse {
  /** Wei as a decimal string (needs BigInt), or null for never-seen addresses. */
  coin_balance: string | null;
}

/** GET /addresses/:address/counters — counts are strings ("0" for never-seen). */
interface CountersResponse {
  transactions_count: string;
}

/**
 * GET /addresses/:address/transactions — newest first; empty items for never-seen.
 * Pending (mempool) transactions come FIRST with timestamp: null — the same
 * hazard as Esplora's unconfirmed txs, so last_seen must skip them.
 */
interface TransactionsResponse {
  /** ISO 8601 UTC ("2026-09-15T11:05:11.000000Z") once confirmed; null while pending. */
  items: Array<{ timestamp: string | null }>;
}

export async function fetchActivityFromBlockscout(
  { baseUrl, currency }: EvmChainConfig,
  address: string,
): Promise<Activity> {
  const [info, counters, txs] = await Promise.all([
    getJson<AddressResponse>(`${baseUrl}/addresses/${address}`),
    getJson<CountersResponse>(`${baseUrl}/addresses/${address}/counters`),
    getJson<TransactionsResponse>(`${baseUrl}/addresses/${address}/transactions`),
  ]);

  const txCount = Number(counters.transactions_count);
  if (!Number.isFinite(txCount)) {
    throw new Error(`blockscout returned a non-numeric transaction count: ${counters.transactions_count}`);
  }

  // Skip pending txs (timestamp null) — last_seen means "newest CONFIRMED",
  // matching the Bitcoin client's semantics.
  const newest = txs.items.find((tx) => tx.timestamp !== null);
  return {
    balance: weiToNative(info.coin_balance ?? "0"),
    currency,
    txCount,
    // Normalise to the same ISO 8601 format the Bitcoin client emits.
    lastSeen: newest?.timestamp != null ? new Date(newest.timestamp).toISOString() : null,
  };
}
