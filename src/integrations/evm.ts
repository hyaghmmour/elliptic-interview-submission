import type { Activity, EvmChain } from "../types.ts";
import { EVM_CHAINS, fetchActivityFromBlockscout } from "./blockscout.ts";
import { fetchActivityFromEtherscan } from "./etherscan.ts";
import { errorMessage } from "./http.ts";

export interface EvmProbe {
  chain: EvmChain;
  /** Null when both Blockscout and the Etherscan fallback failed for this chain. */
  activity: Activity | null;
}

/**
 * A 0x address exists on every EVM chain, so probe them all concurrently.
 * Per chain: keyless Blockscout first; Etherscan (free-tier key, one key for
 * all chains via chainid) only as a fallback. A failed probe degrades to a
 * warning — it must not sink the other chains.
 */
export async function probeEvmChains(address: string): Promise<EvmProbe[]> {
  return Promise.all(
    EVM_CHAINS.map(async (config): Promise<EvmProbe> => {
      const { chain, etherscanChainId, currency } = config;
      try {
        return { chain, activity: await fetchActivityFromBlockscout(config, address) };
      } catch (err) {
        const apiKey = process.env["ETHERSCAN_API_KEY"];
        if (!apiKey) {
          console.error(`warning: ${chain} probe failed (${errorMessage(err)}) — chain excluded`);
          return { chain, activity: null };
        }
        console.error(`warning: ${chain} via blockscout failed (${errorMessage(err)}) — trying etherscan`);
        try {
          return {
            chain,
            activity: await fetchActivityFromEtherscan(etherscanChainId, currency, address, apiKey),
          };
        } catch (fallbackErr) {
          console.error(`warning: ${chain} probe failed (${errorMessage(fallbackErr)}) — chain excluded`);
          return { chain, activity: null };
        }
      }
    }),
  );
}

/**
 * Pick the rows to report: every chain with any activity (balance, txs, or a
 * last-seen). An address inactive everywhere still deserves one row — default
 * to ethereum so "screened, nothing found" is distinguishable from "not run".
 * Exported pure for tests.
 */
export function selectEvmRows(probes: readonly EvmProbe[]): EvmProbe[] {
  const active = probes.filter((p) => p.activity !== null && hasActivity(p.activity));
  if (active.length > 0) return active;
  return [probes.find((p) => p.chain === "ethereum") ?? { chain: "ethereum", activity: null }];
}

function hasActivity(activity: Activity): boolean {
  return (activity.txCount ?? 0) > 0 || activity.lastSeen !== null || /[1-9]/.test(activity.balance);
}
