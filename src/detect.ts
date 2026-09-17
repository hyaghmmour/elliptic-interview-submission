import { createHash } from "node:crypto";
import { bech32, bech32m } from "bech32";
import { keccak_256 } from "@noble/hashes/sha3.js";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils.js";
import type { Detection } from "./types.ts";

/**
 * Infer the chain from a bare address string (see resources/05-chain-detection.md).
 *
 * Ordered checks, first match wins. Each check does a real decode with checksum
 * verification where the format has one — a prefix match with a bad checksum is
 * a typo and must be rejected loudly, not screened as clean. Solana is the one
 * exception: raw ed25519 keys carry no checksum, so typos are undetectable
 * there by construction.
 */
export function detect(address: string): Detection {
  // 1. EVM hex. The same address exists on every EVM chain simultaneously, so
  //    detection can only name the family — the orchestrator probes the chains.
  if (/^0x[0-9a-fA-F]{40}$/.test(address)) {
    return isValidEip55(address.slice(2))
      ? { status: "supported", chain: "evm", canonical: address }
      : { status: "invalid", reason: "EIP-55 checksum mismatch — the address may contain a typo" };
  }

  // 2. bech32/bech32m — the HRP names the chain by design.
  const fromBech32 = detectBech32(address);
  if (fromBech32) return fromBech32;

  // 3. XRP uses its own base58 alphabet (a permutation), so a Bitcoin-alphabet
  //    decode would just fail its checksum; recognise by shape before base58check.
  if (/^r[1-9A-HJ-NP-Za-km-z]{24,34}$/.test(address)) {
    return { status: "unsupported", chain: "xrp" };
  }

  // 4. base58: 25 decoded bytes = base58check (version + 20-byte hash + checksum),
  //    32 bytes = a raw ed25519 key, i.e. Solana (no version byte, no checksum).
  const raw = address.length <= 64 ? base58Decode(address) : null;
  if (raw?.length === 25) return detectBase58Check(raw, address);
  if (raw?.length === 32) return { status: "supported", chain: "solana", canonical: address };

  return { status: "invalid", reason: "does not match any known address format" };
}

/**
 * EIP-55: all-lowercase or all-uppercase hex is valid but unchecksummed; mixed
 * case must match the keccak-256 digest of the lowercase hex.
 */
function isValidEip55(hex: string): boolean {
  const lower = hex.toLowerCase();
  if (hex === lower || hex === hex.toUpperCase()) return true;
  const digest = bytesToHex(keccak_256(utf8ToBytes(lower)));
  for (let i = 0; i < hex.length; i++) {
    const ch = hex[i]!;
    if (/[0-9]/.test(ch)) continue;
    const shouldBeUpper = parseInt(digest[i]!, 16) >= 8;
    if ((ch === ch.toUpperCase()) !== shouldBeUpper) return false;
  }
  return true;
}

function detectBech32(address: string): Detection | null {
  // BIP-350: witness v0 uses bech32, v1+ (taproot) uses bech32m — the two
  // checksums are mutually exclusive, so try both and cross-check the version.
  let decoded: { prefix: string; words: number[] };
  let variant: "bech32" | "bech32m";
  try {
    decoded = bech32.decode(address);
    variant = "bech32";
  } catch {
    try {
      decoded = bech32m.decode(address);
      variant = "bech32m";
    } catch {
      return null; // not bech32 at all — let later checks run
    }
  }

  const [version, ...programWords] = decoded.words;
  if (version === undefined) return { status: "invalid", reason: "bech32 address has no witness version" };
  if (version > 16) return { status: "invalid", reason: `invalid witness version ${version} (max is 16)` };
  const expected = version === 0 ? "bech32" : "bech32m";
  if (variant !== expected) {
    return { status: "invalid", reason: `witness v${version} must use ${expected} encoding` };
  }

  // BIP-141 structural rules: program 2–40 bytes; v0 exactly 20 (P2WPKH) or
  // 32 (P2WSH); v1 exactly 32 (P2TR). Addresses violating these can never
  // exist on-chain and must not be screened as clean.
  let program: number[];
  try {
    program = bech32.fromWords(programWords);
  } catch {
    return { status: "invalid", reason: "malformed witness program padding" };
  }
  if (
    program.length < 2 ||
    program.length > 40 ||
    (version === 0 && program.length !== 20 && program.length !== 32) ||
    (version === 1 && program.length !== 32)
  ) {
    return { status: "invalid", reason: `invalid ${program.length}-byte witness program for version ${version}` };
  }

  if (decoded.prefix === "bc") {
    // BIP-173 allows an all-uppercase encoding of the same address; everything
    // downstream (sanctions matching, API calls, CSV) must see one form only.
    return { status: "supported", chain: "bitcoin", canonical: address.toLowerCase() };
  }
  if (decoded.prefix === "ltc") return { status: "unsupported", chain: "litecoin" };
  return { status: "invalid", reason: `unknown bech32 prefix "${decoded.prefix}"` };
}

/** Version byte → chain (see resources/05-chain-detection.md for the table). */
const BASE58_VERSIONS: Record<number, Detection> = {
  0x30: { status: "unsupported", chain: "litecoin" }, // "L…"
  0x32: { status: "unsupported", chain: "litecoin" }, // P2SH "M…"
  0x1e: { status: "unsupported", chain: "dogecoin" }, // "D…"
  0x16: { status: "unsupported", chain: "dogecoin" }, // P2SH "9…"/"A…"
  0x41: { status: "unsupported", chain: "tron" }, // "T…"
};

function detectBase58Check(raw: Uint8Array, address: string): Detection {
  const data = raw.subarray(0, 21);
  const checksum = raw.subarray(21);
  const digest = sha256(sha256(data));
  for (let i = 0; i < 4; i++) {
    if (checksum[i] !== digest[i]) {
      return { status: "invalid", reason: "base58 checksum failed — the address may contain a typo" };
    }
  }
  const version = data[0]!;
  if (version === 0x00 || version === 0x05) {
    // P2PKH "1…" / P2SH "3…" — base58 is case-sensitive, so as-given IS canonical.
    return { status: "supported", chain: "bitcoin", canonical: address };
  }
  return (
    BASE58_VERSIONS[version] ?? {
      status: "invalid",
      reason: `valid base58check with unrecognised version byte 0x${version.toString(16).padStart(2, "0")}`,
    }
  );
}

const BASE58_ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

/** Bitcoin-alphabet base58 → bytes, or null if any character is outside the alphabet. */
function base58Decode(input: string): Uint8Array | null {
  if (input.length === 0) return null;
  let n = 0n;
  for (const ch of input) {
    const index = BASE58_ALPHABET.indexOf(ch);
    if (index < 0) return null;
    n = n * 58n + BigInt(index);
  }
  const bytes: number[] = [];
  for (; n > 0n; n >>= 8n) bytes.unshift(Number(n & 0xffn));
  // Leading "1"s encode leading zero bytes.
  for (const ch of input) {
    if (ch !== "1") break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

function sha256(data: Uint8Array): Uint8Array {
  return createHash("sha256").update(data).digest();
}
