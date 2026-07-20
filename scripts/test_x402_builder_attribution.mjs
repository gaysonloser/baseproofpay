import assert from "node:assert/strict";
import fs from "node:fs/promises";
import { buildX402BuilderAttributionEvidence } from "./x402_builder_attribution.mjs";

const config = JSON.parse(await fs.readFile(
  new URL("../config/x402_production_candidate.json", import.meta.url),
  "utf8"
));
const evidence = buildX402BuilderAttributionEvidence(config);

assert.equal(config.version, 2);
assert.equal(config.builderCode, "bc_iscm570t");
assert.equal(evidence.declared.info.a, "bc_iscm570t");
assert.equal(evidence.paymentPayload.extensions["builder-code"].info.a, "bc_iscm570t");
assert.deepEqual(evidence.decoded, {
  a: "bc_iscm570t",
  w: "cdp_facil1"
});
assert.match(evidence.dataSuffix, /^0x[0-9a-f]+80218021802180218021802180218021$/i);

const invalidConfig = { ...config, builderCode: "INVALID CODE" };
assert.throws(
  () => buildX402BuilderAttributionEvidence(invalidConfig),
  /valid BaseProofPay Builder Code/
);

console.log("x402 Builder attribution: all checks passed");
