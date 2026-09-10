import { ZuploContext, ZuploRequest, QuotaInboundPolicy } from "@zuplo/runtime";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const usage = QuotaInboundPolicy.getUsage(context, "generic-quota-cost-inbound");
  return new Response(
    JSON.stringify({ identity: request.user?.sub ?? "anonymous", usage }),
    { headers: { "content-type": "application/json" } }
  );
}
