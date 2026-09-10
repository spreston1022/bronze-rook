import { ZuploContext, ZuploRequest } from "@zuplo/runtime";

export default async function (request: ZuploRequest, context: ZuploContext) {
  const target =
    new URL(request.url).searchParams.get("url") ??
    "https://bronze-rook-main-ae63249.zuplo.app/.well-known/jwks.json";
  try {
    const resp = await fetch(target);
    const text = await resp.text();
    return new Response(
      JSON.stringify({
        target,
        status: resp.status,
        statusText: resp.statusText,
        headers: Object.fromEntries(resp.headers.entries()),
        bodyPreview: text.slice(0, 1000),
      }),
      { headers: { "content-type": "application/json" } }
    );
  } catch (e) {
    return new Response(JSON.stringify({ target, error: String(e) }), {
      headers: { "content-type": "application/json" },
    });
  }
}
