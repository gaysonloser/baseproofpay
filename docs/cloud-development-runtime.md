# Cloud Development Runtime

BaseProofPay uses a local-light, cloud-first development model.

## Authority Split

| Layer | Authority | Persistent locally |
| --- | --- | --- |
| Source and review | GitHub | source checkout only |
| Build and tests | GitHub Actions hosted runners | no |
| Public runtime and reviewer UI | Render | no |
| ERP records and accounting authority | Frappe Cloud ERPNext | no |
| Wallet review and signature | Coinbase Wallet on the owner's device | browser session only |

## Local Rules

- Do not keep Vite, static HTTP servers, Enterprise OS Console, Node workers or Frappe Bench running after a review.
- Do not install a second `node_modules` tree in `release/baseproofpay-public`; use the repository root or the cloud CI job.
- Local wallet review pages are started only for one exact action and stopped after receipt/readback.
- Generated evidence is committed only when it is deterministic, sanitized and required for reviewer reproduction.
- ERP credentials, wallet secrets and production secrets never enter GitHub Actions artifacts.

## Cloud CI

`.github/workflows/cloud-ci.yml` runs on pull requests, branch pushes and manual dispatch. It uses an ephemeral GitHub-hosted runner, installs the lockfile, builds the static release, runs every declared `test:*` script, validates Enterprise OS evidence when present and retains sanitized evidence for seven days.

The runner is destroyed after the job. This removes the need for a permanent local Node, Vite, Foundry or Frappe development service.

## Platform Boundaries

- Frappe Cloud remains the ERPNext authority. A public managed bench is not a general-purpose Node or Foundry environment.
- A Frappe private bench is considered only when a persistent custom Frappe app is required and the paid-plan decision is approved.
- Render remains the running proof surface. Preview environments are not enabled unless the Render Pro cost is separately approved.
- GitHub Actions is the default execution environment for builds, tests, validation and reproducible evidence packaging.

## Recovery

If local dependencies are required for a wallet-only review, run `npm ci`, perform the review, stop the server, then remove `node_modules` after the evidence is safely committed and pushed. The lockfile is the recovery source.
