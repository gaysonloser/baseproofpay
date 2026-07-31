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

test("Base Ledger settlement mapping is public, sanitized and read-only", async () => {
  const response = await fetch(`${baseUrl}/api/v1/base-ledger-settlement`);
  assert.equal(response.status, 200);
  const mapping = await response.json();
  assert.equal(mapping.status, "read_only_design_verified_no_ledger_session");
  assert.equal(mapping.lanes.length, 3);
  assert.equal(mapping.negative_controls.includes("no ERP credential or ERP write"), true);
  assert.equal(JSON.stringify(mapping).includes("private_key"), false);
});

test("Base Vibenet developer assets are testnet-scoped and deny writes", async () => {
  const response = await fetch(`${baseUrl}/api/v1/base-vibenet-developer-assets`);
  assert.equal(response.status, 200);
  const evidence = await response.json();
  assert.equal(evidence.network, "Base Vibenet");
  assert.equal(evidence.chain_id, 84538453);
  assert.equal(evidence.asset_lanes.length, 3);
  assert.equal(evidence.controls.wallet_connected, false);
  assert.equal(evidence.negative_controls.includes("not a Base Mainnet balance or transaction"), true);
  const write = await fetch(`${baseUrl}/api/v1/base-vibenet-developer-assets`, { method: "POST" });
  assert.equal(write.status, 405);
});

test("Base Account execution guardrails preserve manual funding and deny writes", async () => {
  const response = await fetch(`${baseUrl}/api/v1/base-account-execution-guardrails`);
  assert.equal(response.status, 200);
  const guardrails = await response.json();
  assert.equal(guardrails.status, "official_sdk_control_map_verified");
  assert.equal(guardrails.execution_roles.length, 4);
  assert.equal(guardrails.control_defaults.sub_account_funding, "manual");
  assert.equal(guardrails.control_defaults.automatic_spend_permission, false);
  assert.equal(guardrails.control_defaults.wallet_auto_connect, false);
  const write = await fetch(`${baseUrl}/api/v1/base-account-execution-guardrails`, { method: "POST" });
  assert.equal(write.status, 405);
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

test("Smart Wallet lifecycle evidence keeps funding and spend authority manual", async () => {
  const response = await fetch(`${baseUrl}/api/v1/base-smart-wallet-lifecycle`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("cache-control"), "no-store");
  const evidence = await response.json();
  assert.equal(evidence.status, "verified_manual_application_account_created");
  assert.equal(evidence.lifecycle.funding, "manual");
  assert.equal(evidence.lifecycle.automatic_spend_permission, false);
  assert.equal(evidence.lifecycle.transaction_requested, false);
  assert.equal(evidence.lifecycle.erp_write, false);
  assert.equal(evidence.negative_controls.includes("no repeated application-account creation"), true);
  const write = await fetch(`${baseUrl}/api/v1/base-smart-wallet-lifecycle`, { method: "POST" });
  assert.equal(write.status, 405);
});

test("Smart Wallet ERP handoff is draft-only and rejects writes", async () => {
  const response = await fetch(`${baseUrl}/api/v1/base-smart-wallet-erp-handoff`);
  assert.equal(response.status, 200);
  const handoff = await response.json();
  assert.equal(handoff.status, "read_only_draft_handoff_verified");
  assert.equal(handoff.canonical_business_event.postable, false);
  assert.equal(handoff.erp_handoff.write_executed, false);
  assert.equal(handoff.controls.erp_write, false);
  const write = await fetch(`${baseUrl}/api/v1/base-smart-wallet-erp-handoff`, { method: "POST" });
  assert.equal(write.status, 405);
});

test("Smart Wallet evidence pack exposes one confirmed, replay-locked record", async () => {
  const response = await fetch(`${baseUrl}/api/v1/smart-wallet-evidence-pack`);
  assert.equal(response.status, 200);
  const pack = await response.json();
  assert.equal(pack.publication_unit_id, "BASE-PUBLICATION-SMART-WALLET-EVIDENCE-PACK-20260731-34");
  assert.equal(pack.contract.deployment_replay, "forbidden_existing_create2_target");
  assert.equal(pack.confirmed_business_record.transaction_hash, "0x400cf11bb0756a3706aaaa2ca0ede20dd964d402d5c314a8413b48d9cffe5477");
  assert.equal(pack.confirmed_business_record.receipt_status, 1);
  assert.equal(pack.confirmed_business_record.duplicate_check, "locked_after_confirmed_receipt");
  assert.equal(pack.confirmed_business_record.value_eth, "0");
  assert.equal(pack.publication_controls.partial_bundle_counts_as_publication, false);
  assert.equal(JSON.stringify(pack).includes("private_key"), false);
  const write = await fetch(`${baseUrl}/api/v1/smart-wallet-evidence-pack`, { method: "POST" });
  assert.equal(write.status, 405);
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
