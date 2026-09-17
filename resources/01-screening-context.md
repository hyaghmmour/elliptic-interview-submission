# 01 — What "screening an address" means

Address screening is the first, cheap check a compliance team runs before touching funds
associated with a wallet: an exchange screening a deposit address, a payments firm
screening a withdrawal destination, or an investigator triaging a lead. The output is not
a verdict — it is a small set of signals that decide whether to **allow, hold, or
escalate**.

## Questions a screener asks

1. **Is this address directly bad?**
   Is it on a sanctions list (OFAC SDN) or attributed to a known illicit entity
   (darknet market, ransomware, scam, mixer)?

2. **Who is it near?** (exposure)
   Even if the address itself is clean, has it transacted with sanctioned or high-risk
   counterparties? Direct (one-hop) exposure is the strongest and cheapest version of
   this signal.

3. **How big and how active is it?**
   Lifetime volume received/sent and transaction count. A dormant address that received
   0.001 BTC once is a different risk conversation than one that has churned 5,000 BTC
   through 10,000 transactions.

4. **What is its lifecycle?**
   When was it first and last active? Freshly created addresses receiving large sums,
   or long-dormant addresses suddenly waking up, are classic risk patterns
   (peel chains, hack fund movement).

5. **What kind of address is it?**
   On account-based chains: contract vs. externally-owned account. On UTXO chains:
   script type, address reuse.

## Implication for the CSV

The four extra columns should cover as many of these questions as possible with **one
column per question**, rather than four columns answering the same question. A direct
sanctions flag (Q1) plus activity/volume/lifecycle stats (Q3, Q4) gives a rounded
picture; exposure (Q2) is the highest-value signal but also the most expensive to
compute, so it needs a feasibility check (see 02 and 04).
