# 06 — Implementation resources (verified 2026-09-16)

Synthesis of three parallel research passes: blockchain APIs, sanctions data, and
TypeScript tooling. Everything marked **verified** was exercised live (curl / scratch
project) on 2026-09-16, not taken from docs.

## Dependency set (final)

**Runtime dependencies — 2:**

| Package | Version | Why it earns its place |
| --- | --- | --- |
| `bech32` | 2.0.0 | Zero deps, bitcoinjs-maintained. Exports both `bech32` and `bech32m` (Taproot). The polymod checksum is genuinely error-prone to hand-roll — verified that `bech32m.decode()` accepts `bc1p…` and `bech32.decode()` correctly rejects it. Decoded `prefix` gives us `bc` vs `ltc` for free. |
| `@noble/hashes` | 2.4.0 | keccak-256 for EIP-55 checksum validation. Audited, zero deps, 63M downloads/wk. Gotchas: subpath import needs `.js` (`@noble/hashes/sha3.js`) and v2 rejects string input — wrap with `utf8ToBytes`. |

**Deliberately hand-rolled (each is a high-signal unit-test target):**

- **base58check decode** (~20 lines: BigInt base58 + leading-`1` zeros + double-SHA-256
  via `node:crypto`). Returns version byte + payload; version byte is the chain
  discriminator (`0x00`/`0x05` BTC, `0x30` LTC, `0x1E` DOGE, `0x41` TRON). `bs58check`
  exists (v4.0.0) but drags 3 transitive packages, and writing it shows we understand
  the encoding.
- **CSV escaping** (RFC 4180, ~6 lines: quote iff field contains `"` `,` CR or LF,
  double internal quotes).
- **wei → ETH formatting** via BigInt string slicing — never `Number(wei)/1e18`
  (precision loss above 2^53):
  ```ts
  const s = BigInt(weiStr).toString().padStart(19, "0");
  const eth = `${s.slice(0, -18)}.${s.slice(-18)}`; // then trim trailing zeros
  ```
  Same pattern with `padStart(9)`/`slice(-8)` for satoshis keeps both chains symmetric.

**Node built-ins for everything else:** `node:util` `parseArgs` (one positional +
`--output` flag), global `fetch`, `node:test` + `node:assert/strict`, `node:crypto`.
Dev deps only `typescript` + `@types/node` (for `tsc --noEmit` and editor support).

**Rejected:** commander/yargs (a dep to save zero lines), csv-stringify/papaparse (one
data row), got/axios (two GETs), vitest (~100 transitive packages vs zero-config
`node --test`), `keccak` (native addon → install friction), ts-node (unmaintained).

## Runtime: native Node type stripping — no build step

- Type stripping is on by default since Node 22.18 / 23.6, **stable since 24.12**
  (Node 24 = Active LTS in 2026). `node src/index.ts` and `node --test` (auto-discovers
  `*.test.ts`) both run flagless — verified on Node 26.7.
- Constraints to respect: `"type": "module"` in package.json, no `enum`/namespaces/
  parameter properties (erasable syntax only), `import type` for type-only imports,
  explicit `.ts` extensions on relative imports.
- package.json: `engines.node >= 22.18`, scripts `start` / `test` / `typecheck`.

## API behaviors we must code against (all verified live)

### Esplora (BTC) — `https://blockstream.info/api`
- `/address/:a` → `chain_stats`/`mempool_stats`, values are JSON **numbers**
  (satoshis; observed up to 5.3e14 — within 2^53, but don't get creative).
- `/address/:a/txs` → **mempool txs first** (no `block_time`!), then ≤25 confirmed,
  newest first. `last_seen` = first item with `status.confirmed === true` →
  `status.block_time` (Unix seconds).
- Invalid address → HTTP 400 with a **plain-text** body (`base58 error`) — don't
  assume JSON when handling errors.
- No published rate limit; 10s CDN cache; keep to ~1 req/s.
- **Fallback:** `https://mempool.space/api` is byte-identical for both endpoints
  (same Esplora lineage) — a base-URL swap.

### Blockscout (ETH) — `https://eth.blockscout.com/api/v2`
- `/addresses/:a` → `coin_balance` is a **wei decimal string, or `null`** for a
  never-seen address (HTTP 200, *not* 404 — treat null as 0). Malformed address →
  HTTP 422 JSON. Bonus fields: `is_contract`, `is_scam`.
- `/addresses/:a/counters` → `transactions_count` is a **string** (`"0"` for unused
  addresses).
- `/addresses/:a/transactions` → `{items, next_page_params}`, newest first,
  `timestamp` is **ISO 8601** (`2026-09-15T11:05:11.000000Z`) — normalize with
  Esplora's Unix seconds to one output format (recommend ISO 8601 UTC in the CSV).
- Observed live rate-limit headers: `x-ratelimit-limit: 180` per window — irrelevant
  for a single-address run, but honor 429s.
- **Fallbacks (documented, not wired):** free-tier keys are allowed (constraint
  clarified 2026-09-16 — only paywalls/paid credits are out), so the ETH fallback
  options are: Ethplorer's shared `freekey`
  (`api.ethplorer.io/getAddressInfo/:a?apiKey=freekey`, no signup) or Etherscan with a
  free key supplied via an env var (e.g. `ETHERSCAN_API_KEY`). Keyless Blockscout
  stays primary so the default clone-and-run path needs zero provisioning. Bare public
  JSON-RPC gives balance but no history (no `last_seen`).

### Test-fixture warning
`0x1111…1111` looks like a safe "unused address" fixture but is a real burn address
holding ETH. Use a random fresh address for zero-history tests, or fixture JSON.

## Sanctions data (OFAC via 0xB10C mirror)

- URLs (verified 200; **Bitcoin is `XBT`, not `BTC`** — `_BTC.txt` 404s):
  - `https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_XBT.txt` (532 lines)
  - `…/lists/sanctioned_addresses_ETH.txt` (120 lines)
  - JSON variants (same names, `.json`): flat arrays of strings — prefer these, no
    line parsing.
- **Matching rules:** ETH list casing is inconsistent (65/120 mixed-case EIP-55, 55
  lowercase) → **lowercase both sides** before comparing. BTC addresses match exactly
  (base58 is case-sensitive). Files are clean: no blanks/comments/dupes.
- Don't validate list entries against a strict per-chain format — OFAC itself has a
  Tron-style address tagged as XBT in the list.
- Update cadence: regenerated nightly 01:24 UTC but committed only when the SDN
  changed (last change 2026-09-10). Include a "list fetched at" note in output docs.
- **Demo/test addresses confirmed present in today's lists:**
  - BTC: `12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h` (Lazarus Group),
    `bc1qw4cxpe6sxa5dg6sdwxjph959cw6yztrzl4r54s` (ChipMixer)
  - ETH: `0x098B716B8Aaf21512996dC57EB0615e2383E2f96` (Lazarus / Ronin Bridge,
    mixed case), `0x1da5821544e25c636c1417ba96ade4cf6d2f9b5a` (all-lowercase — good
    for exercising case normalization)
  - **Do not use Tornado Cash addresses** — delisted from the SDN March 2025, absent
    from the current list.
- Authoritative fallback (`sdn_advanced.xml`) is ~127 MB per download — documented as
  the source of truth, impractical as the hot path.
- Licensing: OFAC data is US-government public domain; the extractor repo is MIT.
  Attribute both in the README.

## fetch() gotchas (built-in HTTP)

- No default timeout — always `{ signal: AbortSignal.timeout(ms) }`; timeout rejects
  with `.name === "TimeoutError"` (distinguish from network errors in messaging).
- Non-2xx does **not** reject — check `res.ok`.
- Send a `User-Agent` header — some public explorers 403 default agents.

## Chain-rejection details (no extra deps)

- XRP uses a **different base58 alphabet** — Bitcoin-alphabet decoders won't decode it;
  detect by `r` prefix + ripple-alphabet regex.
- Solana: raw base58 decoding to 32 bytes (no version/checksum) — length check.
- Note: current OFAC XBT list contains no `bc1p` (Taproot) addresses, so Taproot
  sanctions matching is untestable against real data — cover it with synthetic tests.
