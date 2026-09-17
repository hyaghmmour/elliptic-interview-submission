import type { Activity, ChainClient } from "../types.ts";
import { satsToBtc } from "../units.ts";
import { errorMessage, getJson } from "./http.ts";

/**
 * Bitcoin via the Esplora API. Verified 2026-09-16
 * (see resources/06-implementation-resources.md). mempool.space serves a
 * byte-identical API, so the fallback is just a base-URL swap.
 */
const PRIMARY = "https://blockstream.info/api";
const FALLBACK = "https://mempool.space/api";

/** GET /address/:address — values are JSON numbers, in satoshis. */
interface AddressResponse {
  chain_stats: {
    funded_txo_sum: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

/**
 * GET /address/:address/txs — mempool txs first (status.confirmed === false,
 * no block_time), then up to 25 confirmed txs, newest first.
 */
interface Tx {
  status: { confirmed: boolean; block_time?: number };
}

async function fetchVia(baseUrl: string, address: string): Promise<Activity> {
  const [info, txs] = await Promise.all([
    getJson<AddressResponse>(`${baseUrl}/address/${address}`),
    getJson<Tx[]>(`${baseUrl}/address/${address}/txs`),
  ]);

  const stats = info.chain_stats;
  const newestConfirmed = txs
    .map((tx) => tx.status)
    .find((status) => status.confirmed && status.block_time !== undefined);

  return {
    balance: satsToBtc(stats.funded_txo_sum - stats.spent_txo_sum),
    currency: "BTC",
    txCount: stats.tx_count,
    lastSeen: newestConfirmed?.block_time !== undefined
      ? new Date(newestConfirmed.block_time * 1000).toISOString()
      : null,
  };
}

export const bitcoin: ChainClient = {
  chain: "bitcoin",

  async fetchActivity(address) {
    try {
      return await fetchVia(PRIMARY, address);
    } catch (err) {
      console.error(`warning: blockstream.info failed (${errorMessage(err)}) — retrying via mempool.space`);
      return fetchVia(FALLBACK, address);
    }
  },
};
