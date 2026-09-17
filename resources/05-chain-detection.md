# 05 — Chain detection (input address arrives without a chain)

New constraint: the wallet address is provided **without knowing which chain it belongs
to**. The script must infer the chain from the address format before it can fetch
anything. This is genuinely how screening intake often works (a bare address pasted from
a SAR, a chat log, a customer form), so it's a realistic requirement — but it has hard
limits that must be documented, not papered over.

## How much the format tells you

Address formats are self-describing to different degrees:

| Format | Example prefix | Decodes to | Chain inference |
| --- | --- | --- | --- |
| Bech32/Bech32m | `bc1q…`, `bc1p…` | HRP + witness program | **Unambiguous** — the human-readable part (`bc` = Bitcoin, `ltc` = Litecoin, `tb` = testnet) names the chain by design |
| Base58Check | `1…`, `3…` | version byte + 20-byte hash + checksum | **Reliable** — version byte 0x00/0x05 = Bitcoin, 0x30 = Litecoin (`L…`), 0x1E = Dogecoin (`D…`), 0x41 = Tron (`T…`). Checksum validates we decoded correctly |
| EVM hex | `0x` + 40 hex | 20-byte account | **Family only** — identifies "an EVM chain" but the *same* address exists on Ethereum, Polygon, BSC, Arbitrum, … Optional EIP-55 mixed-case checksum validates integrity, not chain |
| Base58 (raw, 32 bytes) | Solana | ed25519 pubkey | Distinguishable from Base58Check by decoded length (32 bytes, no version/checksum) |
| Base58 (ripple alphabet) | `r…` | XRP account | Distinct alphabet |

Two honest limitations:

1. **EVM ambiguity is intrinsic.** No amount of parsing tells you whether `0x…` is an
   Ethereum, Polygon, or BSC address — it is all of them simultaneously. Policy options:
   - (a) assume Ethereum mainnet and record the assumption in the output;
   - (b) probe several chains and report where activity exists (Blockscout runs keyless
     instances for many EVM chains, so this is feasible — but multiplies calls and
     turns "detection" into "search").
   **Implemented: (b)** (upgraded from (a) on request). Detection returns the family
   (`evm`); the orchestrator probes Ethereum, Polygon, Base, Arbitrum and Optimism
   concurrently and emits one CSV row per chain with activity (single Ethereum row if
   inactive everywhere). Bad actors bridge across EVM chains — single-chain screening
   misses parked funds. BSC has no keyless Blockscout instance, but its OFAC list is
   still included in the EVM sanctions union.
2. **Detection is validation, not attribution.** A string that *parses* as a Bitcoin
   address may never have been used. "Detected: Bitcoin, no activity found" is itself a
   useful screening output and must not be treated as an error.

## Proposed detection algorithm (ordered, first match wins)

```
1. /^0x[0-9a-fA-F]{40}$/         → EVM (validate EIP-55 checksum if mixed-case)
2. bech32/bech32m decode ok      → chain by HRP: bc→BTC, tb→BTC-testnet, ltc→LTC
3. base58check decode ok (25B)   → chain by version byte: 0x00,0x05→BTC; 0x30→LTC;
                                    0x1E→DOGE; 0x41→TRON
4. base58 decode = 32 bytes      → Solana
5. otherwise                     → reject with a clear "unrecognised format" error
```

Steps 2–4 do real decoding (checksum verification), not just prefix regexes — a prefix
match without a valid checksum is a typo, and screening tools must fail loudly on typos
rather than report a wrong address as clean.

## Support scope

Full support (fetch data, all columns): **Bitcoin**, **Ethereum** and **Solana** — all
have verified keyless data sources ([03](03-data-sources.md)) and OFAC list coverage.
Solana caveat: its addresses are raw ed25519 keys with no checksum, so unlike BTC/ETH a
typo'd Solana address is indistinguishable from a real one, and the RPC has no total
transaction count (that cell stays empty).

Recognised but unsupported (LTC, DOGE, TRON, XRP): detect and report
`"detected Litecoin — not supported"` rather than "invalid address". Distinguishing
*can't parse* from *won't fetch* is cheap and shows the detection layer works.

## Impact on the CSV columns

- `chain` becomes one of the four additional columns — with unknown-chain input, the
  detected chain is arguably the single most load-bearing output field.
- Remaining columns must have **uniform semantics on both chains**. This demotes
  `total_received` (free on Esplora, but requires summing full tx history on Ethereum —
  no cheap Blockscout equivalent) and promotes `tx_count` + `last_seen` +
  `is_sanctioned`, all of which are one cheap call on either chain.
- `balance` is reported in native units (BTC or ETH); the `chain` column disambiguates
  the unit.
