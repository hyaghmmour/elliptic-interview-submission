# 07 — Test address set (verified 2026-09-16)

Every address below was run through the real detector, and the sanctioned ones were
confirmed present in the OFAC lists fetched the same day. Sanctions status reflects the
live SDN list and can change (e.g. Tornado Cash addresses were *delisted* March 2025 —
never use them as "sanctioned" fixtures).

## Supported — Bitcoin

| Address | Format | Expected |
| --- | --- | --- |
| `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa` | legacy P2PKH | Genesis address; large history, not sanctioned |
| `3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy` | P2SH | Detects bitcoin; version byte 0x05 path |
| `bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0` | bech32m taproot (BIP-350 vector) | Detects bitcoin; likely zero on-chain history — good "clean empty wallet" demo |
| `12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h` | legacy P2PKH | **SANCTIONED** (Lazarus Group) — `is_sanctioned=true` |
| `bc1qw4cxpe6sxa5dg6sdwxjph959cw6yztrzl4r54s` | bech32 v0 | **SANCTIONED** (ChipMixer) — `is_sanctioned=true` |

## Supported — EVM (probed on ethereum, polygon, base, arbitrum, optimism; one row per active chain)

| Address | Format | Expected |
| --- | --- | --- |
| `0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045` | EIP-55 checksummed | vitalik.eth; verified active on **all five** probed chains (5 rows), clean |
| `0x5aAeb6053F3E94C9b9A09f33669435E7Ef1BeAed` | EIP-55 spec test vector | Valid checksum; near-zero history → single ethereum row |
| `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` | mixed case | **SANCTIONED** (Lazarus / Ronin Bridge) — verified 3 rows (ethereum, polygon, base), all flagged |
| `0x1da5821544e25c636c1417ba96ade4cf6d2f9b5a` | all lowercase | **SANCTIONED** (Chatex-related) — list entry is *lowercase*, exercises case normalization |

## Supported — Solana (added after Solana promotion; no checksum → no typo detection)

| Address | Expected |
| --- | --- |
| `42RLPACwZPx3vYYmxSueqsogfynBDqXK298EDsNoyoHi` | **SANCTIONED** (on the OFAC SOL list) — verified live end-to-end |
| `Vote111111111111111111111111111111111111111` | Clean system program address; `tx_count` empty (no RPC total-count endpoint) |

## Recognised but unsupported (exit 1 with a named chain)

| Address | Detected as |
| --- | --- |
| `LM2WMpR1Rp6j3Sa59cMXMs1SPzj9eXpGc1` | litecoin (base58 version 0x30) |
| `DH5yaieqoZN36fDVciNyRueRGvGLR3mr7L` | dogecoin (base58 version 0x1e) |
| `TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t` | tron (base58 version 0x41; USDT-TRON contract) |
| `rEb8TK3gBgk5auZkwc6sHnwrGVJH8DuaLh` | xrp (ripple alphabet shape) |

## Invalid (exit 1 with a reason; typo-detection guarantees)

| Address | Why invalid |
| --- | --- |
| `1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNb` | genesis address, last char mutated → base58 checksum fails |
| `0x5AAeb6053F3E94C9b9A09f33669435E7Ef1BeAed` | one case flip → EIP-55 checksum mismatch |
| `tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx` | valid bech32 but testnet HRP (`tb`) — rejected, not screened as mainnet |
| `bc1qr508d6qejxtdg4y5r3zarvaryv98gj9p` | BIP-173 invalid vector: v0 with a 16-byte witness program — structurally impossible on-chain |
| `hello world` | no known format |

Also note: `BC1QW4CXPE6SXA5DG6SDWXJPH959CW6YZTRZL4R54S` (the all-uppercase BIP-173
encoding of the sanctioned ChipMixer address) is a **regression fixture** — it must
canonicalise to lowercase and flag `is_sanctioned=true`; before the audit fix it
silently screened clean.

Note: Solana-format addresses carry no checksum, so typo detection is impossible
there by construction — one more reason those are recognised-only.
