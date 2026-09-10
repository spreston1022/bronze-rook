import { ZuploContext, ZuploRequest, ZoneCache } from "@zuplo/runtime";
import { HOURLY_LIMIT_USD, CACHE_NAMESPACE, ANONYMOUS_IDENTITY, cacheKey, Usage } from "./cost-quota-shared";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const identity = request.user?.sub ?? ANONYMOUS_IDENTITY;
  const cache = new ZoneCache<Usage>(CACHE_NAMESPACE, context);
  const raw = await cache.get(cacheKey(identity));
  const usage: Usage = raw && typeof raw === "object" ? raw : { costUsd: 0 };

  return new Response(
    JSON.stringify({
      identity,
      spentUsd: Number(usage.costUsd.toFixed(6)),
      limitUsd: HOURLY_LIMIT_USD,
      remainingUsd: Number(Math.max(0, HOURLY_LIMIT_USD - usage.costUsd).toFixed(6)),
      window: "hourly (fixed, resets on the hour, UTC)",
    }),
    { headers: { "content-type": "application/json" } }
  );
}
