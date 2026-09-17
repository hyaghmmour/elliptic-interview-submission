import { test } from "node:test";
import assert from "node:assert/strict";
import { buildEvmSanctionsSet } from "./ofac.ts";

test("EVM matching is case-insensitive (list casing is inconsistent)", () => {
  const set = buildEvmSanctionsSet([
    ["0x098B716B8Aaf21512996dC57EB0615e2383E2f96"], // mixed-case list entry
    ["0x1da5821544e25c636c1417ba96ade4cf6d2f9b5a"], // lowercase list entry
  ]);
  assert.equal(set.has("0x098b716b8aaf21512996dc57eb0615e2383e2f96"), true);
  assert.equal(set.has("0x1DA5821544e25c636c1417Ba96Ade4Cf6D2f9B5A".toLowerCase()), true);
  assert.equal(set.has("0x0000000000000000000000000000000000000001"), false);
});

test("buildEvmSanctionsSet unions lists and drops non-0x entries (USDT list mixes Tron addresses)", () => {
  const set = buildEvmSanctionsSet([
    ["0xAAaAaAaaAaAaAaaAaAAAAAAAAaaaAaAaAaaAaaAa"],
    ["TN6bfoJZZ5wjDNGz4ZrDLpFdCiJPBLU2FF", "0xBBbBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbBb"],
  ]);
  assert.equal(set.size, 2);
  assert.equal(set.has("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"), true);
  assert.equal(set.has("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"), true);
});

test("an empty union matches nothing", () => {
  assert.equal(buildEvmSanctionsSet([]).size, 0);
  assert.equal(buildEvmSanctionsSet([[]]).has("0x098b716b8aaf21512996dc57eb0615e2383e2f96"), false);
});
