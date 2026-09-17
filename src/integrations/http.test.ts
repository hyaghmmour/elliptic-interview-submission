import { test } from "node:test";
import assert from "node:assert/strict";
import { redactSecrets } from "./http.ts";

test("redactSecrets masks apikey query params in URLs and echoed bodies", () => {
  assert.equal(
    redactSecrets("GET https://api.etherscan.io/v2/api?chainid=1&module=account&apikey=SECRET123 → HTTP 503"),
    "GET https://api.etherscan.io/v2/api?chainid=1&module=account&apikey=*** → HTTP 503",
  );
  assert.equal(redactSecrets("?apikey=abc&other=1"), "?apikey=***&other=1");
  assert.equal(redactSecrets('{"error":"bad apikey=xyz"}'), '{"error":"bad apikey=***"}');
});

test("redactSecrets leaves secret-free text untouched", () => {
  const msg = "GET https://blockstream.info/api/address/x → HTTP 400: base58 error";
  assert.equal(redactSecrets(msg), msg);
});
