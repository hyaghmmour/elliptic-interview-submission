import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { bech32, bech32m } from "bech32";
import { detect } from "./detect.ts";

// -- helpers to build synthetic base58check addresses for chains where we
//    don't want to depend on real fixtures (only the version byte matters) --

const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";

function base58Encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) + BigInt(b);
  let out = "";
  for (; n > 0n; n /= 58n) out = ALPHABET[Number(n % 58n)] + out;
  for (const b of bytes) {
    if (b !== 0) break;
    out = "1" + out;
  }
  return out;
}

function base58CheckAddress(version: number, payload = new Uint8Array(20).fill(7)): string {
  const data = Uint8Array.from([version, ...payload]);
  const sha256 = (d: Uint8Array) => createHash("sha256").update(d).digest();
  const checksum = sha256(sha256(data)).subarray(0, 4);
  return base58Encode(Uint8Array.from([...data, ...checksum]));
}

function invalidReason(input: string): string {
  const result = detect(input);
  assert.equal(result.status, "invalid", `expected invalid for ${JSON.stringify(input)}`);
  return (result as { reason: string }).reason;
}

// -- bitcoin --

test("detects legacy P2PKH and P2SH bitcoin addresses", () => {
  assert.deepEqual(detect("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa"), {
    status: "supported",
    chain: "bitcoin",
    canonical: "1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa",
  });
  assert.deepEqual(detect("3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy"), {
    status: "supported",
    chain: "bitcoin",
    canonical: "3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy",
  });
});

test("detects bech32 (segwit v0) bitcoin addresses", () => {
  assert.deepEqual(detect("bc1qw4cxpe6sxa5dg6sdwxjph959cw6yztrzl4r54s"), {
    status: "supported",
    chain: "bitcoin",
    canonical: "bc1qw4cxpe6sxa5dg6sdwxjph959cw6yztrzl4r54s",
  });
});

test("detects bech32m (taproot) bitcoin addresses", () => {
  // BIP-350 valid test vector (witness v1).
  assert.deepEqual(detect("bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0"), {
    status: "supported",
    chain: "bitcoin",
    canonical: "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
  });
});

test("canonicalises UPPERCASE bech32 (BIP-173) to lowercase — sanctions-bypass regression", () => {
  // The all-uppercase encoding is the same wallet; downstream matching must
  // see the lowercase form or a sanctioned address dodges the OFAC list.
  assert.deepEqual(detect("BC1QW4CXPE6SXA5DG6SDWXJPH959CW6YZTRZL4R54S"), {
    status: "supported",
    chain: "bitcoin",
    canonical: "bc1qw4cxpe6sxa5dg6sdwxjph959cw6yztrzl4r54s",
  });
});

test("rejects a base58 address with a corrupted checksum", () => {
  assert.match(invalidReason("1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb"), /checksum/); // last char mutated
});

// -- segwit structural rules (BIP-141/BIP-350) --

test("rejects the wrong checksum variant for the witness version", () => {
  // v1 encoded with bech32 (must be bech32m) and v0 with bech32m (must be bech32).
  const v1AsBech32 = bech32.encode("bc", [1, ...bech32.toWords(new Uint8Array(32).fill(7))], 90);
  assert.match(invalidReason(v1AsBech32), /bech32m/);
  const v0AsBech32m = bech32m.encode("bc", [0, ...bech32m.toWords(new Uint8Array(20).fill(7))]);
  assert.match(invalidReason(v0AsBech32m), /bech32 encoding/);
});

test("rejects witness versions above 16", () => {
  const v17 = bech32m.encode("bc", [17, ...bech32m.toWords(new Uint8Array(32).fill(7))], 90);
  assert.match(invalidReason(v17), /witness version 17/);
});

test("rejects illegal witness-program lengths", () => {
  // BIP-173's published INVALID vector: v0 with a 16-byte program.
  assert.match(invalidReason("bc1qr508d6qejxtdg4y5r3zarvaryv98gj9p"), /witness program/);
  const v1Short = bech32m.encode("bc", [1, ...bech32m.toWords(new Uint8Array(5).fill(7))]);
  assert.match(invalidReason(v1Short), /witness program/);
});

// -- ethereum / EIP-55 --

test("accepts a correctly checksummed EIP-55 address", () => {
  // EIP-55 spec test vector.
  assert.deepEqual(detect("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"), {
    status: "supported",
    chain: "evm",
    canonical: "0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed",
  });
});

test("accepts all-lowercase and all-uppercase (unchecksummed) EVM addresses", () => {
  assert.deepEqual(detect("0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed"), {
    status: "supported",
    chain: "evm",
    canonical: "0x5aaeb6053f3e94c9b9a09f33669435e7ef1beaed",
  });
  assert.deepEqual(detect("0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED"), {
    status: "supported",
    chain: "evm",
    canonical: "0x5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED",
  });
});

test("rejects a mixed-case EVM address with a broken checksum", () => {
  assert.match(invalidReason("0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed"), /EIP-55/); // first letter case flipped
});

test("rejects hex of the wrong length and an uppercase 0X prefix", () => {
  assert.equal(detect("0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAe").status, "invalid");
  assert.equal(detect("0X5AAEB6053F3E94C9B9A09F33669435E7EF1BEAED").status, "invalid");
});

// -- solana --

test("detects solana addresses (raw 32-byte base58, no checksum)", () => {
  assert.deepEqual(detect("Vote111111111111111111111111111111111111111"), {
    status: "supported",
    chain: "solana",
    canonical: "Vote111111111111111111111111111111111111111",
  });
  const synthetic = base58Encode(new Uint8Array(32).fill(9));
  assert.deepEqual(detect(synthetic), { status: "supported", chain: "solana", canonical: synthetic });
});

// -- recognised but unsupported --

test("recognises litecoin by base58 version byte and bech32 HRP", () => {
  assert.deepEqual(detect(base58CheckAddress(0x30)), { status: "unsupported", chain: "litecoin" });
  assert.deepEqual(detect("LM2WMpR1Rp6j3Sa59cMXMs1SPzj9eXpGc1"), { status: "unsupported", chain: "litecoin" });
  const ltcBech32 = bech32.encode("ltc", [0, ...bech32.toWords(new Uint8Array(20).fill(7))]);
  assert.deepEqual(detect(ltcBech32), { status: "unsupported", chain: "litecoin" });
});

test("recognises dogecoin, tron and xrp", () => {
  assert.deepEqual(detect("DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L"), { status: "unsupported", chain: "dogecoin" });
  assert.deepEqual(detect(base58CheckAddress(0x1e)), { status: "unsupported", chain: "dogecoin" });
  assert.deepEqual(detect("TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"), { status: "unsupported", chain: "tron" });
  assert.deepEqual(detect(base58CheckAddress(0x41)), { status: "unsupported", chain: "tron" });
  assert.deepEqual(detect("rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh"), { status: "unsupported", chain: "xrp" });
});

test("rejects bitcoin testnet (tb HRP) rather than screening it as mainnet", () => {
  // BIP-173 P2WPKH testnet example — valid checksum, wrong network.
  assert.match(invalidReason("tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx"), /prefix/);
});

// -- garbage --

test("rejects strings that match no known format", () => {
  for (const input of ["", "hello world", "bc1qqqqqqqqqqqqq", "0xZZZZ", "1234"]) {
    assert.equal(detect(input).status, "invalid", `expected invalid for ${JSON.stringify(input)}`);
  }
});

test("rejects a valid base58check payload with an unknown version byte", () => {
  assert.match(invalidReason(base58CheckAddress(0x99)), /version byte/);
});
