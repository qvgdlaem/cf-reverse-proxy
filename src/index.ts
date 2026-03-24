/**
 * cf-reverse-proxy
 *
 * A config-driven reverse proxy for Cloudflare Workers.
 * Routes path prefixes to either:
 *   - Cloudflare Worker service bindings (zero-egress, worker-to-worker)
 *   - Generic HTTP/HTTPS upstreams (any URL — VPS, Railway, Render, etc.)
 *
 * Configure routes entirely in wrangler.toml — no code changes needed.
 */

interface Route {
  /** Path prefix to match, e.g. "/app" or "/api" */
  prefix: string;
  /** Name of a Cloudflare Worker service binding declared in [[services]] */
  binding?: string;
  /** Any HTTP/HTTPS origin URL, e.g. "https://my-server.example.com" */
  upstream?: string;
  /**
   * Strip the matched prefix before forwarding the request path.
   * Default: false (full path is forwarded as-is).
   *
   * Use strip_prefix: true when the upstream doesn't know about the prefix
   * (e.g. "/api" → "https://api.example.com" should become "/", not "/api").
   *
   * Leave false when the target handles its own prefix — e.g. Cloudflare
   * Workers that do their own namespace routing (like fwd).
   */
  strip_prefix?: boolean;
}

interface Fallback {
  binding?: string;
  upstream?: string;
}

export interface Env {
  /** JSON array of Route objects */
  ROUTES: string;
  /** JSON Fallback — binding or upstream to use when no prefix matches */
  DEFAULT?: string;
  [key: string]: unknown;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    let routes: Route[] = [];
    try {
      routes = JSON.parse(env.ROUTES ?? "[]");
    } catch {
      return new Response("cf-reverse-proxy: ROUTES is not valid JSON.", { status: 500 });
    }

    for (const route of routes) {
      const prefix = route.prefix.replace(/\/+$/, "");
      if (url.pathname === prefix || url.pathname.startsWith(prefix + "/")) {
        return dispatch(request, url, route, env);
      }
    }

    // No prefix matched — fall back to DEFAULT or 404
    if (env.DEFAULT) {
      let fallback: Fallback;
      try {
        fallback = JSON.parse(env.DEFAULT);
      } catch {
        return new Response("cf-reverse-proxy: DEFAULT is not valid JSON.", { status: 500 });
      }
      return dispatch(request, url, { prefix: "", ...fallback }, env);
    }

    return new Response("No route matched.", { status: 404 });
  },
} satisfies ExportedHandler<Env>;

async function dispatch(
  request: Request,
  url: URL,
  route: Route,
  env: Env
): Promise<Response> {
  // --- Cloudflare Worker service binding ---
  if (route.binding) {
    const binding = env[route.binding] as { fetch: (r: Request) => Promise<Response> } | undefined;
    if (!binding || typeof binding.fetch !== "function") {
      return new Response(
        `cf-reverse-proxy: service binding "${route.binding}" not found.\n` +
        `Make sure it is declared in your wrangler.toml [[services]] config.`,
        { status: 502 }
      );
    }
    return binding.fetch(request);
  }

  // --- Generic HTTP/HTTPS upstream ---
  if (route.upstream) {
    const origin = route.upstream.replace(/\/+$/, "");
    const prefix = route.prefix.replace(/\/+$/, "");
    const path = route.strip_prefix
      ? url.pathname.slice(prefix.length) || "/"
      : url.pathname;

    const target = new URL(path + url.search, origin);

    return fetch(target.toString(), {
      method: request.method,
      headers: request.headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      redirect: "manual",
    });
  }

  return new Response(
    `cf-reverse-proxy: route for prefix "${route.prefix}" has neither "binding" nor "upstream".`,
    { status: 502 }
  );
}
