import assert from "node:assert/strict";
import test from "node:test";
import {
  BASE_VERIFY_OPERATOR_POLICY,
  baseVerifyPublicStatus,
  checkBaseVerifyOperatorAccess,
  validateBaseVerifyOperatorRequest
} from "./base_verify_operator_gate.mjs";

const message = `baseproofpay-x402.onrender.com wants you to sign in with your Ethereum account:\n0x9903E1e8C871321ee2Ed80cea8a5899F0992ba9e\n\nCATVERSE operator review eligibility\n\nURI: https://baseproofpay-x402.onrender.com/payer\nVersion: 1\nChain ID: 8453\nNonce: verify-operator-20260728\nIssued At: 2026-07-28T00:00:00.000Z\nResources:\n- urn:verify:provider:coinbase\n- urn:verify:action:catverse_operator_review`;
const signature = `0x${"11".repeat(65)}`;

test("operator gate is fail-closed until Base Verify access is configured", async () => {
  const result = await checkBaseVerifyOperatorAccess({ message, signature, environment: {}, fetchImpl: () => { throw new Error("must not call upstream"); } });
  assert.equal(result.status, 503);
  assert.equal(result.body.error, "base_verify_access_not_configured");
  assert.equal(result.body.rewardsOrClaims, false);
});

test("operator gate binds Base, Coinbase and one stable action", () => {
  assert.deepEqual(validateBaseVerifyOperatorRequest({ message, signature }), {
    resources: ["urn:verify:provider:coinbase", "urn:verify:action:catverse_operator_review"],
    action: "catverse_operator_review",
    provider: "coinbase"
  });
  assert.throws(() => validateBaseVerifyOperatorRequest({ message: message.replace("catverse_operator_review", "claim_airdrop"), signature }), /Missing required/);
  assert.equal(baseVerifyPublicStatus({}).status, "access_pending");
  assert.equal(BASE_VERIFY_OPERATOR_POLICY.chainId, "8453");
});

test("a verified response never returns the raw deterministic token", async () => {
  const result = await checkBaseVerifyOperatorAccess({
    message,
    signature,
    environment: { BASE_VERIFY_SECRET_KEY: "test-secret" },
    fetchImpl: async (_url, request) => {
      assert.equal(request.headers.authorization, "Bearer test-secret");
      return new Response(JSON.stringify({ token: "must-not-leak", action: "catverse_operator_review", wallet: "0x9903E1e8C871321ee2Ed80cea8a5899F0992ba9e" }), { status: 200 });
    }
  });
  assert.deepEqual(result, { status: 200, body: { verified: true, action: "catverse_operator_review", wallet: "0x9903E1e8C871321ee2Ed80cea8a5899F0992ba9e", tokenPersistence: "none" } });
});
