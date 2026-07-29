import { writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function staticReleaseIdentity(environment = process.env) {
  const commit = environment.RENDER_GIT_COMMIT ?? "local-uncommitted";
  return {
    service: environment.RENDER_SERVICE_NAME ?? "baseproofpay",
    repository: environment.RENDER_GIT_REPO_SLUG ?? "gaysonloser/baseproofpay",
    branch: environment.RENDER_GIT_BRANCH ?? "local",
    commit,
    sourceState: /^[0-9a-f]{40}$/i.test(commit) ? "render_commit_verified" : "local_or_unavailable",
    surface: "read_only_static_evidence_viewer",
    boundaries: { walletAutoConnect: false, erpWrite: false }
  };
}

export async function writeStaticRelease({ environment = process.env, outputPath = path.join(projectRoot, "release.json") } = {}) {
  const release = staticReleaseIdentity(environment);
  await writeFile(outputPath, `${JSON.stringify(release, null, 2)}\n`, "utf8");
  return release;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await writeStaticRelease();
}
