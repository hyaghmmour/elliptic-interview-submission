import { getJson } from "./http.ts";

/**
 * OFAC SDN digital-currency address lists, via the nightly-regenerated mirror
 * (0xB10C/ofac-sanctioned-digital-currency-addresses, `lists` branch).
 * Verified 2026-09-16 (see resources/06-implementation-resources.md).
 *
 * JSON variants are flat arrays of address strings. Note the Bitcoin list uses
 * OFAC's ticker XBT — `..._BTC.json` does not exist.
 */
const LIST_BASE_URL =
  "https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists";

const DIRECT_LISTS = {
  bitcoin: `${LIST_BASE_URL}/sanctioned_addresses_XBT.json`,
  solana: `${LIST_BASE_URL}/sanctioned_addresses_SOL.json`,
} as const;

/**
 * OFAC tags addresses per asset, but a sanctioned ENTITY's 0x address is the
 * same wallet on every EVM chain — so EVM screening matches against the union
 * of all 0x-bearing lists (the token lists also contain e.g. Tron-format
 * entries, filtered out by the 0x check).
 */
const EVM_LIST_ASSETS = ["ETH", "ARB", "BSC", "ETC", "USDT", "USDC"] as const;

/**
 * True if the address appears on the OFAC list for its chain.
 * False means "not on this list" — NOT a clean bill of health.
 * Bitcoin/Solana are base58: case-sensitive, exact match.
 */
export async function isSanctioned(chain: keyof typeof DIRECT_LISTS, address: string): Promise<boolean> {
  const list = await getJson<string[]>(DIRECT_LISTS[chain]);
  return list.includes(address);
}

/** True if the 0x address appears on ANY of OFAC's EVM-asset lists. */
export async function isSanctionedEvm(address: string): Promise<boolean> {
  const lists = await Promise.all(
    EVM_LIST_ASSETS.map((asset) => getJson<string[]>(`${LIST_BASE_URL}/sanctioned_addresses_${asset}.json`)),
  );
  return buildEvmSanctionsSet(lists).has(address.toLowerCase());
}

/**
 * Union the lists into one lowercase 0x-only set. Exported pure for tests.
 * Lowercasing both sides is required: the ETH list mixes EIP-55 and lowercase
 * entries, and EVM addresses are case-insensitive wallets.
 */
export function buildEvmSanctionsSet(lists: readonly (readonly string[])[]): Set<string> {
  const set = new Set<string>();
  for (const list of lists) {
    for (const entry of list) {
      if (entry.startsWith("0x")) set.add(entry.toLowerCase());
    }
  }
  return set;
}
