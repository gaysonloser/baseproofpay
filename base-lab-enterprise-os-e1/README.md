# CATVERSE Twin-Ledger Enterprise Finance OS — AOXPET Base Lab

Base-native enterprise agent and asset operations. The non-payment heroes are Agent Commerce, BaseBatchTwin/BaseInventoryRoot, Manufacturing and Quality Evidence, BaseAssetEvidence, BaseFinancingIntent and BaseCloseProof. BaseProofPay is only the Treasury/Payment component.

## Live Demo

- Enterprise OS: available after the separately authorized Render E1 deployment
- Health: `/healthz`
- Sample evidence: `/api/v1/evidence`
- Control readiness: `/api/v1/control-readiness`
- Topology: `/api/v1/topology`
- Base ecosystem proof: `/api/v1/ecosystem`

## Three-minute Walkthrough

1. Inspect D01-D14 and C0-C7 without connecting a wallet.
2. Follow a CATVERSE batch through receipt, movement, exception, ERP Stock Ledger crosswalk and close/report impact.
3. Verify the Builder Code, Base contracts, x402 runtime and Talent aggregate in Ecosystem Proof.
4. Confirm that Base.dev indexing, Base Builders nomination and independent adoption remain explicitly pending.

## Architecture

`Base or synthetic evidence -> ABL read-only Enterprise OS -> ERPNext authority -> GL / Payment Ledger / Stock Ledger -> close / reports / FP&A`

The Render service is isolated from Arc. It shares no runtime, credentials, Company, business-event namespace, queue or evidence. The target is fixed to `AOXPET Base Lab / ABL / USD`.

## Base Ecosystem Evidence

- Base Dashboard App ID: `6a5c632cf364895c3c606518`
- Builder Code / ERC-8021: `bc_iscm570t`
- Verified contracts: [SpendingPolicyManager](https://base.blockscout.com/address/0x1bBe5B45757D66Fd97A818A62c89FaBD90cdC1d1) and [PaymentReceiptRegistry](https://base.blockscout.com/address/0xD7CE8ecED9CDda01365b2eAD539581Afd981880B)
- Production x402: [BaseProofPay x402](https://baseproofpay-x402.onrender.com/)
- Talent: [public project](https://talent.app/~/projects/ec69c95f-9bde-48bb-8ff9-e75df213db4b), with `2 transactions / 2 DAU` observed on `2026-07-21`
- Base.dev: latest reviewed public snapshot predates the current evidence; no indexing claim is made
- Base builders: nomination narrative is local and not submitted
- Independent adoption: still missing; self-controlled canaries and aggregates do not satisfy it

Official Base guidance confirms Builder Codes are the attribution path used for analytics and discovery surfaces. A valid suffix proves transport; Base.dev indexing remains a separate asynchronous result.

## Coverage and Claims

- D01-D14: `engineering-proof/config/base_lab_domain_coverage_matrix.json`
- C0-C7 and portfolio boundaries: `engineering-proof/config/base_enterprise_agent_asset_operations_claim_matrix.json`
- Ecosystem status: `engineering-proof/config/base_lab_ecosystem_evidence.json`
- Canonical event schema: `engineering-proof/config/canonical-business-event-envelope.schema.json`
- ERP adapter public contract: `engineering-proof/config/erp-adapter-public-contract.json`
- CATVERSE fixtures: `engineering-proof/fixtures/`

Current E1 is a read-only Console deployment candidate, not a durable production control plane and not proof that C0-C7 is complete.

## Reproduce

```bash
node engineering-proof/tests/validate-proof.mjs
node engineering-proof/tests/validate-ecosystem-proof.mjs
```

The package contains the Docker runtime and `render.yaml` used by Render. The deployed version must point to the same Git commit and release fingerprint as this candidate.

## Security

- GET/HEAD-only E1 surfaces; writes return `405`.
- Deny-by-default CORS, CSP, HSTS, frame/referrer/permissions controls and rate limiting.
- No ERP credential, ERP write, wallet, signer or chain executor.
- Sanitized evidence/topology and no raw ERP payload or local absolute paths.

## Cost, Cold Start and Rollback

Render Singapore Free is the approved E1 target. Sleep and cold start are accepted. Paid upgrade requires separate approval. Rollback is suspend/delete of this isolated service or redeploy of the previous reviewed commit. No ERP or chain rollback is required for E1.

## Publication Boundary

GitHub is engineering proof, Render is running proof and ERPNext is business proof. Deployment success alone is not Enterprise OS completion. Git push, visibility changes, Base.dev/Talent updates, Builders nomination, E2 credentials, E3 drafts, wallet/chain actions and social publication remain separately authorized.
