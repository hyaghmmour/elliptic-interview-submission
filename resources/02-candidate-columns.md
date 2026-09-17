# 02 — Candidate columns

Long-list of columns that could sit next to `address` and `balance`. Scored on screening
value, cost to compute, and explainability (we must be able to defend every column in
the interview).

## Tier 1 — strong candidates

### `is_sanctioned` (direct OFAC match)
- **Answers:** "Is this address directly bad?"
- **How:** exact match against the OFAC SDN digital-currency address list. The list is
  published by the US Treasury and extracted into per-asset text/JSON files, updated
  nightly ([see 03](03-data-sources.md)).
- **Cost:** one file download + set lookup. Trivial.
- **Caveat:** absence of a match is *not* a clean bill of health — it only means "not on
  this list". Column naming/docs must not overclaim.

### `tx_count`
- **Answers:** "How active is it?"
- **How:** returned directly by block explorer APIs (e.g. Esplora `chain_stats.tx_count`).
- **Cost:** free — same API call that returns the balance.

### `total_received` (lifetime inflow)
- **Answers:** "How big is it?" Balance alone hides history: an address that received
  10,000 BTC and now holds 0 looks identical to an unused one if you only show balance.
- **How:** Esplora `chain_stats.funded_txo_sum`; equivalents exist on other explorers.
- **Cost:** free — same API call as balance.

### `first_seen` / `last_seen` (activity window)
- **Answers:** "What is its lifecycle?" Age and dormancy.
- **How:** timestamps of the first and most recent transactions. Needs the transaction
  list endpoint; first-seen requires paginating to the oldest page for very active
  addresses (25 txs/page on Esplora), so cost scales with address history.
- **Cost:** 1–2 extra API calls for typical addresses; unbounded for exchange-scale
  addresses unless capped. A cap + "approximate" marker is acceptable for screening.

## Tier 2 — high value, higher cost

### `sanctioned_exposure` (one-hop counterparty check)
- **Answers:** "Who is it near?" — the core of what real screening products sell.
- **How:** fetch the address's transactions, extract counterparty addresses, intersect
  with the OFAC set.
- **Cost:** needs full (or capped) tx history and input/output parsing. On UTXO chains,
  "counterparty" is fuzzy (change outputs, batched payments) — must be framed as
  "appeared in a transaction with a sanctioned address", not "sent money to".
- **Verdict:** great differentiator if time allows; must be honest about caps and UTXO
  semantics. Candidate for the 4th column over one of first/last seen.

## Tier 3 — considered and rejected

| Column | Why rejected |
| --- | --- |
| Entity label ("Binance", "Hydra") | Attribution data is proprietary (that's Elliptic's product); public tag sources (address-tag dumps, forums) are stale/unreliable. Don't ship a column we can't stand behind. |
| Custodial vs non-custodial | High screening value (KYC'd customer behind custodial deposit addresses; FATF unhosted-wallet rules) but it *is* entity attribution — no honest free-data answer. `is_contract` is not a proxy (Safe = contract + non-custodial; exchange hot wallet = EOA + custodial); behavioral heuristics are indicative, not defensible. |
| Volume (lifetime value moved) — considered again after going multi-chain | Free on BTC (Esplora `funded_txo_sum`) but no keyless ETH equivalent: counters give counts, not value sums, and a native-ETH sum ignores internal txs and token transfers, so the number would be misleading for exactly the addresses that matter. Fails "uniform semantics across chains"; `tx_count` stays. |
| Risk score (0–100) | A composite score is arbitrary without a defensible model; raw signals are more honest and more useful in an interview discussion. |
| Fiat value of balance | Nice-to-have display concern, adds a price-API dependency and a "as of when?" ambiguity; balance in native units is unambiguous. Possible 5th column if trivially free. |
| Contract vs EOA | Only meaningful on account-based chains, so it can't have uniform semantics across detected chains (empty for every BTC row). Blockscout does return `is_contract` for free — a candidate if a fifth slot ever opens. |
| Cluster size / co-spend heuristics | Real chain-analysis territory, but needs graph infrastructure — out of scope for a small script. |

## Working shortlist (max 4)

1. `is_sanctioned`
2. `tx_count`
3. `total_received`
4. `first_seen` + `last_seen` **or** `sanctioned_exposure` — decided in
   [04-recommendation.md](04-recommendation.md).
