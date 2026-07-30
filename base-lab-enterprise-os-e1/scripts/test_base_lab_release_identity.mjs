import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createBaseLabConsoleServer, releaseIdentity } from "./base_lab_console_server.mjs";

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

test("Base Account console keeps popup access without widening the rest of the site", async () => {
  const walletConsole = await fetch(`${baseUrl}/base-agent-subaccount-console.html`);
  assert.equal(walletConsole.status, 200);
  assert.equal(walletConsole.headers.get("cross-origin-opener-policy"), "same-origin-allow-popups");
  assert.match(walletConsole.headers.get("content-security-policy"), /https:\/\/keys\.coinbase\.com/);

  const ordinaryConsole = await fetch(`${baseUrl}/enterprise-os.html`);
  assert.equal(ordinaryConsole.status, 200);
  assert.equal(ordinaryConsole.headers.get("cross-origin-opener-policy"), "same-origin");
});
