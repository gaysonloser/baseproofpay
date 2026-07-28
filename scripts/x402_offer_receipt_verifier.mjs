import {
  isEIP712SignedReceipt,
  isJWSSignedReceipt,
  extractReceiptPayload,
  verifyReceiptSignatureEIP712,
  verifyReceiptSignatureJWS
} from "@x402/extensions/offer-receipt";

const BASE_NETWORK = "eip155:8453";

export async function verifyOfferReceipt(receipt, { expectedNetwork = BASE_NETWORK } = {}) {
  if (!receipt || typeof receipt !== "object") return { valid: false, error: "receipt_required" };
  try {
    let payload;
    let signer = null;
    if (isEIP712SignedReceipt(receipt)) {
      ({ payload, signer } = await verifyReceiptSignatureEIP712(receipt));
    } else if (isJWSSignedReceipt(receipt)) {
      payload = await verifyReceiptSignatureJWS(receipt);
    } else {
      return { valid: false, error: "unsupported_receipt_format" };
    }
    if (payload.network !== expectedNetwork) return { valid: false, error: "network_mismatch" };
    if (!payload.resourceUrl || !payload.payer || !payload.issuedAt) return { valid: false, error: "receipt_fields_missing" };
    return { valid: true, signer, receipt: { network: payload.network, resourceUrl: payload.resourceUrl, payer: payload.payer, issuedAt: payload.issuedAt, transaction: payload.transaction ?? null } };
  } catch {
    return { valid: false, error: "signature_invalid" };
  }
}

export function receiptEvidenceEnvelope(result) {
  return result.valid ? { status: "verified_read_only", ...result.receipt, signer: result.signer, paymentOrErpWrite: false } : { status: "rejected_read_only", error: result.error, paymentOrErpWrite: false };
}
