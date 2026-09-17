# 04 — Recommendation

## Constraints (locked)

- Input is a bare wallet address with **no chain information** — the script infers the
  chain from the address format ([05-chain-detection.md](05-chain-detection.md)).
- All data sources must be **free** — no paywalls or paid credits. Keyless sources are
  the default path; free-tier keys are acceptable for optional fallbacks only
  ([03-data-sources.md](03-data-sources.md)).

## Stack

- **Language:** TypeScript (repo already has `index.ts`).
- **Chains fully supported:** Bitcoin (Blockstream Esplora), Solana (public JSON-RPC)
  and five EVM chains — Ethereum, Polygon, Base, Arbitrum, Optimism — probed via their
  keyless Blockscout instances, one CSV row per chain with activity (see
  [05](05-chain-detection.md)). Other recognisable formats (LTC, DOGE, TRON, XRP) are
  detected and reported as unsupported rather than rejected as invalid. (Solana was
  promoted from recognised-only after confirming the keyless RPC and the OFAC SOL
  list; its `tx_count` is empty — no total-count endpoint — and its addresses carry no
  checksum, so typo detection is impossible there.)
- **Sanctions data:** OFAC per-asset address lists (nightly-updated GitHub mirror).

## Proposed CSV (address + balance + 4 columns)

| Column | BTC source | ETH source | Screening question |
| --- | --- | --- | --- |
| `address` | input | input | — |
| `balance` | Esplora `funded − spent` (sats → BTC) | Blockscout `coin_balance` (wei → ETH) | — |
| `chain` | detected from format | detected from format | What asset is this? (essential given unknown-chain input; flags the EVM-ambiguity assumption) |
| `tx_count` | Esplora `chain_stats.tx_count` | Blockscout counters `transactions_count` | Activity level |
| `last_seen` | Esplora tx list (newest first) | Blockscout tx list `timestamp` | Lifecycle: dormant vs live |
| `is_sanctioned` | OFAC `XBT` list | OFAC `ETH` list | Direct sanctions hit |

Changes from the earlier (Bitcoin-only) draft:

- **`chain` takes a column slot.** With unknown-chain input it is the most load-bearing
  field in the row.
- **`total_received` is dropped.** It is free on Esplora but has no cheap Blockscout
  equivalent (would require summing full tx history). Columns should mean the same
  thing on every supported chain; per-chain bonus columns make the CSV inconsistent.
- Everything that remains is one cheap call per source on either chain.

## Shape of the implementation (small on purpose)

Concrete library choices, verified API behaviors, and test fixtures live in
[06-implementation-resources.md](06-implementation-resources.md).

```
input address
  → detect chain (real decode + checksum, not prefix regex)   [pure function]
  → dispatch to chain client:
      BTC: Esplora  /address/:a  +  /address/:a/txs
      ETH: Blockscout /addresses/:a + /counters + /transactions (first page)
  → OFAC list for that asset (fetched per run; note list date)
  → write CSV row
```

- One module per concern: `detect.ts`, `clients/bitcoin.ts`, `clients/ethereum.ts`,
  `sanctions.ts`, `csv.ts`. Both clients return the same `WalletReport` shape — the
  CSV writer never knows which chain it was.
- ETH balances need **BigInt** (wei values overflow `Number`); Blockscout returns them
  as decimal strings — keep them as strings/BigInt until final formatting.
- Per-source failures degrade to an empty cell + stderr warning rather than aborting
  the row; detection failure (unparseable address) is the only hard error.
- Tests: pure parts are the priority — chain detection (happy paths, checksum
  failures, the EVM/Solana/Bitcoin lookalike edges), unit conversion (sats, wei),
  sanctions lookup, CSV escaping — against fixture JSON. HTTP glue stays thin and
  lightly tested.

## Open questions before implementation

1. Single address per run, or accept a file/stdin list? README says "a wallet address"
   (singular) — start there, keep the shape batch-friendly.
2. EVM ambiguity policy: assume Ethereum mainnet (recommended, documented in the
   `chain` column) vs probing multiple EVM Blockscout instances (stretch).
3. Output: `output.csv` with header, one row per input address — confirm.
