# BaseProofPay x402 Builder Attribution Upgrade

Date: `2026-07-20`
Status: `local ready / publication confirmation required`

## Conclusion

The completed EOA 8889 canary proved that the CDP facilitator can settle Base Mainnet x402 payments, but the public BaseProofPay seller declared only the `payment-identifier` extension. The payment payload therefore contained no BaseProofPay app code. CDP appended its own facilitator attribution `cdp_facil1`, which is why the final transaction did not contain `bc_iscm570t`.

The official x402 v2 package already contains the correct solution. `@x402/extensions/builder-code` lets a resource server declare its app Builder Code in the HTTP `402`; the facilitator then builds an ERC-8021 Schema 2 suffix for the final settlement transaction. The expected decoded fields are:

```json
{
  "a": "bc_iscm570t",
  "w": "cdp_facil1"
}
```

This is a seller configuration gap, not a limitation of EIP-3009, Coinbase Wallet, or the CDP facilitator.

## Official Basis

- Base Builder Codes for apps: `https://docs.base.org/apps/builder-codes/app-developers`
- Base wallet multi-code attribution: `https://docs.base.org/apps/builder-codes/wallet-developers`
- Base Builder Codes for agents: `https://docs.base.org/apps/builder-codes/agent-developers`
- CDP x402 overview and facilitator role: `https://docs.cdp.coinbase.com/x402/welcome`
- Installed official implementation: `@x402/extensions 2.19.0`, extension `builder-code`, ERC-8021 Schema 2.

## Local Implementation

The production candidate now:

1. Registers `builderCodeResourceServerExtension` on the x402 resource server.
2. Declares `builder-code` with app code `bc_iscm570t` in the `PAYMENT-REQUIRED` challenge.
3. Preserves the existing required `payment-identifier`, exact `0.01 USDC`, Base Mainnet and payee controls.
4. Leaves final suffix construction to the facilitator, which can preserve its own wallet code alongside the app code.

Pure in-memory validation passes all seven gates:

- production config v2;
- official builder extension declared;
- BaseProofPay app code encoded;
- CDP facilitator code preserved;
- ERC-8021 Schema 2 marker present;
- no wallet action;
- no chain write.

Machine evidence: `outputs/base_x402_builder_attribution_upgrade_latest.json`.

The existing HTTP integration suite could not bind a temporary localhost port inside the current filesystem sandbox. Syntax, module import, official extension round-trip and machine gates passed; public HTTP validation remains part of the deployment postflight.

## Current Boundary

- The public Render service still runs the pre-upgrade version.
- No GitHub push, Render deployment, wallet connection, signature, payment, facilitator settle, or chain write occurred in this upgrade work.
- The completed identifier `bpp_eoa8889_20260720_001` and its authorization nonce remain permanently consumed and must never be reused.
- Publication alone must first be verified with an unpaid HTTP `402`; it must not trigger another payment.
- Independent adoption still requires a genuinely external payer and a separate confirmation package.

## Publication Postflight

After a separately confirmed GitHub/Render publication:

1. `/healthz` remains HTTP `200`.
2. Unpaid `/api/reconciliation-evidence` remains HTTP `402`.
3. Existing Base network, official USDC, exact `0.01 USDC`, payee and required identifier remain unchanged.
4. `PAYMENT-REQUIRED.extensions.builder-code.info.a` equals `bc_iscm570t`.
5. No wallet request, signature, payment, verify or settle occurs during publication validation.

Only after those checks pass may a new independent payer package be prepared. Its postflight must decode the final transaction as Schema 2 with `a=bc_iscm570t`; the facilitator code may coexist as `w`.
