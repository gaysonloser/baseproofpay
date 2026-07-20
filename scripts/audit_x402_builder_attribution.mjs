import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildX402BuilderAttributionEvidence } from "./x402_builder_attribution.mjs";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(scriptDirectory, "..");
const config = JSON.parse(await fs.readFile(
  path.join(projectDirectory, "config", "x402_production_candidate.json"),
  "utf8"
));
const evidence = buildX402BuilderAttributionEvidence(config);
const gates = {
  production_config_v2: config.version === 2,
  official_builder_extension_declared: evidence.declared.info.a === config.builderCode,
  baseproofpay_app_code_encoded: evidence.decoded.a === config.builderCode,
  cdp_facilitator_code_preserved: evidence.decoded.w === "cdp_facil1",
  erc8021_schema2_marker_present: evidence.dataSuffix.toLowerCase().endsWith(
    "80218021802180218021802180218021"
  ),
  no_wallet_action: true,
  no_chain_write: true
};
const passed = Object.values(gates).every(Boolean);
const report = {
  schema: "gayson.baseproofpay.x402_builder_attribution_upgrade",
  version: 1,
  generatedAt: new Date().toISOString(),
  status: passed ? "local_ready_publish_confirmation_required" : "failed",
  source: {
    package: "@x402/extensions",
    packageVersion: "2.19.0",
    extension: "builder-code",
    standard: "ERC-8021 Schema 2"
  },
  target: {
    network: config.network,
    appBuilderCode: config.builderCode,
    expectedFacilitatorCode: "cdp_facil1",
    publicService: "https://baseproofpay-x402.onrender.com"
  },
  evidence: {
    challengeExtension: evidence.declared,
    dataSuffix: evidence.dataSuffix,
    decoded: evidence.decoded
  },
  gates,
  boundaries: {
    currentPublicRuntimeUpgraded: false,
    current8889PaymentReplayed: false,
    walletConnected: false,
    paymentMade: false,
    externalWritePerformed: false,
    nextStep: "Review the local patch, then request a separate GitHub/Render publication confirmation. Verify the unpaid 402 advertises builder-code before any new independent payment."
  }
};

const outputPath = path.join(
  projectDirectory,
  "outputs",
  "base_x402_builder_attribution_upgrade_latest.json"
);
await fs.mkdir(path.dirname(outputPath), { recursive: true });
await fs.writeFile(outputPath, `${JSON.stringify(report, null, 2)}\n`);
process.stdout.write(`${JSON.stringify({ outputPath, status: report.status, gates })}\n`);
if (!passed) process.exitCode = 1;
