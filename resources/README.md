# Spike: wallet screening CSV — research notes

Goal (from the root README): a script that takes a wallet address and outputs a CSV with
the address, its balance, and **up to four additional columns valuable when screening an
address**. "Screening" here is read in the AML/compliance sense — the columns should help
an analyst quickly judge whether an address warrants further investigation.

Documents in this folder:

| Doc | Contents |
| --- | --- |
| [01-screening-context.md](01-screening-context.md) | What address screening means and what questions the CSV should answer |
| [02-candidate-columns.md](02-candidate-columns.md) | Long-list of candidate columns with rationale and feasibility |
| [03-data-sources.md](03-data-sources.md) | APIs and datasets considered, with what was verified |
| [04-recommendation.md](04-recommendation.md) | Recommended stack, columns, CSV shape, and open questions |
| [05-chain-detection.md](05-chain-detection.md) | Inferring the chain from a bare address (input arrives chain-unknown) |
| [06-implementation-resources.md](06-implementation-resources.md) | Verified APIs, dependency choices, gotchas, and test fixtures for the TypeScript CLI |
| [07-test-addresses.md](07-test-addresses.md) | Verified fixture address set: supported, sanctioned, unsupported, and invalid cases |

Status: research/spike only — no implementation decisions are locked in yet.
