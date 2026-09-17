import type { ChainClient } from "../types.ts";
import { bitcoin } from "./esplora.ts";
import { solana } from "./solana.ts";

/** Single-chain clients (EVM goes through probeEvmChains instead). */
export const clients: Record<"bitcoin" | "solana", ChainClient> = {
  bitcoin,
  solana,
};

export { probeEvmChains, selectEvmRows } from "./evm.ts";
export { isSanctioned, isSanctionedEvm } from "./ofac.ts";
