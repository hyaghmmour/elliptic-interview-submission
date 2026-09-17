# 03 — Data sources

**Hard constraint:** all data must be free — no paywalls, no paid credits. Free-tier
API keys are acceptable (clarified 2026-09-16), but keyless sources are still strongly
preferred: the reviewer should be able to clone the repo and run the script with zero
provisioning, so keyed sources are best used as optional fallbacks (e.g. behind an env
var), never as the default path.

## Verified (fetched during this spike, 2026-09-16)

### Blockstream Esplora API (Bitcoin) — primary candidate
- Base: `https://blockstream.info/api`
- `GET /address/:address` returns `chain_stats` with `tx_count`, `funded_txo_count`,
  `funded_txo_sum`, `spent_txo_count`, `spent_txo_sum` (and `mempool_stats` with the
  same shape for unconfirmed activity).
  - Balance = `funded_txo_sum - spent_txo_sum` (satoshis).
  - `total_received` = `funded_txo_sum`. `tx_count` comes for free.
- `GET /address/:address/txs` — up to 50 mempool + first 25 confirmed txs.
- `GET /address/:address/txs/chain[/:last_seen_txid]` — confirmed txs, paginated 25/page
  (needed for `first_seen` and exposure checks).
- **No API key.** No documented rate limits (public instance is informally rate-limited;
  fine for a single-address script, worth a retry/backoff anyway).
- Same API is served by `mempool.space/api` — a drop-in fallback host.

### Blockscout API (Ethereum / EVM) — primary candidate for `0x…` addresses
- Base: `https://eth.blockscout.com/api/v2` (Blockscout is open-source explorer
  software; the hosted instances are keyless). Verified live during this spike:
- `GET /addresses/:address` → `coin_balance` (wei, as a decimal string — needs BigInt
  handling), plus useful extras: `is_contract`, `is_scam`, `ens_domain_name`.
- `GET /addresses/:address/counters` → `transactions_count` (also a string).
- `GET /addresses/:address/transactions` → paginated, newest first, each item carries a
  `timestamp` → gives `last_seen` from the first page.
- **No API key.** Instances exist for many EVM chains (Polygon, Gnosis, Optimism, …) —
  relevant to the EVM-ambiguity stretch in [05](05-chain-detection.md).

### OFAC sanctioned digital-currency addresses
- Source of truth: US Treasury SDN list
  (`https://www.treasury.gov/ofac/downloads/sanctions/1.0/sdn_advanced.xml`).
- Practical form: `0xB10C/ofac-sanctioned-digital-currency-addresses` (GitHub) publishes
  extracted per-asset TXT/JSON lists on its `lists` branch, regenerated **nightly at
  00:00 UTC** by GitHub Actions. Covers 18 assets including BTC (`XBT`) and ETH — one
  list per asset, matching the chain-detection output.
- Raw file URL pattern:
  `https://raw.githubusercontent.com/0xB10C/ofac-sanctioned-digital-currency-addresses/lists/sanctioned_addresses_XBT.txt`
- **No API key.** Nightly freshness is acceptable for this exercise; note it as a
  limitation (a production screener would parse the SDN XML directly or use a vendor).

## Considered, not selected

| Source | Notes |
| --- | --- |
| Chainalysis free sanctions screening API (`public.chainalysis.com`) | Free key would be acceptable, but its historic docs URL now redirects to their support portal (checked during spike) — availability unclear, and the OFAC list covers the same signal keylessly. |
| Etherscan (Ethereum) | Free-tier key is acceptable under the clarified constraint — viable as an *optional* ETH fallback behind an env var. Blockscout stays primary because it needs no provisioning at all. |
| Blockchair | Keyless tier exists but is heavily throttled (~1 req/s bursts, daily caps) and pushes paid credits — borderline on the constraint, and worse than Esplora anyway. |
| blockchain.info | Keyless BTC data, but older API, less consistent field naming than Esplora. |
| CoinGecko simple price API | Keyless; only needed if we add a fiat-value column. |

## Chain choice — superseded

An earlier version of this doc argued for Bitcoin-only. That is superseded by the
requirement that input addresses arrive **without a known chain**
([05-chain-detection.md](05-chain-detection.md)): the script now detects the chain and
must support at least Bitcoin *and* Ethereum. Blockscout (above) is what makes the
Ethereum side possible within the free/keyless constraint — Etherscan, Alchemy and
Infura all fail it, and bare public RPC endpoints expose current balance only, with no
transaction history.
