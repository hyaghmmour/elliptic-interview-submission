import { test } from "node:test";
import assert from "node:assert/strict";
import { escapeField, reportToRow, toCsv, CSV_HEADER } from "./csv.ts";

test("escapeField leaves plain values untouched", () => {
  assert.equal(escapeField("bc1qw4cxpe6sxa5dg6sdwxjph959cw6yztrzl4r54s"), "bc1qw4cxpe6sxa5dg6sdwxjph959cw6yztrzl4r54s");
  assert.equal(escapeField("0.00000547"), "0.00000547");
});

test("escapeField quotes commas, quotes, and newlines per RFC 4180", () => {
  assert.equal(escapeField("a,b"), '"a,b"');
  assert.equal(escapeField('say "hi"'), '"say ""hi"""');
  assert.equal(escapeField("line1\nline2"), '"line1\nline2"');
});

test("toCsv joins with CRLF and ends with a trailing newline", () => {
  assert.equal(toCsv([["a", "b"], ["1", "2"]]), "a,b\r\n1,2\r\n");
});

test("reportToRow degrades failed sources to empty cells", () => {
  const row = reportToRow({
    address: "12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h",
    chain: "bitcoin",
    activity: null,
    isSanctioned: true,
  });
  assert.deepEqual(row, ["12QtD5BFwRsdNsAZY76UVE1xyCGNTojH9h", "", "bitcoin", "", "", "true"]);
  assert.equal(row.length, CSV_HEADER.length);
});

test("reportToRow leaves tx_count empty when the source has no total count (etherscan fallback)", () => {
  const row = reportToRow({
    address: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
    chain: "ethereum",
    activity: { balance: "101.802486783767055350", currency: "ETH", txCount: null, lastSeen: "2026-07-27T10:14:47.000Z" },
    isSanctioned: true,
  });
  assert.deepEqual(row, [
    "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
    "101.802486783767055350 ETH",
    "ethereum",
    "",
    "2026-07-27T10:14:47.000Z",
    "true",
  ]);
});

test("reportToRow renders a zero tx_count as \"0\", not an empty cell", () => {
  const row = reportToRow({
    address: "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
    chain: "bitcoin",
    activity: { balance: "0.00000000", currency: "BTC", txCount: 0, lastSeen: null },
    isSanctioned: false,
  });
  assert.deepEqual(row, [
    "bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0",
    "0.00000000 BTC",
    "bitcoin",
    "0",
    "",
    "false",
  ]);
});

test("reportToRow renders a full report", () => {
  const row = reportToRow({
    address: "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
    chain: "ethereum",
    activity: { balance: "0.05", currency: "ETH", txCount: 42, lastSeen: "2026-09-15T11:05:11Z" },
    isSanctioned: false,
  });
  assert.deepEqual(row, [
    "0x098B716B8Aaf21512996dC57EB0615e2383E2f96",
    "0.05 ETH",
    "ethereum",
    "42",
    "2026-09-15T11:05:11Z",
    "false",
  ]);
});
