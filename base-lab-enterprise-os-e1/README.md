# CATVERSE Twin-Ledger Enterprise Finance OS — AOXPET Base Lab

Base rail edition for enterprise agent and asset operations. Its non-payment heroes are Agent Commerce, BaseBatchTwin/BaseInventoryRoot, Manufacturing and Quality Evidence, BaseAssetEvidence, BaseFinancingIntent and BaseCloseProof. BaseProofPay is only the Treasury/Payment component.

## Live Demo

- Enterprise OS: available after the separately authorized Render E1 deployment
- Health: `/healthz`
- Sample evidence: `/api/v1/evidence`
- Topology: `/api/v1/topology`

## Three-minute Walkthrough

1. Open the Enterprise OS and inspect D01-D14 plus C0-C7 without connecting a wallet.
2. Follow one CATVERSE inventory batch through receipt, movement, exception, ERP Stock Ledger crosswalk and close/report impact.
3. Inspect the claim matrix and verify that live, local, designed, missing and prohibited claims remain separate.

## Architecture

`Base or synthetic evidence -> ABL read-only Enterprise OS -> ERPNext authority -> GL / Payment Ledger / Stock Ledger -> close / reports / FP&A`

The Render service is isolated from Arc. It does not share runtime, credentials, Company, business-event namespace, queue or evidence. AOXPET Base Lab / ABL / USD is fixed.

## Coverage and Claims

- D01-D14: `engineering-proof/config/base_lab_domain_coverage_matrix.json`
- C0-C7 and portfolio boundaries: `engineering-proof/config/base_enterprise_agent_asset_operations_claim_matrix.json`
- Canonical event schema: `engineering-proof/config/canonical-business-event-envelope.schema.json`
- ERP adapter public contract: `engineering-proof/config/erp-adapter-public-contract.json`
- CATVERSE fixtures: `engineering-proof/fixtures/`

Current E1 is a read-only Console deployment candidate, not a durable production control plane and not proof that C0-C7 is complete.

## Reproduce

```bash
node engineering-proof/tests/validate-proof.mjs
```

The package also contains the exact Docker runtime and `render.yaml` used by Render. The deployed Render version must point to the same Git commit as this release candidate.

## Security

- GET/HEAD-only E1 surfaces; writes return 405.
- Deny-by-default CORS, CSP, HSTS, frame/referrer/permissions controls and rate limiting.
- No ERP credential, ERP write, wallet, signer or chain executor.
- Sanitized evidence/topology and no raw ERP payload or local absolute paths.

## Cost, Cold Start and Rollback

Render Singapore Free is the approved E1 target. Sleep and cold start are accepted; paid upgrade requires separate approval. Rollback is suspend/delete of this isolated service or redeploy of the previous reviewed commit. No ERP or chain rollback is required for E1.

## Publication Boundary

GitHub is engineering proof, Render is running proof and ERPNext is business proof. Deployment success alone is not Enterprise OS completion. Git push, visibility changes, E2 credentials, E3 drafts, wallet/chain actions, submissions and social publication remain separately authorized.
