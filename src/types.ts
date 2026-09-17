/** EVM chains we probe for a 0x address (a 0x address exists on all of them). */
export type EvmChain = "ethereum" | "polygon" | "base" | "arbitrum" | "optimism";

/** Chains that can appear in the CSV `chain` column. */
export type Chain = "bitcoin" | "solana" | EvmChain;

/** Formats we can recognise but do not fetch data for. */
export type RecognisedChain = "litecoin" | "dogecoin" | "tron" | "xrp";

/**
 * Outcome of inferring the chain from a bare address string. A 0x address
 * identifies the EVM *family*, not one chain — the orchestrator probes the
 * supported EVM chains and emits one row per chain with activity.
 *
 * `canonical` is the form all downstream code must use (API calls, sanctions
 * matching, CSV output): bech32 is case-normalised to lowercase — BIP-173
 * allows an all-uppercase encoding of the same address, and screening the raw
 * input would let UPPERCASE forms of sanctioned addresses through.
 */
export type Detection =
  | { status: "supported"; chain: "bitcoin" | "solana" | "evm"; canonical: string }
  | { status: "unsupported"; chain: RecognisedChain }
  | { status: "invalid"; reason: string };

/** On-chain activity for one address, chain-agnostic. */
export interface Activity {
  /** Balance in native units as a decimal string — never a float. */
  balance: string;
  /** Ticker of the native currency the balance is denominated in (BTC, ETH, POL, SOL). */
  currency: string;
  /** Null when the source cannot provide a total count (Etherscan fallback). */
  txCount: number | null;
  /** ISO 8601 UTC timestamp of the most recent confirmed transaction, or null if none. */
  lastSeen: string | null;
}

/** Contract every chain integration implements. */
export interface ChainClient {
  readonly chain: Chain;
  fetchActivity(address: string): Promise<Activity>;
}

/**
 * One screened wallet — the unit the CSV writer consumes.
 * A null field means that source failed and degrades to an empty cell.
 */
export interface WalletReport {
  address: string;
  chain: Chain;
  activity: Activity | null;
  isSanctioned: boolean | null;
}
