import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { createReceiptEIP712 } from "@x402/extensions/offer-receipt";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const endpoint = process.env.X402_OFFER_RECEIPT_ENDPOINT ??
  "https://baseproofpay-x402.onrender.com/api/x402-offer-receipt/verify";
const resourceUrl = "https://baseproofpay-x402.onrender.com/api/inventory-entitlement-evidence";
const payer = "0x9903E1e8C871321ee2Ed80cea8a5899F0992ba9e";
const syntheticTransaction = `0x${"42".repeat(32)}`;

const account = privateKeyToAccount(generatePrivateKey());
const receipt = await createReceiptEIP712({
  resourceUrl,
  payer,
  network: "eip155:8453",
  transaction: syntheticTransaction
}, typedData => account.signTypedData(typedData));

const response = await fetch(endpoint, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ receipt })
});
const body = await response.json();

assert.equal(response.status, 200);
assert.equal(body.status, "verified_read_only");
assert.equal(body.network, "eip155:8453");
assert.equal(body.resourceUrl, resourceUrl);
assert.equal(body.payer, payer);
assert.equal(body.transaction, syntheticTransaction);
assert.equal(body.paymentOrErpWrite, false);

const evidence = {
  schema: "gayson.baseproofpay.x402_offer_receipt_live_audit",
  version: 1,
  verifiedAt: new Date().toISOString(),
  endpoint,
  syntheticControl: true,
  walletConnection: false,
  payment: false,
  erpWrite: false,
  response: body
};

const outputFlag = process.argv.indexOf("--output");
if (outputFlag !== -1) {
  const outputPath = process.argv[outputFlag + 1];
  if (!outputPath) throw new Error("--output requires a path");
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(evidence, null, 2)}\n`, "utf8");
}

process.stdout.write(`${JSON.stringify(evidence)}\n`);
