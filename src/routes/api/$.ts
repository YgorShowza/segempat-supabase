import { createFileRoute } from "@tanstack/react-router";

const SEGEMPAT_UPSTREAM_ORIGIN = "https://segempat-api-supabase.onrender.com";

async function proxyApiRequest(request: Request) {
  const incomingUrl = new URL(request.url);
  const upstreamUrl = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, SEGEMPAT_UPSTREAM_ORIGIN);

  const headers = new Headers(request.headers);
  headers.delete("host");
  headers.delete("content-length");

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: "manual",
  };

  if (request.method !== "GET" && request.method !== "HEAD") {
    init.body = await request.arrayBuffer();
  }

  const upstream = await fetch(upstreamUrl, init);
  const responseHeaders = new Headers(upstream.headers);

  // The browser talks only to this Worker origin. CORS is enforced between the
  // Worker and the API by the API's own trusted-origin policy, so upstream CORS
  // headers are unnecessary on the first-party response.
  responseHeaders.delete("access-control-allow-origin");
  responseHeaders.delete("access-control-allow-credentials");
  responseHeaders.delete("access-control-allow-methods");
  responseHeaders.delete("access-control-allow-headers");

  return new Response(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: responseHeaders,
  });
}

export const Route = createFileRoute("/api/$")({
  server: {
    handlers: {
      GET: ({ request }) => proxyApiRequest(request),
      POST: ({ request }) => proxyApiRequest(request),
      PATCH: ({ request }) => proxyApiRequest(request),
      PUT: ({ request }) => proxyApiRequest(request),
      DELETE: ({ request }) => proxyApiRequest(request),
      OPTIONS: ({ request }) => proxyApiRequest(request),
    },
  },
});
