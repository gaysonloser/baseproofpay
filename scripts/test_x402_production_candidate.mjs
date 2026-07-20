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

test("mainnet challenge declares exact USDC and required payment identifier", () => {
  assert.equal(challenge.x402Version, 2);
  assert.equal(challenge.accepts[0].network, "eip155:8453");
  assert.equal(challenge.accepts[0].scheme, "exact");
  assert.equal(challenge.accepts[0].amount, "10000");
  assert.equal(challenge.accepts[0].asset.toLowerCase(), "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913");
  assert.equal(challenge.accepts[0].payTo, "0xBa36D092dB2999bb1FaBbaf281AC956A97189C25");
  assert.equal(challenge.extensions["payment-identifier"].info.required, true);
  assert.equal(challenge.extensions["builder-code"].info.a, candidate.config.builderCode);
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
