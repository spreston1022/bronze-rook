# AI Gateway

This project is a Zuplo AI Gateway. It exposes the canonical AI Gateway
operations (`/v1/chat/completions`, `/v1/messages`, `/v1/responses`, and
`/v1/embeddings`) through `aiGatewayHandlerV2` under `/{app_id}/*`. Only paths
whose suffix is a supported `/v1/...` operation succeed; other paths under
`/{app_id}` return 404.

Each route invokes `ai-gateway-configuration-loader-v2-inbound`, which loads the
application's configuration from the `app_id` path segment, then
`ai-gateway-configuration-executor-v2-inbound`, which runs its
`inboundPolicyChain`. Applications may select only from the policies
pre-declared in `config/policies.json`. To require application API keys for a
specific app, add `ai-gateway-auth-v2-inbound` to that application's
`inboundPolicyChain`. Adding it on the route before the loader requires a key
for every application on the route.

## Customizing the gateway

- Declare additional selectable policies (including custom code policies) in
  `config/policies.json`.
- Pushes to your default branch deploy the gateway to production.
- Trivial redeploy trigger: 2026-09-10a (force-refresh JWT policy after
  JWT_ISSUER/JWT_AUDIENCE/JWT_JWKS_URL were added post-deploy).

## Example: generic JWT auth + per-user $/hour quota

Two selectable policies demonstrate a common pattern — authenticate a caller
with a JWT from any OIDC IDP, then cap their spend by the `sub` claim:

- **`generic-jwt-auth-inbound`** — the built-in `OpenIdJwtInboundPolicy`,
  configured entirely from environment variables (`JWT_ISSUER`,
  `JWT_AUDIENCE`, `JWT_JWKS_URL`, see `.env.example`). Point these at Okta,
  Auth0, Zuplo Auth, or any other IDP that exposes standard OIDC discovery —
  no code changes needed. On success it populates `request.user.sub` from the
  token's `sub` claim.
- **`generic-cost-quota-inbound`** (`modules/cost-quota-inbound.ts`) — reads
  `request.user.sub` and enforces a **$0.10/hour** spend cap per user, in a
  fixed hourly window (resets on the hour, UTC). It rejects with 429 if the
  caller is already over budget, otherwise lets the request through and
  meters the actual cost afterward from the AI response's `usage` and `model`
  fields, using the example pricing table in `modules/cost-quota-shared.ts`
  (`MODEL_PRICING_PER_MILLION_TOKENS` — replace with your real provider
  rates). `modules/cost-quota-usage-handler.ts` exposes the running total at
  `GET /demo/cost-usage`.
- `GET /demo/mock-completion` (`modules/mock-completion-handler.ts`) runs
  `generic-jwt-auth-inbound` then `generic-cost-quota-inbound` and returns a
  synthetic, OpenAI-shaped completion whose token usage is set via
  `?model=`, `?promptTokens=`, `?completionTokens=` query params — lets you
  drive a caller's simulated spend up to (and past) the $0.10/hour limit
  without calling or paying for a real AI provider.

An application enables this by including both policies, in order, in its
`inboundPolicyChain` (JWT auth first, so `request.user.sub` exists when the
quota policy runs):

```json
"inboundPolicyChain": ["generic-jwt-auth-inbound", "generic-cost-quota-inbound"]
```

### Combining with `ai-gateway-auth-v2-inbound` (app API keys)

If an app also requires its own API key (`ai-gateway-auth-v2-inbound`), both
that policy and `OpenIdJwtInboundPolicy` default to reading
`Authorization: Bearer <value>` — they collide on the same header. Move the
end-user JWT to a different header via `generic-jwt-auth-inbound`'s
`authHeader` option (e.g. `x-jwt-token`), leaving `Authorization` for the
app's API key:

```json
{ "authHeader": "x-jwt-token" }
```

**Gotcha:** setting a custom `authHeader` does *not* change the default
`authScheme` (`Bearer`) — you still have to send
`x-jwt-token: Bearer <token>`, not just the raw token. It's easy to assume a
custom header name means "just put the raw value here"; it doesn't.

### Testing without a real IDP

This repo also self-hosts a minimal demo IDP so the example is runnable out
of the box:

- `GET /.well-known/openid-configuration` and `GET /.well-known/jwks.json`
  (`modules/demo-idp-openid-config-handler.ts`,
  `modules/demo-idp-jwks-handler.ts`) publish discovery metadata and a public
  key for a demo-only RSA keypair. A static copy of the same JWKS also lives
  at `config/demo-jwks.json` (see below for why).
- `scripts/mint-demo-jwt.mjs` signs a test JWT with the matching private key
  (plain Node `crypto`, no dependencies):

  ```sh
  node scripts/mint-demo-jwt.mjs --sub=user-123
  ```

  Use the printed token as a `Bearer` token against a route/app whose
  `inboundPolicyChain` includes `generic-jwt-auth-inbound`, with `JWT_ISSUER`
  / `JWT_JWKS_URL` set to this gateway's own URL (see `.env.example`).

This demo IDP and its keypair are for testing only — swap `JWT_ISSUER`,
`JWT_AUDIENCE`, and `JWT_JWKS_URL` to point at a real IDP for production, and
the `generic-jwt-auth-inbound` policy needs no other changes.

**Important — self-hosting the JWKS only works for local `zuplo dev`, not
once deployed.** Cloudflare Workers can't make an outbound `fetch()` back to
their own zone/domain (it times out with a 522), so once this gateway is
deployed, `OpenIdJwtInboundPolicy` can never successfully fetch a `jwkUrl`
that points back at this same gateway's own domain — `/.well-known/jwks.json`
included. For local dev, point `JWT_JWKS_URL` at
`http://localhost:9000/.well-known/jwks.json` as usual. For testing against a
**deployed** gateway, point `JWT_JWKS_URL` at the static copy served from
GitHub instead (`JWT_ISSUER` can still be the deployed gateway's own URL —
issuer is just an identifier string, it doesn't need to be fetchable):

```
JWT_JWKS_URL=https://raw.githubusercontent.com/<org>/<repo>/main/config/demo-jwks.json
```

A real IDP (Okta, Auth0, etc.) never hits this problem, since its JWKS lives
on a different domain than your gateway.
