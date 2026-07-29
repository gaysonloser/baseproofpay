const BASE_CHAIN_ID = "8453";

export const BASE_VERIFY_OPERATOR_POLICY = Object.freeze({
  provider: "coinbase",
  action: "catverse_operator_review",
  domain: "baseproofpay-x402.onrender.com",
  uri: "https://baseproofpay-x402.onrender.com/payer",
  chainId: BASE_CHAIN_ID
});

function requiredResources(policy) {
  return [
    `urn:verify:provider:${policy.provider}`,
    `urn:verify:action:${policy.action}`
  ];
}

function getSiweField(message, field) {
  const match = message.match(new RegExp(`^${field}:\\s*(.+)$`, "m"));
  return match?.[1]?.trim() ?? null;
}

function getSiweResources(message) {
  const section = message.match(/^Resources:\s*\n((?:- .+(?:\n|$))*)/m)?.[1] ?? "";
  return section.split("\n").filter(line => line.startsWith("- ")).map(line => line.slice(2).trim());
}

export function validateBaseVerifyOperatorRequest({ message, signature, policy = BASE_VERIFY_OPERATOR_POLICY }) {
  if (typeof message !== "string" || message.length < 80) throw new Error("A complete SIWE message is required.");
  if (typeof signature !== "string" || !/^0x[0-9a-fA-F]{130}$/.test(signature)) throw new Error("A valid EIP-191 signature is required.");
  if (getSiweField(message, "URI") !== policy.uri) throw new Error("SIWE URI does not match the operator-review policy.");
  if (getSiweField(message, "Chain ID") !== policy.chainId) throw new Error("SIWE chain ID must be Base Mainnet.");

  const resources = getSiweResources(message);
  for (const expected of requiredResources(policy)) {
    if (!resources.includes(expected)) throw new Error(`Missing required Base Verify resource: ${expected}`);
  }
  return { resources, action: policy.action, provider: policy.provider };
}

export function baseVerifyPublicStatus(environment = process.env, policy = BASE_VERIFY_OPERATOR_POLICY) {
  return {
    status: environment.BASE_VERIFY_SECRET_KEY ? "access_configured" : "access_pending",
    provider: policy.provider,
    action: policy.action,
    chainId: Number(policy.chainId),
    tokenPersistence: "none",
    rewardsOrClaims: false
  };
}

export async function checkBaseVerifyOperatorAccess({ message, signature, environment = process.env, fetchImpl = fetch, policy = BASE_VERIFY_OPERATOR_POLICY }) {
  const secret = environment.BASE_VERIFY_SECRET_KEY;
  if (!secret) {
    return { status: 503, body: { error: "base_verify_access_not_configured", ...baseVerifyPublicStatus(environment, policy) } };
  }
  validateBaseVerifyOperatorRequest({ message, signature, policy });
  const response = await fetchImpl("https://verify.base.dev/v1/base_verify_token", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${secret}` },
    body: JSON.stringify({ message, signature })
  });
  if (response.status === 200) {
    const payload = await response.json();
    return { status: 200, body: { verified: true, action: payload.action, wallet: payload.wallet, tokenPersistence: "none" } };
  }
  if (response.status === 404) return { status: 404, body: { verified: false, needsVerification: true, redirect: `https://verify.base.dev?redirect_uri=${encodeURIComponent(policy.uri)}&providers=${policy.provider}` } };
  if (response.status === 400) return { status: 400, body: { verified: false, traitsNotMet: true } };
  return { status: 502, body: { error: "base_verify_upstream_error", upstreamStatus: response.status } };
}
