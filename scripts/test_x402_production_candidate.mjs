import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import {
  decodePaymentRequiredHeader,
  decodePaymentResponseHeader,
  encodePaymentSignatureHeader
} from "@x402/core/http";
import { appendPaymentIdentifierToExtensions } from "@x402/extensions/payment-identifier";
import {
  BuilderCodeFacilitatorExtension,
  parseBuilderCodeSuffixFromCalldata
} from "@x402/extensions/builder-code";
import {
  createCdpFacilitatorFromEnvironment,
  createX402ProductionCandidate
} from "./x402_production_candidate_server.mjs";
import { MemoryPaymentIdempotencyStore } from "./x402_idempotency_guard.mjs";

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });
}

const paymentId = "pay_baseproofpay_20260720_0001";
const payer = "0x1111111111111111111111111111111111111111";
const transaction = `0x${"ab".repeat(32)}`;

class SimulatedMainnetFacilitator {
  constructor() {
    this.calls = { supported: 0, verify: 0, settle: 0 };
  }

  async getSupported() {
    this.calls.supported += 1;
    return {
      kinds: [{ x402Version: 2, scheme: "exact", network: "eip155:8453" }],
      extensions: ["payment-identifier", "builder-code"],
      signers: { "eip155:8453": [] }
    };
  }

  async verify() {
    this.calls.verify += 1;
    return { isValid: true, payer };
  }

  async settle() {
    this.calls.settle += 1;
    return { success: true, payer, transaction, network: "eip155:8453" };
  }
}

let facilitator;
let candidate;
let server;
let baseUrl;
let challenge;
let paymentHeader;
let inventoryChallenge;
let b20PolicyChallenge;

before(async () => {
  facilitator = new SimulatedMainnetFacilitator();
  candidate = await createX402ProductionCandidate({ facilitator });
  server = await listen(candidate.app);
  const address = server.address();
  baseUrl = `http://127.0.0.1:${address.port}`;

  const response = await fetch(`${baseUrl}/api/reconciliation-evidence`, {
    headers: { accept: "application/json" }
  });
  challenge = decodePaymentRequiredHeader(response.headers.get("payment-required"));
  const extensions = structuredClone(challenge.extensions);
  appendPaymentIdentifierToExtensions(extensions, paymentId);
  paymentHeader = encodePaymentSignatureHeader({
    x402Version: 2,
    resource: challenge.resource,
    accepted: challenge.accepts[0],
    payload: { simulation: true },
    extensions
  });
  const inventoryResponse = await fetch(`${baseUrl}/api/inventory-entitlement-evidence`, {
    headers: { accept: "application/json" }
  });
  inventoryChallenge = decodePaymentRequiredHeader(inventoryResponse.headers.get("payment-required"));
  const b20PolicyResponse = await fetch(`${baseUrl}/api/catbox-policy-evidence`, {
    headers: { accept: "application/json" }
  });
  b20PolicyChallenge = decodePaymentRequiredHeader(b20PolicyResponse.headers.get("payment-required"));
});

after(() => server ? new Promise(resolve => server.close(resolve)) : undefined);

test("production facilitator cannot start without environment credentials", () => {
  assert.throws(
    () => createCdpFacilitatorFromEnvironment({}),
    /CDP_API_KEY_ID and CDP_API_KEY_SECRET are required/
  );
});

test("ambiguous failures remain locked for manual review", () => {
  const store = new MemoryPaymentIdempotencyStore();
  assert.equal(store.reserve("pay_failure_review_0001", "fingerprint-a").accepted, true);
  store.fail("pay_failure_review_0001", { statusCode: 500, requiresManualReview: true });
  const retry = store.reserve("pay_failure_review_0001", "fingerprint-a");
  assert.equal(retry.accepted, false);
  assert.equal(retry.reason, "already_failed");
  assert.equal(retry.entry.failure.requiresManualReview, true);
  assert.equal(store.reserve("pay_failure_review_0001", "fingerprint-b").reason, "identifier_conflict");
});

test("health endpoint is public and never verifies or settles", async () => {
  const response = await fetch(`${baseUrl}/healthz`, {
    headers: { accept: "application/json" }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "ok",
    service: "BaseProofPay",
    network: "eip155:8453",
    paymentRequired: true
  });
  assert.equal(facilitator.calls.verify, 0);
  assert.equal(facilitator.calls.settle, 0);
});

test("release endpoint exposes the exact Render source without secrets or write claims", async () => {
  const response = await fetch(`${baseUrl}/api/release`, {
    headers: { accept: "application/json" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  const release = await response.json();
  assert.equal(release.network, "eip155:8453");
  assert.equal(release.boundaries.walletAutoConnect, false);
  assert.equal(release.boundaries.erpWrite, false);
  assert.equal(release.boundaries.receiptVerification, "read_only");
  assert.equal(JSON.stringify(release).includes("CDP_API_KEY"), false);
  assert.equal(facilitator.calls.verify, 0);
  assert.equal(facilitator.calls.settle, 0);
});

test("agent commerce resource catalog is public, explicit, and never settles", async () => {
  const response = await fetch(`${baseUrl}/api/agent-commerce-resources`, {
    headers: { accept: "application/json" }
  });
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const catalog = await response.json();
  assert.equal(catalog.network, "eip155:8453");
  assert.equal(catalog.paymentTerms.price, "$0.01");
  assert.equal(catalog.paymentTerms.payTo, "0xBa36D092dB2999bb1FaBbaf281AC956A97189C25");
  assert.equal(catalog.paymentTerms.builderCode, "bc_iscm570t");
  assert.deepEqual(catalog.resources.map(resource => resource.id), [
    "reconciliation-evidence",
    "inventory-entitlement-evidence",
    "catbox-policy-evidence"
  ]);
  assert.equal(catalog.resources[1].businessEventClass, "BASE-XERP-INVENTORY-01");
  assert.equal(catalog.resources[1].ledgerHandoff, "read_only_evidence");
  assert.equal(catalog.resources[2].proofNetwork, "eip155:84532");
  assert.equal(catalog.resources[2].burnTx, "0xe1e478bbd25430d0d4f06683ae95e6f3999645995ddebc4afcc7918a003c8d40");
  assert.equal(catalog.resources[2].closingSupply, "90 CATBOX");
  assert.equal(catalog.resources[2].transferPolicy, "ALWAYS_BLOCK");
  assert.equal(catalog.resources[2].ledgerHandoff, "testnet_policy_evidence_only");
  assert.deepEqual(catalog.boundaries, {
    walletConnection: false,
    automaticPayment: false,
    erpWrite: false,
    inventoryValuation: "ERPNext"
  });
  assert.deepEqual(catalog.publicEvidenceAnchor, {
    businessEventId: "BASE-LAB-X402-CATALOG-20260727-001",
    transactionHash: "0xd258fd6882499054e8ffd103c4ba2c09f8f79b0fede1dcf6ca1eaef78aa53fce",
    registry: "0x17fD9e593320461204887Bb2644e2F013FeF55bD",
    evidenceId: "0x1c9f0a0ae6f05e2367d7b2c9b2ca62ab24f90ce3344b526f60fb8e0d15fd40eb",
    evidenceRoot: "0xf991b7669131729a47790779d778d3faa1834afb06532edbad98be3c580064c7",
    parentInventoryRoot: "0x3fab10adf6820c0f387f589faf3faa1f0709a9e23ef6c33b3dbbe2e0a4197dbd",
    releaseCommit: "5775948d14912b45524f30ceadb915ec64ad7e67",
    verification: "receipt_event_registry_storage_match"
  });
  assert.equal(facilitator.calls.verify, 0);
  assert.equal(facilitator.calls.settle, 0);
});

test("independent payer client is served same-origin and inert before a click", async () => {
  const pageResponse = await fetch(`${baseUrl}/payer`);
  const page = await pageResponse.text();
  assert.equal(pageResponse.status, 200);
  assert.match(page, /Prepared, no wallet request/);
  assert.match(page, /exactly 0\.01 USDC/);
  assert.match(page, /\/payer-assets\/x402-independent-payer\.js/);

  const assetResponse = await fetch(`${baseUrl}/payer-assets/x402-independent-payer.js`);
  const asset = await assetResponse.text();
  assert.equal(assetResponse.status, 200);
  assert.match(asset, /bc_iscm570t/);
  assert.match(asset, /eth_requestAccounts/);
  assert.equal(facilitator.calls.verify, 0);
  assert.equal(facilitator.calls.settle, 0);
});

test("mainnet challenge declares exact USDC and required payment identifier", () => {
  assert.equal(challenge.x402Version, 2);
  assert.equal(challenge.accepts[0].network, "eip155:8453");
  assert.equal(challenge.accepts[0].scheme, "exact");
  assert.equal(challenge.accepts[0].amount, "10000");
  assert.equal(challenge.accepts[0].asset.toLowerCase(), "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  assert.equal(challenge.accepts[0].payTo, "0xBa36D092dB2999bb1FaBbaf281AC956A97189C25");
  assert.equal(challenge.extensions["payment-identifier"].info.required, true);
  assert.equal(challenge.extensions["builder-code"].info.a, candidate.config.builderCode);
  assert.equal(challenge.extensions.bazaar.info.input.type, "http");
  assert.equal(challenge.extensions.bazaar.info.input.method, "GET");
  assert.equal(challenge.extensions.bazaar.info.output.example.evidenceType, "baseproofpay_reconciliation");
});

test("agent inventory route declares the same exact Base x402 terms", () => {
  assert.equal(inventoryChallenge.x402Version, 2);
  assert.equal(inventoryChallenge.accepts[0].network, "eip155:8453");
  assert.equal(inventoryChallenge.accepts[0].scheme, "exact");
  assert.equal(inventoryChallenge.accepts[0].amount, "10000");
  assert.equal(inventoryChallenge.accepts[0].payTo, "0xBa36D092dB2999bb1FaBbaf281AC956A97189C25");
  assert.equal(inventoryChallenge.extensions["builder-code"].info.a, candidate.config.builderCode);
  assert.equal(inventoryChallenge.extensions.bazaar.info.output.example.inventoryRoot,
    "0x3fab10adf6820c0f387f589faf3faa1f0709a9e23ef6c33b3dbbe2e0a4197dbd");
});

test("CATBOX policy route declares the same exact Base x402 terms while preserving testnet boundaries", () => {
  assert.equal(b20PolicyChallenge.x402Version, 2);
  assert.equal(b20PolicyChallenge.accepts[0].network, "eip155:8453");
  assert.equal(b20PolicyChallenge.accepts[0].amount, "10000");
  assert.equal(b20PolicyChallenge.extensions["payment-identifier"].info.required, true);
  assert.equal(b20PolicyChallenge.extensions.bazaar.info.output.example.proofNetwork, "eip155:84532");
  assert.equal(b20PolicyChallenge.extensions.bazaar.info.output.example.burnTx,
    "0xe1e478bbd25430d0d4f06683ae95e6f3999645995ddebc4afcc7918a003c8d40");
  assert.equal(b20PolicyChallenge.extensions.bazaar.info.output.example.closingSupply, "90 CATBOX");
  assert.equal(b20PolicyChallenge.extensions.bazaar.info.output.example.transferPolicy, "ALWAYS_BLOCK");
});

test("builder-code extension produces BaseProofPay plus facilitator Schema 2 attribution", () => {
  const extension = new BuilderCodeFacilitatorExtension({ builderCode: "cdp_facil1" });
  const suffix = extension.buildDataSuffix({
    paymentPayload: {
      x402Version: 2,
      payload: { simulation: true },
      accepted: challenge.accepts[0],
      resource: challenge.resource,
      extensions: challenge.extensions
    },
    paymentRequirements: challenge.accepts[0]
  });
  assert.ok(suffix);
  assert.deepEqual(parseBuilderCodeSuffixFromCalldata(`0x1234${suffix.slice(2)}`), {
    a: candidate.config.builderCode,
    w: "cdp_facil1"
  });
});

test("missing payment identifier is blocked before facilitator verification", async () => {
  const withoutIdentifier = encodePaymentSignatureHeader({
    x402Version: 2,
    resource: challenge.resource,
    accepted: challenge.accepts[0],
    payload: { simulation: true }
  });
  const response = await fetch(`${baseUrl}/api/reconciliation-evidence`, {
    headers: { accept: "application/json", "payment-signature": withoutIdentifier }
  });
  assert.equal(response.status, 400);
  assert.equal((await response.json()).error, "payment_identifier_required");
  assert.equal(facilitator.calls.verify, 0);
  assert.equal(facilitator.calls.settle, 0);
});

test("simulated full flow returns PAYMENT-RESPONSE and completes the idempotency record", async () => {
  const response = await fetch(`${baseUrl}/api/reconciliation-evidence`, {
    headers: { accept: "application/json", "payment-signature": paymentHeader }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "settled",
    evidenceType: "baseproofpay_reconciliation",
    chainId: 8453
  });
  const paymentResponse = response.headers.get("payment-response");
  assert.ok(paymentResponse);
  assert.deepEqual(decodePaymentResponseHeader(paymentResponse), {
    success: true,
    payer,
    transaction,
    network: "eip155:8453"
  });
  assert.equal(facilitator.calls.verify, 1);
  assert.equal(facilitator.calls.settle, 1);
  assert.equal(candidate.counters.protectedResource, 1);
  assert.equal(candidate.store.get(paymentId).status, "completed");
});

test("exact retry is blocked without a second verify or settlement", async () => {
  const response = await fetch(`${baseUrl}/api/reconciliation-evidence`, {
    headers: { accept: "application/json", "payment-signature": paymentHeader }
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "already_completed");
  assert.deepEqual(decodePaymentResponseHeader(response.headers.get("payment-response")), {
    success: true,
    payer,
    transaction,
    network: "eip155:8453"
  });
  assert.equal(facilitator.calls.verify, 1);
  assert.equal(facilitator.calls.settle, 1);
  assert.equal(candidate.counters.protectedResource, 1);
});

test("same identifier with a changed payload is rejected as a conflict", async () => {
  const extensions = structuredClone(challenge.extensions);
  appendPaymentIdentifierToExtensions(extensions, paymentId);
  const conflictingHeader = encodePaymentSignatureHeader({
    x402Version: 2,
    resource: challenge.resource,
    accepted: challenge.accepts[0],
    payload: { simulation: "changed" },
    extensions
  });
  const response = await fetch(`${baseUrl}/api/reconciliation-evidence`, {
    headers: { accept: "application/json", "payment-signature": conflictingHeader }
  });
  assert.equal(response.status, 409);
  assert.equal((await response.json()).error, "identifier_conflict");
  assert.equal(facilitator.calls.verify, 1);
  assert.equal(facilitator.calls.settle, 1);
});

test("inventory entitlement settlement returns the committed Base-to-ERP evidence boundary", async () => {
  const extensions = structuredClone(inventoryChallenge.extensions);
  appendPaymentIdentifierToExtensions(extensions, "pay_inventory_entitlement_20260727_0001");
  const inventoryPaymentHeader = encodePaymentSignatureHeader({
    x402Version: 2,
    resource: inventoryChallenge.resource,
    accepted: inventoryChallenge.accepts[0],
    payload: { simulation: "inventory-entitlement" },
    extensions
  });
  const response = await fetch(`${baseUrl}/api/inventory-entitlement-evidence`, {
    headers: { accept: "application/json", "payment-signature": inventoryPaymentHeader }
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), {
    status: "settled",
    evidenceType: "catverse_inventory_entitlement",
    chainId: 8453,
    inventoryRoot: "0x3fab10adf6820c0f387f589faf3faa1f0709a9e23ef6c33b3dbbe2e0a4197dbd",
    businessEventClass: "BASE-XERP-INVENTORY-01",
    ledgerHandoff: "read_only_evidence"
  });
  assert.equal(candidate.store.get("pay_inventory_entitlement_20260727_0001").status, "completed");
});
