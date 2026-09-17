import { parseArgs } from "node:util";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { detect } from "./detect.ts";
import { renderTable } from "./table.ts";
import { startSpinner } from "./spinner.ts";
import { clients, isSanctioned, isSanctionedEvm, probeEvmChains, selectEvmRows } from "./integrations/index.ts";
import { CSV_HEADER, reportToRow, toCsv } from "./csv.ts";
import type { WalletReport } from "./types.ts";

const USAGE = `usage: node src/index.ts <wallet-address> [--output <file>]

Screens a cryptocurrency wallet address (chain detected from its format) and
writes a CSV. Bitcoin and solana produce one row; a 0x address is probed
across the EVM chains (ethereum, polygon, base, arbitrum, optimism) and
produces one row per chain with activity.

options:
  -o, --output <file>   output path (default: output/<address>.csv)
  -h, --help            show this message

environment:
  ETHERSCAN_API_KEY     optional — enables the Etherscan fallback (all EVM
                        chains, one key) when Blockscout is down. Loaded from
                        .env only via \`npm start\` (or pass
                        --env-file-if-exists=.env to node).`;

async function main(): Promise<number> {
  let values: { output?: string; help: boolean };
  let positionals: string[];
  try {
    ({ values, positionals } = parseArgs({
      allowPositionals: true,
      options: {
        output: { type: "string", short: "o" },
        help: { type: "boolean", short: "h", default: false },
      },
    }));
  } catch (err) {
    console.error(`error: ${err instanceof Error ? err.message : String(err)}\n\n${USAGE}`);
    return 2;
  }

  if (values.help) {
    console.log(USAGE);
    return 0;
  }
  const input = positionals[0]?.trim();
  if (positionals.length !== 1 || !input) {
    console.error(USAGE);
    return 2;
  }

  const detection = detect(input);
  if (detection.status === "invalid") {
    console.error(`error: unrecognised address format — ${detection.reason}`);
    return 1;
  }
  if (detection.status === "unsupported") {
    console.error(
      `error: address recognised as ${detection.chain} — supported: bitcoin, solana, and EVM (0x) addresses`,
    );
    return 1;
  }

  // Everything downstream uses the canonical form (bech32 case-normalised) so
  // an UPPERCASE encoding of a sanctioned address cannot dodge the list match.
  const { canonical: address } = detection;

  const label = detection.chain === "evm" ? "5 EVM chains" : detection.chain;
  const startedAt = Date.now();
  const stopSpinner = startSpinner(`screening ${address} across ${label} + OFAC list`);

  // Activity and sanctions are independent sources: fetch concurrently, and a
  // failure degrades to an empty cell with a warning (partial data still screens).
  const reports: WalletReport[] =
    detection.chain === "evm" ? await screenEvm(address) : await screenSingleChain(detection.chain, address);

  stopSpinner(`screened ${label} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`);

  const rows = reports.map(reportToRow);
  const outputPath = values.output ?? join("output", `${address}.csv`);
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, toCsv([CSV_HEADER, ...rows]));

  // Terminal view of the same rows — empty cells shown as a dimmed dash.
  const displayRows = rows.map((row) => row.map((cell) => (cell === "" ? "—" : cell)));
  console.log(renderTable(CSV_HEADER, displayRows, decorateCell));
  console.error(`wrote ${outputPath} (${reports.length} row${reports.length === 1 ? "" : "s"})`);

  const allFailed = reports.every((r) => r.activity === null) && reports[0]?.isSanctioned === null;
  return allFailed ? 1 : 0;
}

async function screenSingleChain(chain: "bitcoin" | "solana", address: string): Promise<WalletReport[]> {
  const [activity, sanctioned] = await Promise.allSettled([
    clients[chain].fetchActivity(address),
    isSanctioned(chain, address),
  ]);
  return [
    {
      address,
      chain,
      activity: fulfilledOrNull(activity, "on-chain activity"),
      isSanctioned: fulfilledOrNull(sanctioned, "sanctions check"),
    },
  ];
}

async function screenEvm(address: string): Promise<WalletReport[]> {
  const [probes, sanctioned] = await Promise.allSettled([probeEvmChains(address), isSanctionedEvm(address)]);
  // The sanctions verdict is entity-level (same wallet on every EVM chain).
  const isSanctionedVerdict = fulfilledOrNull(sanctioned, "sanctions check");
  const rows = selectEvmRows(probes.status === "fulfilled" ? probes.value : []);
  return rows.map(({ chain, activity }) => ({ address, chain, activity, isSanctioned: isSanctionedVerdict }));
}

const SANCTIONED_COL = CSV_HEADER.indexOf("is_sanctioned");

/** ANSI styling for the terminal table; plain text when stdout is piped. */
function decorateCell(cell: string, col: number, isHeader: boolean): string {
  if (!process.stdout.isTTY) return cell;
  if (isHeader) return `\x1b[1m${cell}\x1b[0m`;
  const value = cell.trimEnd();
  if (value === "—") return `\x1b[2m${cell}\x1b[0m`;
  if (col === SANCTIONED_COL && value === "true") return `\x1b[1;31m${cell}\x1b[0m`;
  if (col === SANCTIONED_COL && value === "false") return `\x1b[32m${cell}\x1b[0m`;
  return cell;
}

function fulfilledOrNull<T>(result: PromiseSettledResult<T>, label: string): T | null {
  if (result.status === "fulfilled") return result.value;
  const message = result.reason instanceof Error ? result.reason.message : String(result.reason);
  console.error(`warning: ${label} unavailable — ${message}`);
  return null;
}

process.exitCode = await main();
