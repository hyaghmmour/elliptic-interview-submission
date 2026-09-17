import type { WalletReport } from "./types.ts";

/** Column order mirrors resources/04-recommendation.md. */
export const CSV_HEADER = [
  "address",
  "balance",
  "chain",
  "tx_count",
  "last_seen",
  "is_sanctioned",
] as const;

/** RFC 4180: quote a field iff it contains a quote, comma, CR or LF; double inner quotes. */
export function escapeField(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

export function toCsv(rows: readonly (readonly string[])[]): string {
  return rows.map((row) => row.map(escapeField).join(",")).join("\r\n") + "\r\n";
}

/** A failed source (null) becomes an empty cell, not a fabricated value. */
export function reportToRow(report: WalletReport): string[] {
  return [
    report.address,
    report.activity ? `${report.activity.balance} ${report.activity.currency}` : "",
    report.chain,
    report.activity?.txCount != null ? String(report.activity.txCount) : "",
    report.activity?.lastSeen ?? "",
    report.isSanctioned === null ? "" : String(report.isSanctioned),
  ];
}
