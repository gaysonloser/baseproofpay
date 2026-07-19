# BaseProofPay

BaseProofPay is a read-only public demo for verifying agent-payment settlement receipts and payer-controlled spending policies on Base.

## Public Surface

- `index.html`: static receipt viewer with the completed Base Mainnet technical canary.
- `baseproofpay_app_icon_1024.png`: public application icon.
- Base Dashboard ownership marker: `base:app_id=6a5c632cf364895c3c606518`.

The public viewer does not connect a wallet, request a signature, send a transaction, or store credentials.

## Verified Mainnet Proof

- SpendingPolicyManager: `0x1bBe5B45757D66Fd97A818A62c89FaBD90cdC1d1`
- PaymentReceiptRegistry: `0xD7CE8ecED9CDda01365b2eAD539581Afd981880B`
- Canary transaction: `0x9295affca6214350e9c55d8785354f123ef47bd15e4249efe1b7fbea140f2f1c`
- Result: exact `1 USDC` settlement, zero residual allowance, zero Registry balance, and matching policy plus immutable receipt.

The payer and payee wallets are controlled by the same owner. This is a technical canary, not independent-user adoption.

## Independent User Proof

`independent-proof.html` provides a separately disclosed Base Account flow for a genuine external user to send exactly `0.10 USDC` to the GAYSON Base Account. It creates unique policy and payment IDs in the browser, requires atomic batch support, preflights balances, allowance, contract code and unused IDs, and postflights the full policy, receipt, balance deltas and zero residual allowance. It has no backend and makes no wallet request until the user clicks Connect. The payment is not an investment, token purchase, donation promise, or refundable deposit.

## Security

Do not submit private keys, seed phrases, API keys, wallet sessions, or confidential payment data. See `SECURITY.md`.
