import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createFacilitatorConfig } from "@coinbase/x402";
import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import { paymentMiddlewareFromHTTPServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  PAYMENT_IDENTIFIER,
  declarePaymentIdentifierExtension,
  paymentIdentifierResourceServerExtension
} from "@x402/extensions/payment-identifier";
import {
  BUILDER_CODE,
  builderCodeResourceServerExtension,
  declareBuilderCodeExtension
} from "@x402/extensions/builder-code";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension
} from "@x402/extensions/bazaar";
import {
  MemoryPaymentIdempotencyStore,
  createPaymentIdempotencyMiddleware
} from "./x402_idempotency_guard.mjs";

const BASE_CHAIN_ID = "8453";

const BASE_VERIFY_OPERATOR_POLICY = Object.freeze({
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
  const match = message.match(new RegExp(`^${field}:\\s*(.+)import fs from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import { createFacilitatorConfig } from "@coinbase/x402";
import { HTTPFacilitatorClient, x402HTTPResourceServer, x402ResourceServer } from "@x402/core/server";
import { paymentMiddlewareFromHTTPServer } from "@x402/express";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  PAYMENT_IDENTIFIER,
  declarePaymentIdentifierExtension,
  paymentIdentifierResourceServerExtension
} from "@x402/extensions/payment-identifier";
import {
  BUILDER_CODE,
  builderCodeResourceServerExtension,
  declareBuilderCodeExtension
} from "@x402/extensions/builder-code";
import {
  bazaarResourceServerExtension,
  declareDiscoveryExtension
} from "@x402/extensions/bazaar";
import {
  MemoryPaymentIdempotencyStore,
  createPaymentIdempotencyMiddleware
} from "./x402_idempotency_guard.mjs";

, "m"));
  return match?.[1]?.trim() ?? null;
}

function getSiweResources(message) {
  const section = message.match(/^Resources:\s*\n((?:- .+(?:\n|$))*)/m)?.[1] ?? "";
  return section.split("\n").filter(line => line.startsWith("- ")).map(line => line.slice(2).trim());
}

function validateBaseVerifyOperatorRequest({ message, signature, policy = BASE_VERIFY_OPERATOR_POLICY }) {
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

function baseVerifyPublicStatus(environment = process.env, policy = BASE_VERIFY_OPERATOR_POLICY) {
  return {
    status: environment.BASE_VERIFY_SECRET_KEY ? "access_configured" : "access_pending",
    provider: policy.provider,
    action: policy.action,
    chainId: Number(policy.chainId),
    tokenPersistence: "none",
    rewardsOrClaims: false
  };
}

async function checkBaseVerifyOperatorAccess({ message, signature, environment = process.env, fetchImpl = fetch, policy = BASE_VERIFY_OPERATOR_POLICY }) {
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


const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const defaultConfigPath = path.join(projectDirectory, "config", "x402_production_candidate.json");

export async function loadProductionCandidateConfig(configPath = defaultConfigPath) {
  return JSON.parse(await fs.readFile(configPath, "utf8"));
}

export function createCdpFacilitatorFromEnvironment(environment = process.env) {
  const apiKeyId = environment.CDP_API_KEY_ID;
  const apiKeySecret = environment.CDP_API_KEY_SECRET;
  if (!apiKeyId || !apiKeySecret) {
    throw new Error("CDP_API_KEY_ID and CDP_API_KEY_SECRET are required for production verify/settle.");
  }
  return new HTTPFacilitatorClient(createFacilitatorConfig(apiKeyId, apiKeySecret));
}

export async function createX402ProductionCandidate(options = {}) {
  const config = options.config ?? await loadProductionCandidateConfig(options.configPath);
  const facilitator = options.facilitator ?? createCdpFacilitatorFromEnvironment(options.environment);
  const store = options.store ?? new MemoryPaymentIdempotencyStore(config.paymentIdentifier);
  const counters = { protectedResource: 0 };
  const independentClientDirectory = options.independentClientDirectory ?? path.join(
    projectDirectory,
    "x402-independent-payer-client-dist"
  );

  if (config.mode !== "production_mainnet_candidate" || config.network !== "eip155:8453") {
    throw new Error("Production candidate must use Base Mainnet eip155:8453.");
  }
  if (!/^bc_[a-z0-9_]+$/.test(config.builderCode ?? "")) {
    throw new Error("Production candidate requires a valid BaseProofPay Builder Code.");
  }
  const inventory = config.agentCommerceInventory;
  if (!inventory || inventory.route !== "GET /api/inventory-entitlement-evidence") {
    throw new Error("Production candidate requires the fixed inventory-entitlement route.");
  }
  if (!/^0x[0-9a-f]{64}$/i.test(inventory.inventoryRoot ?? "")) {
    throw new Error("Inventory entitlement route requires a bytes32 inventory root.");
  }
  const b20Policy = config.agentCommerceB20Policy;
  if (!b20Policy || b20Policy.route !== "GET /api/catbox-policy-evidence" ||
    b20Policy.network !== "eip155:84532" || !/^0x[0-9a-f]{40}$/i.test(b20Policy.token ?? "") ||
    !/^0x[0-9a-f]{64}$/i.test(b20Policy.burnTx ?? "") ||
    !/^0x[0-9a-f]{64}$/i.test(b20Policy.burnMemoHash ?? "") ||
    b20Policy.closingSupply !== "90 CATBOX" || b20Policy.transferPolicy !== "ALWAYS_BLOCK") {
    throw new Error("Production candidate requires a fail-closed Base Sepolia B20 policy evidence route.");
  }
  const publicEvidenceAnchor = config.publicEvidenceAnchor;
  if (!publicEvidenceAnchor || publicEvidenceAnchor.chainId !== 8453 ||
    !/^0x[0-9a-f]{64}$/i.test(publicEvidenceAnchor.evidenceRoot ?? "") ||
    !/^0x[0-9a-f]{64}$/i.test(publicEvidenceAnchor.parentInventoryRoot ?? "")) {
    throw new Error("Production candidate requires a verified Base evidence anchor.");
  }

  const resourceServer = new x402ResourceServer(facilitator)
    .register(config.network, new ExactEvmScheme())
    .registerExtension(paymentIdentifierResourceServerExtension)
    .registerExtension(builderCodeResourceServerExtension)
    .registerExtension(bazaarResourceServerExtension);

  const discoveryExtension = output => declareDiscoveryExtension({
    method: "GET",
    output: {
      example: output
    }
  });

  const routeConfig = {
    accepts: {
      scheme: config.scheme,
      price: config.price,
      network: config.network,
      payTo: config.payTo
    },
    description: config.description,
    mimeType: config.mimeType,
    serviceName: config.serviceName,
    extensions: {
      [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
      [BUILDER_CODE]: declareBuilderCodeExtension(config.builderCode),
      ...discoveryExtension({
        status: "settled",
        evidenceType: "baseproofpay_reconciliation",
        chainId: 8453
      })
    },
    unpaidResponseBody: () => ({
      contentType: "application/json",
      body: { error: "payment_required", network: config.network }
    })
  };
  const inventoryRouteConfig = {
    ...routeConfig,
    description: inventory.description,
    extensions: {
      [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
      [BUILDER_CODE]: declareBuilderCodeExtension(config.builderCode),
      ...discoveryExtension({
        status: "settled",
        evidenceType: inventory.evidenceType,
        chainId: 8453,
        inventoryRoot: inventory.inventoryRoot,
        businessEventClass: inventory.businessEventClass,
        ledgerHandoff: inventory.ledgerHandoff
      })
    }
  };
  const b20PolicyRouteConfig = {
    ...routeConfig,
    description: b20Policy.description,
    extensions: {
      [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(true),
      [BUILDER_CODE]: declareBuilderCodeExtension(config.builderCode),
      ...discoveryExtension({
        status: "settled",
        evidenceType: b20Policy.evidenceType,
        proofNetwork: b20Policy.network,
        token: b20Policy.token,
        burnTx: b20Policy.burnTx,
        closingSupply: b20Policy.closingSupply,
        transferPolicy: b20Policy.transferPolicy,
        ledgerHandoff: b20Policy.ledgerHandoff
      })
    }
  };
  const routes = {
    [config.route]: routeConfig,
    [inventory.route]: inventoryRouteConfig,
    [b20Policy.route]: b20PolicyRouteConfig
  };
  const httpServer = new x402HTTPResourceServer(resourceServer, routes);
  await httpServer.initialize();

  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "8kb", type: "application/json" }));
  app.get("/healthz", (_request, response) => {
    response.json({
      status: "ok",
      service: config.serviceName,
      network: config.network,
      paymentRequired: true
    });
  });
  app.get("/api/base-verify/status", (_request, response) => {
    response.json(baseVerifyPublicStatus(options.environment ?? process.env));
  });
  app.post("/api/base-verify/operator-review", async (request, response, next) => {
    try {
      const result = await checkBaseVerifyOperatorAccess({
        message: request.body?.message,
        signature: request.body?.signature,
        environment: options.environment ?? process.env,
        fetchImpl: options.fetchImpl ?? fetch
      });
      response.status(result.status).json(result.body);
    } catch (error) {
      next(error);
    }
  });
  app.get("/api/agent-commerce-resources", (_request, response) => {
    response.set("Cache-Control", "no-store");
    response.json({
      service: config.serviceName,
      network: config.network,
      paymentTerms: {
        scheme: config.scheme,
        price: config.price,
        asset: "USDC",
        payTo: config.payTo,
        paymentIdentifierRequired: true,
        builderCode: config.builderCode
      },
      resources: [
        {
          id: "reconciliation-evidence",
          route: config.route,
          access: "x402_exact_payment",
          description: config.description,
          ledgerHandoff: "read_only_evidence"
        },
        {
          id: "inventory-entitlement-evidence",
          route: inventory.route,
          access: "x402_exact_payment",
          description: inventory.description,
          businessEventClass: inventory.businessEventClass,
          inventoryRoot: inventory.inventoryRoot,
          ledgerHandoff: inventory.ledgerHandoff
        },
        {
          id: "catbox-policy-evidence",
          route: b20Policy.route,
          access: "x402_exact_payment",
          description: b20Policy.description,
          evidenceType: b20Policy.evidenceType,
          proofNetwork: b20Policy.network,
          token: b20Policy.token,
          burnTx: b20Policy.burnTx,
          closingSupply: b20Policy.closingSupply,
          transferPolicy: b20Policy.transferPolicy,
          ledgerHandoff: b20Policy.ledgerHandoff
        }
      ],
      boundaries: {
        walletConnection: false,
        automaticPayment: false,
        erpWrite: false,
        inventoryValuation: "ERPNext"
      },
      publicEvidenceAnchor: {
        businessEventId: publicEvidenceAnchor.businessEventId,
        transactionHash: publicEvidenceAnchor.transactionHash,
        registry: publicEvidenceAnchor.registry,
        evidenceId: publicEvidenceAnchor.evidenceId,
        evidenceRoot: publicEvidenceAnchor.evidenceRoot,
        parentInventoryRoot: publicEvidenceAnchor.parentInventoryRoot,
        releaseCommit: publicEvidenceAnchor.releaseCommit,
        verification: publicEvidenceAnchor.verification
      }
    });
  });
  app.use("/payer-assets", express.static(path.join(independentClientDirectory, "payer-assets")));
  app.get("/payer", (_request, response, next) => {
    response.sendFile(
      path.join(independentClientDirectory, "x402-independent-payer-client.html"),
      { headers: { "Cache-Control": "no-store" } },
      error => error ? next(error) : undefined
    );
  });
  app.use(createPaymentIdempotencyMiddleware({
    store,
    routePath: ["/api/reconciliation-evidence", "/api/inventory-entitlement-evidence", "/api/catbox-policy-evidence"],
    method: "GET",
    required: true
  }));
  app.use(paymentMiddlewareFromHTTPServer(httpServer, undefined, undefined, false));
  app.get("/api/reconciliation-evidence", (_request, response) => {
    counters.protectedResource += 1;
    response.json({
      status: "settled",
      evidenceType: "baseproofpay_reconciliation",
      chainId: 8453
    });
  });
  app.get("/api/inventory-entitlement-evidence", (_request, response) => {
    counters.protectedResource += 1;
    response.json({
      status: "settled",
      evidenceType: inventory.evidenceType,
      chainId: 8453,
      inventoryRoot: inventory.inventoryRoot,
      businessEventClass: inventory.businessEventClass,
      ledgerHandoff: inventory.ledgerHandoff
    });
  });
  app.get("/api/catbox-policy-evidence", (_request, response) => {
    counters.protectedResource += 1;
    response.json({
      status: "settled",
      evidenceType: b20Policy.evidenceType,
      proofNetwork: b20Policy.network,
      token: b20Policy.token,
      policyCreationTx: b20Policy.policyCreationTx,
      mintTx: b20Policy.mintTx,
      burnTx: b20Policy.burnTx,
      mintAmount: b20Policy.mintAmount,
      burnAmount: b20Policy.burnAmount,
      closingSupply: b20Policy.closingSupply,
      burnMemoHash: b20Policy.burnMemoHash,
      transferPolicy: b20Policy.transferPolicy,
      ledgerHandoff: b20Policy.ledgerHandoff,
      boundaries: {
        mainnetToken: false,
        transfer: false,
        inventoryValuation: "ERPNext",
        erpWrite: false
      }
    });
  });

  return { app, config, facilitator, store, counters, resourceServer, httpServer };
}

async function main() {
  const candidate = await createX402ProductionCandidate();
  const port = Number.parseInt(process.env.PORT ?? "4403", 10);
  const host = process.env.HOST ?? "0.0.0.0";
  const server = http.createServer(candidate.app);
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(port, host, resolve);
  });
  const address = server.address();
  process.stdout.write(`${JSON.stringify({
    status: "production_candidate_listening",
    host,
    port: typeof address === "object" && address ? address.port : port,
    network: candidate.config.network
  })}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
