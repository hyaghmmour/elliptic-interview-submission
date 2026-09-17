# wallet-screener

A CLI that takes a bare cryptocurrency wallet address with no chain information, works
out the chain from the address format, screens it, and writes a CSV. Bitcoin and
Solana addresses produce one row; a `0x` address is probed across five EVM chains
(Ethereum, Polygon, Base, Arbitrum, Optimism) and produces one row per chain with
activity:

```
address,balance,chain,tx_count,last_seen,is_sanctioned
0x098B716B8Aaf21512996dC57EB0615e2383E2f96,101.802486783767055350 ETH,ethereum,430,2026-07-27T10:14:47.000Z,true
0x098B716B8Aaf21512996dC57EB0615e2383E2f96,0.622000000000000000 POL,polygon,0,,true
0x098B716B8Aaf21512996dC57EB0615e2383E2f96,0.000000000000000000 ETH,base,0,2024-07-22T07:39:57.000Z,true
```

(That's the Ronin Bridge exploiter. An Ethereum-only screener would never see the POL
parked on Polygon or the Base activity.)

Built for [this brief](TASK.md). The research trail behind every decision lives in
[`resources/`](resources/README.md).

## Quick start

Requires Node ≥ 22.18 (no build step; it runs TypeScript natively). No API keys needed.

```bash
npm install
npm start -- <wallet-address>              # prints a table, writes output/<address>.csv
npm start -- <wallet-address> -o out.csv   # custom path
npm test                                   # 42 unit tests
npm run typecheck
```

Try it with addresses from [`resources/07-test-addresses.md`](resources/07-test-addresses.md):

```bash
npm start -- 12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h                 # bitcoin, OFAC-sanctioned (Lazarus Group)
npm start -- 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045         # EVM, active on all 5 probed chains
npm start -- 42RLPACwZPx3vYYmxSueqsogfynBDqXK298EDsNoyoHi       # solana, OFAC-sanctioned
npm start -- LM2WMpR1Rp6j3Sa59cMXMs1SPzj9eXpGc1                 # litecoin: recognised, politely refused
```

Optional: `ETHERSCAN_API_KEY` in a `.env` enables an Etherscan fallback if Blockscout
is down (free-tier key; the default path needs nothing). `npm start` loads `.env`
automatically via `--env-file-if-exists`.

## The columns

The brief asks for the address, the balance, and up to four additional columns
valuable when screening an address, read in the AML sense: signals that help an
analyst decide allow, hold, or escalate. Each column answers a different question:

| Column | Question it answers | Source |
| --- | --- | --- |
| `balance` | Current exposure, amount plus its native currency (BTC, ETH, POL, SOL) | explorer/RPC |
| `chain` | What asset/network is this? Essential when the input arrives chain-unknown; for EVM addresses it names the probed chain each row came from | inferred from format, then probed |
| `tx_count` | How active is the wallet? | explorer counters |
| `last_seen` | Lifecycle: dormant vs live. Timestamp of the newest confirmed transaction | explorer/RPC |
| `is_sanctioned` | Is it directly on the US OFAC SDN list? | Treasury data (nightly-updated mirror) |

An empty cell always means the source could not answer, never "zero" or "no". A
`false` in `is_sanctioned` means the address is not on the OFAC list, which is not a
clean bill of health.

## Thought process & considerations

**Chain detection is the heart of the tool.** The address arrives with no chain label,
so `src/detect.ts` infers it from the format itself, by decoding with checksum
verification rather than prefix regexes. A screening tool must fail loudly on typos: a
mistyped address that "screens clean" is worse than an error. Base58check and bech32
checksums catch single-character mutations, EIP-55 casing catches them on Ethereum,
and structurally impossible segwit addresses (bad witness versions or program lengths)
are rejected outright. Three limits worth knowing:

- **EVM ambiguity is intrinsic, so the tool probes instead of assuming.** `0x…`
  addresses exist on every EVM chain simultaneously; no parser can tell Ethereum from
  Polygon. Detection names the family, and the tool probes five keyless Blockscout
  instances concurrently, emitting one row per chain with activity. Bad actors bridge
  across EVM chains, and single-chain screening misses parked funds. Balances on
  different chains are different native tokens (ETH, POL, …), so rows are never
  summed. An address inactive everywhere still gets one Ethereum row, so "screened,
  nothing found" stays distinguishable from "not screened".
- **Solana has no checksum.** Its addresses are raw ed25519 keys, so a typo'd Solana
  address is indistinguishable from a real one. Typo detection is impossible there by
  construction.
- **Case is part of the threat model.** BIP-173 allows an all-uppercase encoding of
  every bech32 address, so addresses are canonicalised to lowercase before matching;
  otherwise a sanctioned address could dodge the list by changing case. (Found by an
  adversarial audit of this codebase and kept as a regression fixture.)

**Column selection: uniform semantics beat per-chain richness.** Every column must
mean the same thing on every supported chain, and survive "how do you know?"
questioning. Columns considered and rejected (full analysis in
[`resources/02`](resources/02-candidate-columns.md)):

- **Custodial vs non-custodial / exchange-owned.** The most requested field in real
  screening, and valuable: a custodial deposit address has a KYC'd customer behind it,
  and unhosted wallets get FATF attention. But classifying custody is entity
  attribution, the proprietary dataset of chain-analytics vendors. Free approximations
  (public exchange-tag dumps, Blockscout tags, `is_contract`) are stale, ETH-only, or
  answer a different question: a Safe multisig is a contract and non-custodial, while
  an exchange hot wallet is an EOA and custodial. And the absence of an exchange tag
  can never honestly be reported as "non-custodial". Shipping a guess would be worse
  than shipping nothing.
- **Volume (lifetime value moved).** Free on Bitcoin, since Esplora returns lifetime
  `total_received` with the balance, but there is no keyless Ethereum equivalent, and
  summing native-ETH history would understate exactly the interesting addresses, where
  value moves via internal transactions and token transfers. `tx_count` means the same
  thing everywhere.
- **Entity labels and composite risk scores.** Labels need attribution data we don't
  have, and a 0–100 score without a defensible model is theatre. Raw signals are more
  useful and easier to stand behind.

**Data sources: free, keyless-first.** The constraint: no paywalls or paid credits,
and the default path should need zero provisioning. Everything was live-verified
before being wired in (see [`resources/03`](resources/03-data-sources.md) and
[`06`](resources/06-implementation-resources.md)):

- Bitcoin: Blockstream Esplora, with mempool.space as a byte-identical automatic
  fallback (same API, so the fallback is a base-URL swap).
- EVM chains: Blockscout, keyless. Every instance serves the identical API, so one
  client parameterised by base URL covers all five chains. An optional Etherscan
  free-tier fallback sits behind `ETHERSCAN_API_KEY`; Etherscan v2 covers all probed
  chains with one key via its `chainid` param. The fallback leaves `tx_count` empty:
  Etherscan has no total-count endpoint, and the nonce counts only outgoing
  transactions, which would silently change the column's meaning.
- Solana: the public mainnet JSON-RPC. `tx_count` is empty here too, since signatures
  page 1,000 at a time with no total; an empty cell beats a capped guess.
- Sanctions: the OFAC SDN digital-currency lists via a nightly-regenerated GitHub
  mirror (the authoritative `sdn_advanced.xml` is a ~127 MB download, impractical per
  run). For EVM addresses the match runs against the union of all of OFAC's 0x-format
  lists (ETH, ARB, BSC, ETC, USDT, USDC): a sanctioned entity's address is the same
  wallet on every EVM chain, and OFAC's per-asset tagging is designation paperwork,
  not a screening boundary. Two gotchas encoded in the code: the Bitcoin list uses
  ticker `XBT`, and ETH-list casing is inconsistent, so EVM matching lowercases both
  sides.

**Failure policy.** Data sources are independent, so they fetch concurrently and fail
independently: a dead explorer still produces a row with the sanctions verdict (and
vice versa), and a failed EVM chain probe is excluded with a warning rather than
sinking the other chains. Partial data still screens. The only hard errors are an
unparseable address and unknown flags.

## Design notes

- **Two runtime dependencies** (`bech32`, and `@noble/hashes` for keccak-256/EIP-55),
  both audited with zero transitive dependencies. Base58check decoding (~25 lines),
  RFC 4180 CSV escaping (~6 lines) and BigInt unit formatting are hand-rolled; each is
  small, pure, and unit-tested. Balances are formatted via BigInt digit slicing, never
  floating point, because wei values routinely exceed 2^53.
- **Structure:** `detect.ts` (pure) → `integrations/` (one client per chain behind a
  shared `ChainClient` interface, plus `ofac.ts`) → `csv.ts` (pure). The CSV layer
  never knows which chain the data came from; adding Solana touched no existing
  module's logic.
- **No build step:** Node's native type stripping (stable since Node 24 LTS) runs
  `src/index.ts` and `node --test` directly.
- **Tests:** 39 tests, one independent file per module, covering the pure logic:
  detection (real fixtures including BIP-173/350 vectors, synthetic base58check
  addresses, and the uppercase-bech32 regression), the EVM row-selection policy
  (active-chain filtering, inactive-everywhere fallback, dust balances), unit
  conversion precision, sanctions matching, CSV escaping, and secret redaction. The
  thin HTTP clients are deliberately not mock-tested; their contracts were verified
  against the live APIs.
- **Audit:** the code went through a multi-agent adversarial audit (six dimensions,
  findings verified by independent skeptics). It confirmed 10 findings, including the
  uppercase-bech32 sanctions bypass and a pending-transaction `last_seen` bug, all now
  fixed; 10 plausible-but-wrong findings were refuted.

## What production would add

Multi-hop exposure (transacting with sanctioned counterparties, not just being
sanctioned), entity attribution, batch input, retries and caching, list-freshness
guarantees (parse the SDN XML with integrity checks rather than trusting a mirror),
and a wider EVM probe set (BSC and others lack keyless Blockscout instances; Etherscan
v2 could cover them behind the optional key).

## Data attribution

Sanctions data: US Treasury OFAC SDN list (public domain), extracted by
[0xB10C/ofac-sanctioned-digital-currency-addresses](https://github.com/0xB10C/ofac-sanctioned-digital-currency-addresses)
(MIT). On-chain data: [Blockstream Esplora](https://blockstream.info),
[mempool.space](https://mempool.space), [Blockscout](https://eth.blockscout.com),
Solana public RPC, and optionally [Etherscan](https://etherscan.io).
