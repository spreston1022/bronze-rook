import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

// Minimal OpenID discovery document so OpenIdJwtInboundPolicy can resolve
// this gateway as a stand-in issuer for local testing, the same way it
// would resolve a real IDP's discovery document (Okta, Auth0, etc.). The
// issuer is derived from the request origin so this works in both `zuplo
// dev` and a deployed environment without hardcoding a domain.
export default async function (request: ZuploRequest, context: ZuploContext) {
  const issuer = new URL(request.url).origin;
  const config = {
    issuer,
    jwks_uri: `${issuer}/.well-known/jwks.json`,
    id_token_signing_alg_values_supported: ["RS256"],
    response_types_supported: ["id_token"],
    subject_types_supported: ["public"],
  };
  return new Response(JSON.stringify(config), {
    headers: { "content-type": "application/json" },
  });
}
