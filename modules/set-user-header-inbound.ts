import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

// The AI Gateway's native "Budgets and Costs" per-metadata expressions
// (request.headers.get(...), etc.) resolve request.user.sub against the
// API-key consumer identity, not whatever generic-jwt-auth-inbound sets
// from the end-user's JWT — confirmed directly with Zuplo. Copying the
// verified sub into a plain header lets those native expressions key on
// the actual end-user identity instead. Must run after
// generic-jwt-auth-inbound in the chain.
export default async function (request: ZuploRequest, context: ZuploContext) {
  const sub = request.user?.sub;
  if (sub) {
    request.headers.set("x-user-sub", sub);
  }
  return request;
}
