import { createFileRoute } from "@tanstack/react-router";

const SEGEMPAT_HEALTH_URL = "https://segempat-api-supabase.onrender.com/health";

export const Route = createFileRoute("/health" as any)({
  server: {
    handlers: {
      GET: async () => {
        const upstream = await fetch(SEGEMPAT_HEALTH_URL, {
          method: "GET",
          headers: { Accept: "application/json" },
          cache: "no-store",
        });
        const headers = new Headers(upstream.headers);
        headers.set("Cache-Control", "no-store");
        return new Response(upstream.body, {
          status: upstream.status,
          statusText: upstream.statusText,
          headers,
        });
      },
    },
  },
});
