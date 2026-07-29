import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { staticReleaseIdentity, writeStaticRelease } from "./build_static_release.mjs";

test("static release identity is exact and secret-free", async () => {
  const environment = {
    RENDER_SERVICE_NAME: "baseproofpay",
    RENDER_GIT_REPO_SLUG: "gaysonloser/baseproofpay",
    RENDER_GIT_BRANCH: "main",
    RENDER_GIT_COMMIT: "b".repeat(40),
    CDP_API_KEY_SECRET: "must-not-appear"
  };
  const release = staticReleaseIdentity(environment);
  assert.equal(release.commit, "b".repeat(40));
  assert.equal(release.sourceState, "render_commit_verified");
  assert.equal(JSON.stringify(release).includes("must-not-appear"), false);

  const directory = await mkdtemp(path.join(tmpdir(), "baseproofpay-release-"));
  const outputPath = path.join(directory, "release.json");
  await writeStaticRelease({ environment, outputPath });
  assert.deepEqual(JSON.parse(await readFile(outputPath, "utf8")), release);
});
