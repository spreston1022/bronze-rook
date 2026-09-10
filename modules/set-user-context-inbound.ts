import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

// The AI Gateway's native "Budgets and Costs" per-metadata expressions
// (request.user.sub, request.headers.get(...), context.custom.*, etc.)
// resolve request.user.sub against the API-key consumer identity, not
// whatever generic-jwt-auth-inbound sets from the end-user's JWT —
// confirmed directly with Zuplo. Copying the verified sub onto
// context.custom (not a real request header, so nothing is added to
// what's forwarded upstream or logged) lets those native expressions
// key on the actual end-user identity instead. Must run after
// generic-jwt-auth-inbound in the chain.
export default async function (request: ZuploRequest, context: ZuploContext) {
  const sub = request.user?.sub;
  if (sub) {
    context.custom.userSub = sub;
  }
  return request;
}
