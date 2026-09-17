import { test } from "node:test";
import assert from "node:assert/strict";
import { lamportsToSol, satsToBtc, weiToNative } from "./units.ts";

test("satsToBtc formats with 8 decimal places", () => {
  assert.equal(satsToBtc(0), "0.00000000");
  assert.equal(satsToBtc(123), "0.00000123");
  assert.equal(satsToBtc(5_747_023_635), "57.47023635");
  assert.equal(satsToBtc(530_775_983_881_106), "5307759.83881106");
});

test("satsToBtc rejects unsafe or fractional input", () => {
  assert.throws(() => satsToBtc(1.5));
  assert.throws(() => satsToBtc(Number.MAX_SAFE_INTEGER + 1));
  assert.throws(() => satsToBtc(-1));
});

test("weiToNative keeps full precision above 2^53", () => {
  assert.equal(weiToNative("0"), "0.000000000000000000");
  assert.equal(weiToNative("1000000000000000000"), "1.000000000000000000");
  // 2^53 wei ≈ 0.009 ETH — Number division would corrupt this value.
  assert.equal(weiToNative("6712597953701629485"), "6.712597953701629485");
  assert.equal(weiToNative("123456789012345678901234567"), "123456789.012345678901234567");
});

test("weiToNative rejects malformed input", () => {
  assert.throws(() => weiToNative("not-a-number"));
  assert.throws(() => weiToNative("-1"));
});

test("lamportsToSol formats with 9 decimal places and rejects unsafe values", () => {
  assert.equal(lamportsToSol(0), "0.000000000");
  assert.equal(lamportsToSol(1), "0.000000001");
  assert.equal(lamportsToSol(2_039_280), "0.002039280");
  assert.equal(lamportsToSol(5_000_000_000), "5.000000000");
  // Above 2^53 the JSON number has already lost precision — must fail loudly.
  assert.throws(() => lamportsToSol(2 ** 53));
  assert.throws(() => lamportsToSol(-1));
});
