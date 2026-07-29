import test from "node:test";
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { createReceiptEIP712 } from "@x402/extensions/offer-receipt";
import { verifyOfferReceipt, receiptEvidenceEnvelope } from "./x402_offer_receipt_verifier.mjs";

const account = privateKeyToAccount(generatePrivateKey());
const signer = async typedData => account.signTypedData(typedData);

test("verifies an EIP-712 Base receipt without writing payment data", async () => {
  const receipt = await createReceiptEIP712({ resourceUrl: "https://baseproofpay-x402.onrender.com/api/inventory-entitlement-evidence", payer: "0x9903E1e8C871321ee2Ed80cea8a5899F0992ba9e", network: "eip155:8453", transaction: "0x" + "11".repeat(32) }, signer);
  const result = await verifyOfferReceipt(receipt);
  assert.equal(result.valid, true);
  assert.equal(receiptEvidenceEnvelope(result).paymentOrErpWrite, false);
});

test("rejects a receipt for another network", async () => {
  const receipt = await createReceiptEIP712({ resourceUrl: "https://example.test", payer: "0x9903E1e8C871321ee2Ed80cea8a5899F0992ba9e", network: "eip155:84532" }, signer);
  assert.deepEqual(await verifyOfferReceipt(receipt), { valid: false, error: "network_mismatch" });
});
