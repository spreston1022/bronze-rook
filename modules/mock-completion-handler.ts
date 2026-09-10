import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

// Returns a synthetic, OpenAI-shaped completion response so
// generic-cost-quota-inbound can be exercised end-to-end without calling
// (or paying for) a real model. Query params control the simulated cost:
//   ?model=openai/gpt-4o&promptTokens=0&completionTokens=100000
export default async function (request: ZuploRequest, context: ZuploContext) {
  const url = new URL(request.url);
  const model = url.searchParams.get("model") ?? "openai/gpt-4o";
  const promptTokens = Number(url.searchParams.get("promptTokens") ?? 0);
  const completionTokens = Number(url.searchParams.get("completionTokens") ?? 100_000);

  return new Response(
    JSON.stringify({
      id: "mock-completion",
      model,
      choices: [
        {
          message: {
            role: "assistant",
            content: "This is a mock response for exercising generic-cost-quota-inbound.",
          },
        },
      ],
      usage: {
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: promptTokens + completionTokens,
      },
    }),
    { headers: { "content-type": "application/json" } }
  );
}
