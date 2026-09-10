import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

// Public half of a demo-only RSA keypair used to simulate a generic OIDC IDP
// (Okta, Auth0, etc. would publish their own JWKS at this same well-known
// path). The matching private key lives in scripts/mint-demo-jwt.mjs and is
// only ever used to mint test tokens locally — never for anything real.
const JWKS = {
  keys: [
    {
      kty: "RSA",
      n: "3rPbxTrlN08tVuF0zA1tXONTzPcEB9RN2H3BfqoY35-a52VrgP3vSfcI1gO15vKN7vjee3hp4RxpckjAlUomnAuBOhjuq0IMDOrjRsITMTVdyGoqC1d9iZ0Cxad5AT4-Z_u2BOF0zLRlWB2GtxHz3wLnQmVTk84crvAn2cmH-vUV0pRm_cZq2KyE0Fp01oLiBR7zBwFm4yiigHKXsoe4xLmr8_xHZibuhaFpaohe3D2kVx34G4b6tIq_V6yJdUWass_KZy2j5kTAMCaBd_DPtU4G7pKUBiezsp8zaLpSxL4eQDP_l6S8fDC8Hoh_ZO6ivZmDCSXfJztGGJcc18hOFw",
      e: "AQAB",
      alg: "RS256",
      use: "sig",
      kid: "demo-idp-key-1",
    },
  ],
};

export default async function (request: ZuploRequest, context: ZuploContext) {
  return new Response(JSON.stringify(JWKS), {
    headers: { "content-type": "application/json" },
  });
}
