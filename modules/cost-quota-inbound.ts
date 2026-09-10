import { ZuploContext, ZuploRequest, ZoneCache } from "@zuplo/runtime";
import {
  HOURLY_LIMIT_USD,
  TTL_SECONDS,
  CACHE_NAMESPACE,
  ANONYMOUS_IDENTITY,
  cacheKey,
  costForUsage,
  Usage,
} from "./cost-quota-shared";

function quotaExceeded(identity: string, spentUsd: number): Response {
  return new Response(
    JSON.stringify({
      type: "https://httpproblems.com/http-status/429",
      title: "Too Many Requests",
      status: 429,
      detail: `Hourly spend limit of $${HOURLY_LIMIT_USD.toFixed(2)} exceeded for '${identity}' (spent $${spentUsd.toFixed(4)} this hour)`,
    }),
    { status: 429, headers: { "content-type": "application/problem+json" } }
  );
}

// Enforces a per-user $/hour spend cap. Identity comes from the `sub` claim
// that an upstream JWT auth policy (e.g. generic-jwt-auth-inbound) populates
// on request.user — so this policy must run after JWT auth in the
// inboundPolicyChain. Actual dollar cost isn't known until the AI provider
// responds with token usage, so like a token-based quota this policy:
//   1. rejects the request up front if the caller is already over budget
//   2. lets the request through otherwise, then meters the real cost via a
//      response hook once usage is known
export default async function (request: ZuploRequest, context: ZuploContext) {
  const identity = request.user?.sub ?? ANONYMOUS_IDENTITY;
  const cache = new ZoneCache<Usage>(CACHE_NAMESPACE, context);
  const key = cacheKey(identity);

  const raw = await cache.get(key);
  const current: Usage = raw && typeof raw === "object" ? raw : { costUsd: 0 };

  if (current.costUsd >= HOURLY_LIMIT_USD) {
    return quotaExceeded(identity, current.costUsd);
  }

  context.addResponseSendingHook(async (response) => {
    if (!response.ok) return response;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) {
      context.log.info("cost-quota: skipping streamed response, no buffered usage to meter");
      return response;
    }
    try {
      const body = await response.clone().json();
      const usage = body?.usage;
      if (usage && (typeof usage.prompt_tokens === "number" || typeof usage.completion_tokens === "number")) {
        const cost = costForUsage(body?.model, usage.prompt_tokens ?? 0, usage.completion_tokens ?? 0);
        const latest = (await cache.get(key)) ?? current;
        const updated: Usage = { costUsd: latest.costUsd + cost };
        await cache.put(key, updated, TTL_SECONDS);
        context.log.info(
          { identity, model: body?.model, cost, ...updated, limitUsd: HOURLY_LIMIT_USD },
          "cost-quota: recorded spend for request"
        );
      }
    } catch (e) {
      context.log.warn(`cost-quota: failed to read response body for usage: ${String(e)}`);
    }
    return response;
  });

  return request;
}
