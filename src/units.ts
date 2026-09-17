/**
 * Unit formatting. Exact decimal strings via BigInt digit slicing — never
 * `Number(x) / 1eN`, which loses precision above 2^53 (wei balances routinely
 * exceed it).
 */

function scale(value: bigint, decimals: number): string {
  if (value < 0n) throw new Error(`negative amount: ${value}`);
  const digits = value.toString().padStart(decimals + 1, "0");
  return `${digits.slice(0, -decimals)}.${digits.slice(-decimals)}`;
}

/** Satoshis (Esplora returns JSON numbers) → BTC decimal string, 8 dp. */
export function satsToBtc(sats: number): string {
  if (!Number.isSafeInteger(sats)) throw new Error(`invalid satoshi amount: ${sats}`);
  return scale(BigInt(sats), 8);
}

/**
 * Wei (decimal string from the API) → native-coin decimal string, 18 dp.
 * All supported EVM chains use 18-decimal native currencies (ETH, POL, …).
 * BigInt() rejects malformed input.
 */
export function weiToNative(wei: string): string {
  return scale(BigInt(wei), 18);
}

/** Lamports (Solana RPC returns a JSON number) → SOL decimal string, 9 dp. */
export function lamportsToSol(lamports: number): string {
  // u64 on-chain; a JSON number above 2^53 has already lost precision, so fail
  // loudly rather than format a corrupted balance (~9M SOL crosses the line).
  if (!Number.isSafeInteger(lamports)) throw new Error(`invalid lamport amount: ${lamports}`);
  return scale(BigInt(lamports), 9);
}
