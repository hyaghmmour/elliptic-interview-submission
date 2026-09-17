import { test } from "node:test";
import assert from "node:assert/strict";
import { selectEvmRows, type EvmProbe } from "./evm.ts";

const inactive = { balance: "0.000000000000000000", currency: "ETH", txCount: 0, lastSeen: null };
const active = { balance: "6.712597953701629485", currency: "ETH", txCount: 78353, lastSeen: "2026-09-15T11:05:11.000Z" };

test("selects every chain with activity", () => {
  const probes: EvmProbe[] = [
    { chain: "ethereum", activity: active },
    { chain: "polygon", activity: { ...inactive, txCount: 7625 } },
    { chain: "base", activity: inactive },
    { chain: "arbitrum", activity: null }, // probe failed
    { chain: "optimism", activity: { ...inactive, balance: "0.181069591874347534" } },
  ];
  assert.deepEqual(
    selectEvmRows(probes).map((p) => p.chain),
    ["ethereum", "polygon", "optimism"],
  );
});

test("falls back to a single ethereum row when inactive everywhere", () => {
  const probes: EvmProbe[] = [
    { chain: "ethereum", activity: inactive },
    { chain: "polygon", activity: inactive },
  ];
  const rows = selectEvmRows(probes);
  assert.equal(rows.length, 1);
  assert.equal(rows[0]?.chain, "ethereum");
  assert.deepEqual(rows[0]?.activity, inactive); // zeros, not nulls — it WAS screened
});

test("emits a null-activity ethereum row when every probe failed", () => {
  const rows = selectEvmRows([
    { chain: "ethereum", activity: null },
    { chain: "polygon", activity: null },
  ]);
  assert.deepEqual(rows, [{ chain: "ethereum", activity: null }]);
});

test("a dust balance alone counts as activity", () => {
  const rows = selectEvmRows([
    { chain: "ethereum", activity: inactive },
    { chain: "base", activity: { ...inactive, balance: "0.000000000000000001" } },
  ]);
  assert.deepEqual(
    rows.map((p) => p.chain),
    ["base"],
  );
});
