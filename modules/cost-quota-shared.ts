export const HOURLY_LIMIT_USD = 0.1;
export const TTL_SECONDS = 3600;
export const CACHE_NAMESPACE = "generic-cost-quota";
export const ANONYMOUS_IDENTITY = "anonymous";

export interface Usage {
  costUsd: number;
}

// Example rates only (USD per 1,000,000 tokens) — replace with whatever your
// upstream providers actually charge you. Any model not listed falls back to
// DEFAULT_PRICING so the quota still degrades safely instead of charging $0.
export const MODEL_PRICING_PER_MILLION_TOKENS: Record<
  string,
  { prompt: number; completion: number }
> = {
  "openai/gpt-4o-mini": { prompt: 0.15, completion: 0.6 },
  "openai/gpt-4o": { prompt: 2.5, completion: 10 },
  "openai/gpt-5": { prompt: 1.25, completion: 10 },
};

const DEFAULT_PRICING = { prompt: 1, completion: 2 };

function stripProviderPrefix(model: string): string {
  const slashIndex = model.indexOf("/");
  return slashIndex >= 0 ? model.slice(slashIndex + 1) : model;
}

// Provider responses often return a specific dated snapshot (e.g.
// "gpt-4o-mini-2024-07-18") rather than the bare name a request specified
// (e.g. "openai/gpt-4o-mini"). Match by longest base-name prefix so
// "gpt-4o-mini-2024-07-18" resolves to the "gpt-4o-mini" row, not "gpt-4o".
function findPricing(model: string): { prompt: number; completion: number } | undefined {
  if (MODEL_PRICING_PER_MILLION_TOKENS[model]) {
    return MODEL_PRICING_PER_MILLION_TOKENS[model];
  }
  const bareModel = stripProviderPrefix(model);
  const candidates = Object.entries(MODEL_PRICING_PER_MILLION_TOKENS)
    .map(([key, pricing]) => ({ base: stripProviderPrefix(key), pricing }))
    .sort((a, b) => b.base.length - a.base.length);
  for (const { base, pricing } of candidates) {
    if (bareModel === base || bareModel.startsWith(`${base}-`)) {
      return pricing;
    }
  }
  return undefined;
}

export function costForUsage(
  model: string | undefined,
  promptTokens: number,
  completionTokens: number
): number {
  const pricing = (model ? findPricing(model) : undefined) ?? DEFAULT_PRICING;
  return (
    (promptTokens / 1_000_000) * pricing.prompt +
    (completionTokens / 1_000_000) * pricing.completion
  );
}

// Fixed hourly window keyed on the wall-clock UTC hour, so spend resets on
// the hour rather than sliding — same trade-off as a fixed daily window,
// just at a finer grain.
export function hourKey(): string {
  const d = new Date();
  return `${d.getUTCFullYear()}-${d.getUTCMonth() + 1}-${d.getUTCDate()}-${d.getUTCHours()}`;
}

export function cacheKey(identity: string): string {
  return `${identity}:${hourKey()}`;
}
