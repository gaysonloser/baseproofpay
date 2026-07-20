import crypto from "node:crypto";
import { decodePaymentSignatureHeader } from "@x402/core/http";
import {
  extractAndValidatePaymentIdentifier,
  validatePaymentIdentifierRequirement
} from "@x402/extensions/payment-identifier";

export class MemoryPaymentIdempotencyStore {
  constructor({ ttlSeconds = 86400, maxEntries = 10000, now = () => Date.now() } = {}) {
    this.ttlMs = ttlSeconds * 1000;
    this.maxEntries = maxEntries;
    this.now = now;
    this.entries = new Map();
  }

  purgeExpired() {
    const current = this.now();
    for (const [id, entry] of this.entries) {
      if (entry.expiresAt <= current) this.entries.delete(id);
    }
  }

  reserve(id, fingerprint) {
    this.purgeExpired();
    const existing = this.entries.get(id);
    if (existing) {
      return {
        accepted: false,
        reason: existing.fingerprint === fingerprint
          ? existing.status === "completed"
            ? "already_completed"
            : existing.status === "failed"
              ? "already_failed"
              : "already_processing"
          : "identifier_conflict",
        entry: existing
      };
    }

    if (this.entries.size >= this.maxEntries) {
      return { accepted: false, reason: "capacity_exceeded" };
    }

    const entry = {
      id,
      fingerprint,
      status: "processing",
      createdAt: this.now(),
      expiresAt: this.now() + this.ttlMs
    };
    this.entries.set(id, entry);
    return { accepted: true, entry };
  }

  complete(id, paymentResponse) {
    const entry = this.entries.get(id);
    if (!entry) return;
    entry.status = "completed";
    entry.paymentResponse = paymentResponse;
    entry.completedAt = this.now();
  }

  fail(id, details = {}) {
    const entry = this.entries.get(id);
    if (!entry || entry.status !== "processing") return;
    entry.status = "failed";
    entry.failedAt = this.now();
    entry.failure = details;
  }

  release(id) {
    const entry = this.entries.get(id);
    if (entry?.status === "processing") this.entries.delete(id);
  }

  get(id) {
    this.purgeExpired();
    return this.entries.get(id) ?? null;
  }
}

export function createPaymentIdempotencyMiddleware({
  store,
  routePath,
  method = "GET",
  required = true
}) {
  if (!store) throw new Error("Idempotency store is required.");

  return (request, response, next) => {
    if (request.path !== routePath || request.method.toUpperCase() !== method.toUpperCase()) {
      return next();
    }

    const paymentHeader = request.get("payment-signature") || request.get("x-payment");
    if (!paymentHeader) return next();

    let paymentPayload;
    try {
      paymentPayload = decodePaymentSignatureHeader(paymentHeader);
    } catch {
      return response.status(400).json({ error: "invalid_payment_signature_header" });
    }

    const requirement = validatePaymentIdentifierRequirement(paymentPayload, required);
    const extracted = extractAndValidatePaymentIdentifier(paymentPayload);
    if (!requirement.valid || !extracted.validation.valid || !extracted.id) {
      return response.status(400).json({
        error: "payment_identifier_required",
        details: [...(requirement.errors ?? []), ...(extracted.validation.errors ?? [])]
      });
    }

    const fingerprint = crypto
      .createHash("sha256")
      .update(`${request.method}\n${request.path}\n${paymentHeader}`)
      .digest("hex");
    const reservation = store.reserve(extracted.id, fingerprint);

    if (!reservation.accepted) {
      if (reservation.reason === "already_completed" && reservation.entry?.paymentResponse) {
        response.setHeader("payment-response", reservation.entry.paymentResponse);
      }
      return response.status(409).json({
        error: reservation.reason,
        paymentIdentifier: extracted.id,
        replayBlocked: true
      });
    }

    response.once("finish", () => {
      const paymentResponse = response.getHeader("payment-response");
      if (response.statusCode >= 200 && response.statusCode < 300 && paymentResponse) {
        store.complete(extracted.id, String(paymentResponse));
      } else {
        store.fail(extracted.id, {
          statusCode: response.statusCode,
          paymentResponsePresent: Boolean(paymentResponse),
          requiresManualReview: true
        });
      }
    });

    return next();
  };
}
