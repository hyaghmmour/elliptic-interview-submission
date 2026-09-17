import { test } from "node:test";
import assert from "node:assert/strict";
import { renderTable } from "./table.ts";

test("renders an aligned box table", () => {
  const out = renderTable(
    ["chain", "balance"],
    [
      ["bitcoin", "57.47023635"],
      ["solana", "0.038850746"],
    ],
  );
  assert.equal(
    out,
    [
      "┌─────────┬─────────────┐",
      "│ chain   │ balance     │",
      "├─────────┼─────────────┤",
      "│ bitcoin │ 57.47023635 │",
      "│ solana  │ 0.038850746 │",
      "└─────────┴─────────────┘",
    ].join("\n"),
  );
});

test("columns widen to the widest cell, header included", () => {
  const out = renderTable(["a_long_header", "b"], [["x", "y"]]);
  assert.match(out, /│ a_long_header │ b │/);
  assert.match(out, /│ x             │ y │/);
});

test("decorate wraps the padded cell without breaking alignment", () => {
  const out = renderTable(["h"], [["true"], [""]], (cell, _col, isHeader) =>
    isHeader ? cell : `<${cell}>`,
  );
  // Both data cells are padded to the same width BEFORE decoration.
  assert.match(out, /│ <true> │/);
  assert.match(out, /│ <    > │/);
});
