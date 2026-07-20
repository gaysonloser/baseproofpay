import {
  BUILDER_CODE,
  BuilderCodeFacilitatorExtension,
  declareBuilderCodeExtension,
  parseBuilderCodeSuffixFromCalldata
} from "@x402/extensions/builder-code";

export const CDP_FACILITATOR_BUILDER_CODE = "cdp_facil1";

export function buildX402BuilderAttributionEvidence(config) {
  if (!/^bc_[a-z0-9_]+$/.test(config.builderCode ?? "")) {
    throw new Error("A valid BaseProofPay Builder Code is required.");
  }

  const declared = declareBuilderCodeExtension(config.builderCode);
  const paymentPayload = {
    x402Version: 2,
    payload: { simulation: true },
    accepted: {
      scheme: config.scheme,
      network: config.network,
      amount: "10000",
      asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      payTo: config.payTo,
      maxTimeoutSeconds: 300
    },
    resource: {
      url: "https://baseproofpay-x402.onrender.com/api/reconciliation-evidence"
    },
    extensions: {
      [BUILDER_CODE]: declared
    }
  };
  const extension = new BuilderCodeFacilitatorExtension({
    builderCode: CDP_FACILITATOR_BUILDER_CODE
  });
  const dataSuffix = extension.buildDataSuffix({
    paymentPayload,
    paymentRequirements: paymentPayload.accepted
  });
  if (!dataSuffix) throw new Error("Builder Code extension did not produce a data suffix.");
  const decoded = parseBuilderCodeSuffixFromCalldata(`0x1234${dataSuffix.slice(2)}`);
  if (!decoded) throw new Error("Builder Code suffix could not be decoded.");

  return {
    declared,
    paymentPayload,
    dataSuffix,
    decoded
  };
}
