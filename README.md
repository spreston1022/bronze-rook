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

Two selectable policies, plus one native AI Gateway policy configured per
app, demonstrate authenticating a caller with a JWT from any OIDC IDP, then
capping their spend by the `sub` claim — using Zuplo's own AI Gateway
metering and pricing, not a hand-maintained pricing table:

- **`generic-jwt-auth-inbound`** — the built-in `OpenIdJwtInboundPolicy`,
  configured entirely from environment variables (`JWT_ISSUER`,
  `JWT_AUDIENCE`, `JWT_JWKS_URL`, see `.env.example`). Point these at Okta,
  Auth0, Zuplo Auth, or any other IDP that exposes standard OIDC discovery —
  no code changes needed. On success it populates `request.user.sub` from the
  token's `sub` claim.
- **`generic-set-user-context-inbound`** (`modules/set-user-context-inbound.ts`)
  — copies the verified `request.user.sub` onto `context.custom.userSub`.
  This exists because the native AI Gateway Metering policy's
  `budgetBy: "expression"` rules resolve `request.user.sub` against the
  **API-key consumer** identity (confirmed directly with Zuplo), not
  whatever a later JWT policy sets — so a small bridge is needed to expose
  the JWT identity somewhere a native expression can actually read it.
  `context.custom` is a plain in-memory value shared between policies in the
  same request; nothing is added to the request itself, so nothing leaks to
  the upstream provider or shows up as an extra header in logs.
- **The native "Budgets and Costs" policy** (`ai-gateway-metering-v2-inbound`,
  already selectable via `config/policies.json`) — add it to the app's
  `inboundPolicyChain` and configure a budget rule keyed by
  `context.custom.userSub` in the Portal (Policies → Budgets and Costs →
  "By metadata"):

  ```json
  {
    "budgetBy": "expression",
    "expression": "context.custom.userSub",
    "meters": [
      { "meter": "cost", "period": "hourly", "value": 0.10, "action": "block" }
    ]
  }
  ```

  This gives every distinct JWT `sub` its own $0.10/hour budget, computed
  from Zuplo's own per-model pricing (Settings → AI Providers), not a
  pricing table you maintain yourself. The Portal labels an expression
  rooted at `context.custom.*` as **"Gateway-derived"** to distinguish it
  from consumer-metadata-backed expressions like `request.user.sub`.

An application enables this by including both custom policies, in order, in
its `inboundPolicyChain` (JWT auth first, so `request.user.sub` exists when
the bridge runs; the bridge before Budgets and Costs, so
`context.custom.userSub` exists when the budget rule evaluates it):

```json
"inboundPolicyChain": ["generic-jwt-auth-inbound", "generic-set-user-context-inbound", "..."]
```

The Budgets and Costs budget rule itself is configured per-app in the
Portal, not in this repo — it isn't part of `inboundPolicyChain` JSON, so
there's nothing to check into git for that piece beyond adding the policy
to the chain.

**Gotcha:** `config/policies.json` policy entries only accept `handler`,
`name`, and `policyType` — no `description` or other field, even though it
seems like a natural thing to add for documentation. An extra field fails
schema validation and breaks every subsequent deploy, but `git push`
succeeds either way — the failure only shows up in the Portal's build
history, so check there if changes don't seem to be taking effect.

### Combining with `ai-gateway-auth-v2-inbound` (app API keys)

If an app also requires its own API key (`ai-gateway-auth-v2-inbound`), both
that policy and `OpenIdJwtInboundPolicy` default to reading
`Authorization: Bearer <value>` — they collide on the same header. Move the
**app's API key** to a different header instead of moving the JWT —
`ai-gateway-auth-v2-inbound` supports this via its own `authHeader` /
`authScheme` options, leaving `Authorization: Bearer <token>` for the
end-user JWT (the standard OAuth/OIDC convention most JWT-consuming clients
expect and can't easily be reconfigured away from):

```json
{ "authHeader": "x-api-key" }
```

Leave `authScheme` alone — it still defaults to `Bearer`, so clients send
`x-api-key: Bearer <app-api-key>`. (In the Zuplo portal, leaving the
`AuthScheme` field blank keeps this `Bearer` default; there's a separate
"Use an empty value" toggle if you actually want no prefix at all, which
isn't required here.) `generic-jwt-auth-inbound` keeps its default
`Authorization: Bearer <token>`, with no options needed.

**Gotcha (if you go the other way and move the JWT instead):** setting a
custom `authHeader` on `OpenIdJwtInboundPolicy` does *not* change its default
`authScheme` (`Bearer`) — the token still needs the `Bearer ` prefix on the
new header too (e.g. `x-jwt-token: Bearer <token>`, not just the raw token).
It's easy to assume a custom header name means "just put the raw value
here"; it doesn't.

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
once deployed.** The deployed edge runtime can't make an outbound `fetch()`
back to its own zone/domain (the request times out), so once this gateway is
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
