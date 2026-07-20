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
  MemoryPaymentIdempotencyStore,
  createPaymentIdempotencyMiddleware
} from "./x402_idempotency_guard.mjs";

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

  if (config.mode !== "production_mainnet_candidate" || config.network !== "eip155:8453") {
    throw new Error("Production candidate must use Base Mainnet eip155:8453.");
  }
  if (!/^bc_[a-z0-9_]+$/.test(config.builderCode ?? "")) {
    throw new Error("Production candidate requires a valid BaseProofPay Builder Code.");
  }

  const resourceServer = new x402ResourceServer(facilitator)
    .register(config.network, new ExactEvmScheme())
    .registerExtension(paymentIdentifierResourceServerExtension)
    .registerExtension(builderCodeResourceServerExtension);

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
      [BUILDER_CODE]: declareBuilderCodeExtension(config.builderCode)
    },
    unpaidResponseBody: () => ({
      contentType: "application/json",
      body: { error: "payment_required", network: config.network }
    })
  };
  const routes = { [config.route]: routeConfig };
  const httpServer = new x402HTTPResourceServer(resourceServer, routes);
  await httpServer.initialize();

  const app = express();
  app.disable("x-powered-by");
  app.get("/healthz", (_request, response) => {
    response.json({
      status: "ok",
      service: config.serviceName,
      network: config.network,
      paymentRequired: true
    });
  });
  app.use(createPaymentIdempotencyMiddleware({
    store,
    routePath: "/api/reconciliation-evidence",
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
