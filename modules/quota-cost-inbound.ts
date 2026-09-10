import { ZuploContext, ZuploRequest, QuotaInboundPolicy } from "@zuplo/runtime";
import { costForUsage } from "./cost-quota-shared";

// Experimental alternative to generic-cost-quota-inbound: instead of our own
// ZoneCache bucketing, this leans on the built-in QuotaInboundPolicy
// (declared as generic-quota-cost-inbound, quotaBy: "user") for storage and
// enforcement, and only supplies the AI-Gateway-specific piece Zuplo has no
// way to know on its own: how much a completion actually cost in dollars.
// generic-quota-cost-inbound must run before this policy in the chain.
const QUOTA_POLICY_NAME = "generic-quota-cost-inbound";
const HOURLY_LIMIT_USD = 0.1;

function quotaExceeded(identity: string, spentUsd: number): Response {
  return new Response(
    JSON.stringify({
      type: "https://httpproblems.com/http-status/429",
      title: "Too Many Requests",
      status: 429,
      detail: `Hourly spend limit of $${HOURLY_LIMIT_USD.toFixed(2)} exceeded for '${identity}' (spent $${spentUsd.toFixed(4)} this hour, via QuotaInboundPolicy)`,
    }),
    { status: 429, headers: { "content-type": "application/problem+json" } }
  );
}

export default async function (request: ZuploRequest, context: ZuploContext) {
  const identity = request.user?.sub ?? "anonymous";
  const usage = QuotaInboundPolicy.getUsage(context, QUOTA_POLICY_NAME);
  const currentCost = usage?.meters?.cost ?? 0;

  if (currentCost >= HOURLY_LIMIT_USD) {
    return quotaExceeded(identity, currentCost);
  }

  context.addResponseSendingHook(async (response) => {
    if (!response.ok) return response;
    const contentType = response.headers.get("content-type") ?? "";
    if (contentType.includes("text/event-stream")) return response;
    try {
      const body = await response.clone().json();
      const respUsage = body?.usage;
      if (respUsage && (typeof respUsage.prompt_tokens === "number" || typeof respUsage.completion_tokens === "number")) {
        const cost = costForUsage(body?.model, respUsage.prompt_tokens ?? 0, respUsage.completion_tokens ?? 0);
        QuotaInboundPolicy.setMeters(context, { cost });
        context.log.info({ identity, model: body?.model, cost }, "quota-cost: metered spend via QuotaInboundPolicy");
      }
    } catch (e) {
      context.log.warn(`quota-cost: failed to read response body for usage: ${String(e)}`);
    }
    return response;
  });

  return request;
}
