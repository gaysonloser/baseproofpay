import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { buildReviewPack, createBaseLabConsoleServer, releaseIdentity } from "./base_lab_console_server.mjs";

let server;
let baseUrl;

before(async () => {
  server = createBaseLabConsoleServer({
    env: {
      BASE_LAB_RUNTIME_MODE: "test",
      RENDER_SERVICE_NAME: "catverse-base-lab-enterprise-os",
      RENDER_GIT_REPO_SLUG: "gaysonloser/baseproofpay",
      RENDER_GIT_BRANCH: "base-lab-e1-render",
      RENDER_GIT_COMMIT: "a".repeat(40)
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(() => server ? new Promise(resolve => server.close(resolve)) : undefined);

test("release identity is exact and excludes credentials", () => {
  const release = releaseIdentity({
    RENDER_SERVICE_NAME: "catverse-base-lab-enterprise-os",
    RENDER_GIT_REPO_SLUG: "gaysonloser/baseproofpay",
    RENDER_GIT_BRANCH: "base-lab-e1-render",
    RENDER_GIT_COMMIT: "a".repeat(40),
    ERP_API_SECRET: "must-not-appear"
  });
  assert.equal(release.commit, "a".repeat(40));
  assert.equal(release.source_state, "render_commit_verified");
  assert.deepEqual(release.boundaries, {
    erp_credentials: false,
    erp_write: false,
    wallet_auto_connect: false
  });
  assert.equal(JSON.stringify(release).includes("must-not-appear"), false);
});

test("release endpoint is read-only and carries security headers", async () => {
  const response = await fetch(`${baseUrl}/api/v1/release`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(response.headers.get("access-control-allow-origin"), null);
  assert.equal((await response.json()).commit, "a".repeat(40));

  const write = await fetch(`${baseUrl}/api/v1/release`, { method: "POST" });
  assert.equal(write.status, 405);
  assert.equal((await write.json()).error, "read_only_runtime");
});

test("Base Account lifecycle evidence is sanitized and locked", async () => {
  const response = await fetch(`${baseUrl}/api/v1/base-account-lifecycle`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const evidence = await response.json();
  assert.equal(evidence.status, "not_broadcast_locked");
  assert.equal(evidence.lifecycle.reviewed_anchor.transaction_hash, null);
  assert.equal(evidence.lifecycle.reviewed_anchor.replay_policy, "forbidden");
  assert.equal(evidence.controls.wallet_auto_retry, false);
  assert.equal(evidence.controls.erp_write, false);
});

test("review pack combines Base lanes without adding a write surface", () => {
  const lane = {schema_id:"e",status:"verified",result_fingerprint_sha256:"0xproof"};
  const catalog = {schema_version:"1",result_unit_id:"catalog",status:"verified",network:"base",chain_id:8453,transaction_hash:"0xtx",block_number:1,registry:"0xregistry",business_event_id:"event",evidence_id:"evidence",evidence_root:"0xroot",parent_inventory_root:"0xparent",release_commit:"abc",builder_code:"bc",verification:{},boundaries:{}};
  const lifecycle = {schema_version:"1",evidence_id:"lifecycle",generated_at:"now",product:"CATVERSE",status:"locked",parent_account:"0xparent",application_account:"0xchild",network:"base",lifecycle:{},controls:{},operator_next_step:"manual",evidence_fingerprint_sha256:"0xlifecycle"};
  const b20InventoryAgent = {schema_id:"b20",schema_version:"1.1",result_unit_id:"b20",generated_at:"now",status:"testnet_verified_mainnet_pending",activation:{target:"Base Mainnet"},token:{symbol:"CATBOX"},six_lanes:{erp_reconciliation:{quantity_conserved:true}},state_machine:{},deployment_gate:{},boundaries:{},result_fingerprint_sha256:"0xb20"};
  const pack = buildReviewPack({xerp01:lane,inventory:lane,asset:lane,catalog,lifecycle,b20InventoryAgent,release:{commit:"abc"}});
  assert.equal(pack.review_status,"ready_for_read_only_review");
  assert.deepEqual(pack.scope,{wallet_connect:false,wallet_signing:false,chain_write:false,erp_write:false});
  assert.equal(pack.lanes.base_account.status,"locked");
  assert.equal(pack.lanes.b20_inventory.token.symbol,"CATBOX");
});

test("review pack serves each lane and denies writes", async () => {
  const response = await fetch(`${baseUrl}/api/v1/review-pack`);
  assert.equal(response.status, 200);
  const pack = await response.json();
  assert.equal(pack.review_status, "ready_for_read_only_review");
  assert.equal(pack.scope.chain_write, false);
  assert.equal(pack.lanes.o2c.result_unit_id, "BASE-XERP-01");
  assert.equal(pack.lanes.b20_inventory.token.symbol, "CATBOX");
  const write = await fetch(`${baseUrl}/api/v1/review-pack`, { method: "POST" });
  assert.equal(write.status, 405);
});
