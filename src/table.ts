/**
 * Minimal box-drawing table renderer for terminal output. Pure — layout is
 * computed on plain cell text; `decorate` wraps the already-padded cell (e.g.
 * in ANSI colors) so styling can never break column alignment.
 */
export function renderTable(
  header: readonly string[],
  rows: readonly (readonly string[])[],
  decorate: (paddedCell: string, colIndex: number, isHeader: boolean) => string = (cell) => cell,
): string {
  const widths = header.map((h, col) =>
    Math.max(h.length, ...rows.map((row) => (row[col] ?? "").length)),
  );

  const rule = (left: string, mid: string, right: string) =>
    left + widths.map((w) => "─".repeat(w + 2)).join(mid) + right;

  const render = (row: readonly string[], isHeader: boolean) =>
    "│" +
    widths.map((w, col) => ` ${decorate((row[col] ?? "").padEnd(w), col, isHeader)} `).join("│") +
    "│";

  return [
    rule("┌", "┬", "┐"),
    render(header, true),
    rule("├", "┼", "┤"),
    ...rows.map((row) => render(row, false)),
    rule("└", "┴", "┘"),
  ].join("\n");
}
