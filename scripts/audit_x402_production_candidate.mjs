import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
import { createX402ProductionCandidate } from "./x402_production_candidate_server.mjs";
import { MemoryPaymentIdempotencyStore } from "./x402_idempotency_guard.mjs";

function listen(app) {
  return new Promise((resolve, reject) => {
    const server = app.listen(0, "127.0.0.1", () => resolve(server));
    server.once("error", reject);
  });
}

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const outputPath = path.join(projectDirectory, "outputs", "base_x402_production_candidate_latest.json");
const payer = "0x1111111111111111111111111111111111111111";
const simulatedTransaction = `0x${"ab".repeat(32)}`;
const paymentIdentifier = "pay_baseproofpay_audit_20260720_0001";

class AuditFacilitator {
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
    return {
      success: true,
      payer,
      transaction: simulatedTransaction,
      network: "eip155:8453"
    };
  }
}

async function main() {
  const facilitator = new AuditFacilitator();
  const candidate = await createX402ProductionCandidate({ facilitator });
  const server = await listen(candidate.app);

  try {
    const address = server.address();
    const url = `http://127.0.0.1:${address.port}/api/reconciliation-evidence`;
    const challengeResponse = await fetch(url, { headers: { accept: "application/json" } });
    const challenge = decodePaymentRequiredHeader(challengeResponse.headers.get("payment-required"));
    const builderSuffix = new BuilderCodeFacilitatorExtension({
      builderCode: "cdp_facil1"
    }).buildDataSuffix({
      paymentPayload: {
        x402Version: 2,
        payload: { simulation: true },
        accepted: challenge.accepts[0],
        resource: challenge.resource,
        extensions: challenge.extensions
      },
      paymentRequirements: challenge.accepts[0]
    });
    const decodedBuilderSuffix = parseBuilderCodeSuffixFromCalldata(
      `0x1234${builderSuffix.slice(2)}`
    );
    const extensions = structuredClone(challenge.extensions);
    appendPaymentIdentifierToExtensions(extensions, paymentIdentifier);
    const paymentSignature = encodePaymentSignatureHeader({
      x402Version: 2,
      resource: challenge.resource,
      accepted: challenge.accepts[0],
      payload: { simulation: true },
      extensions
    });

    const paidResponse = await fetch(url, {
      headers: { accept: "application/json", "payment-signature": paymentSignature }
    });
    const paidBody = await paidResponse.json();
    const encodedPaymentResponse = paidResponse.headers.get("payment-response");
    const paymentResponse = decodePaymentResponseHeader(encodedPaymentResponse);
    const replayResponse = await fetch(url, {
      headers: { accept: "application/json", "payment-signature": paymentSignature }
    });
    const replayBody = await replayResponse.json();
    const replayPaymentResponse = decodePaymentResponseHeader(
      replayResponse.headers.get("payment-response")
    );
    const failureStore = new MemoryPaymentIdempotencyStore();
    failureStore.reserve("pay_baseproofpay_failure_audit_0001", "fingerprint-a");
    failureStore.fail("pay_baseproofpay_failure_audit_0001", {
      statusCode: 500,
      requiresManualReview: true
    });
    const ambiguousFailureRetry = failureStore.reserve(
      "pay_baseproofpay_failure_audit_0001",
      "fingerprint-a"
    );

    const gates = {
      mainnet_network: challenge.accepts[0].network === "eip155:8453",
      exact_001_usdc: challenge.accepts[0].amount === "10000",
      mainnet_usdc: challenge.accepts[0].asset.toLowerCase() === "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913",
      exact_payee: challenge.accepts[0].payTo.toLowerCase() === candidate.config.payTo.toLowerCase(),
      payment_identifier_required: challenge.extensions["payment-identifier"].info.required === true,
      baseproofpay_builder_code_declared:
        challenge.extensions["builder-code"].info.a === candidate.config.builderCode,
      schema2_app_code_encoded: decodedBuilderSuffix.a === candidate.config.builderCode,
      schema2_facilitator_code_preserved: decodedBuilderSuffix.w === "cdp_facil1",
      simulated_paid_status_200: paidResponse.status === 200,
      simulated_payment_response: Boolean(encodedPaymentResponse) && paymentResponse.success === true,
      simulated_verify_once: facilitator.calls.verify === 1,
      simulated_settle_once: facilitator.calls.settle === 1,
      replay_status_409: replayResponse.status === 409,
      replay_blocked: replayBody.replayBlocked === true,
      replay_payment_response_recovered:
        replayPaymentResponse.transaction === simulatedTransaction,
      ambiguous_failure_locked:
        ambiguousFailureRetry.accepted === false &&
        ambiguousFailureRetry.reason === "already_failed" &&
        ambiguousFailureRetry.entry.failure.requiresManualReview === true,
      no_second_verify_or_settle: facilitator.calls.verify === 1 && facilitator.calls.settle === 1
    };

    const report = {
      schema: "gayson.baseproofpay.x402_production_candidate_audit",
      version: 1,
      generatedAt: new Date().toISOString(),
      status: Object.values(gates).every(Boolean)
        ? "local_builder_attribution_upgrade_ready_publish_pending"
        : "failed",
      classification: {
        mainnet_configuration: true,
        cdp_facilitator_endpoint: true,
        payment_identifier_required: true,
        builder_code_extension_declared: true,
        erc8021_schema_2_local_roundtrip: true,
        replay_guard: true,
        ambiguous_failure_manual_review_lock: true,
        payment_response_simulated: true,
        payment_response_onchain: false,
        real_external_payer: false,
        cdp_credentials_present: Boolean(process.env.CDP_API_KEY_ID && process.env.CDP_API_KEY_SECRET),
        public_https_endpoint: false,
        chain_write: false
      },
      config: candidate.config,
      observed: {
        challenge,
        builderAttribution: {
          dataSuffix: builderSuffix,
          decoded: decodedBuilderSuffix
        },
        simulatedPaid: {
          statusCode: paidResponse.status,
          body: paidBody,
          paymentResponse
        },
        replay: {
          statusCode: replayResponse.status,
          body: replayBody,
          paymentResponse: replayPaymentResponse
        },
        ambiguousFailureRetry,
        counters: {
          ...facilitator.calls,
          protectedResource: candidate.counters.protectedResource
        },
        idempotency: candidate.store.get(paymentIdentifier)
      },
      gates,
      blockers: [
        "The Builder Code extension upgrade is local only and has not been published or deployed.",
        "No genuinely external payer wallet has been nominated and attested.",
        "A future independent payment needs a unique identifier and postflight proving Schema 2 app attribution; the completed 8889 canary must not be replayed."
      ]
    };

    await fs.mkdir(path.dirname(outputPath), { recursive: true });
    await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify({ outputPath, status: report.status, gates })}\n`);
    if (report.status === "failed") process.exitCode = 1;
  } finally {
    await new Promise(resolve => server.close(resolve));
  }
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
