// Run: npm test  (node --import tsx --test)
//
// Proves the P_SIGN algorithm against the three test vectors in
// docs/bcc-payment-integration.md §3. If these pass, the signing primitive is
// byte-for-byte correct — the single most error-prone part of the integration.

import { test } from "node:test";
import assert from "node:assert/strict";
import { assembleMacKey, pSign, sourceString } from "./sign";

// Public test key from the BCC doc (assembled from its two components).
const KEY = "6BB0AC02E47BDF73D98FEB777F3B5294";

test("assembleMacKey XORs the two doc components into the test key", () => {
  assert.equal(
    assembleMacKey(
      "690B5589573ACB3608DB7395A319B175",
      "02BBF98BB3411445D15498E2DC22E3E1",
    ),
    KEY,
  );
});

test("P_SIGN — TRTYPE=1 (purchase) vector", () => {
  const values = [
    "350.00",
    "398",
    "3558714461568",
    "merchantname",
    "88888881",
    "0",
    "20200224073921",
    "1",
    "F2B2DD7E603A7AAF5E1BC35DEE1F6C9A",
  ];
  assert.equal(
    sourceString(values),
    "6350.00339813355871446156812merchantname8888888811014202002240739211132F2B2DD7E603A7AAF5E1BC35DEE1F6C9A",
  );
  assert.equal(pSign(values, KEY), "9B1C58714CFF6E4BCC6E97B4D503275838F4ED68");
});

test("P_SIGN — TRTYPE=90 (status) vector", () => {
  const values = [
    "3558714461568",
    "88888881",
    "20200224073921",
    "90",
    "F2B2DD7E603A7AAF5E1BC35DEE1F6C9A",
  ];
  assert.equal(pSign(values, KEY), "7C0D8BF3F6C7DCB0AA35E88F045292E176184B5E");
});

test("P_SIGN — TRTYPE=14 (refund) vector", () => {
  const values = [
    "3558714461568",
    "350.00",
    "350.00",
    "398",
    "821185120045",
    "9C2176F638FDC05C",
    "88888881",
    "20200224073921",
    "14",
    "F2B2DD7E603A7AAF5E1BC35DEE1F6C9A",
  ];
  assert.equal(pSign(values, KEY), "0D8ABFC1215135BD51AB27C10E2CD621C5AF1432");
});
