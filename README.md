# cf-reverse-proxy

A minimal, config-driven reverse proxy for Cloudflare Workers. Route path prefixes to Cloudflare Worker service bindings or any HTTP/HTTPS upstream — no code changes needed to add or remove routes.

```
yourdomain.com/app/*   →  Cloudflare Worker (zero-egress, worker-to-worker)
yourdomain.com/api/*   →  https://api.myserver.com
yourdomain.com/blog/*  →  https://my-blog.up.railway.app
yourdomain.com/*       →  Cloudflare Worker (catch-all default)
```

---

## Why this exists

Cloudflare Workers support two fundamentally different ways to talk to a backend:

- **Service bindings** — worker-to-worker calls that stay entirely within Cloudflare's network. Zero egress cost, lowest latency, no public endpoint needed.
- **URL upstreams** — a regular `fetch()` to any HTTP/HTTPS origin. Works with anything: a VPS, Railway, Render, Fly.io, a bare IP, whatever.

Most reverse proxy projects support one or the other. This one supports both, configured entirely in `wrangler.toml` — no code changes needed to add, remove, or change routes.

---

## Setup

### 1 — Clone and install

```bash
git clone https://github.com/qvgdlaem/cf-reverse-proxy.git
cd cf-reverse-proxy
yarn install
```

### 2 — Configure routes

Open `wrangler.toml` and edit the `ROUTES` var. Each route needs a `prefix` and either a `binding` or an `upstream`:

```toml
[vars]
ROUTES = '''
[
  { "prefix": "/app",  "binding":  "APP_WORKER"                                    },
  { "prefix": "/api",  "upstream": "https://api.example.com", "strip_prefix": true },
  { "prefix": "/blog", "upstream": "https://my-blog.up.railway.app"                }
]
'''

# Optional: catch-all for requests that match no prefix.
# If omitted, unmatched requests return 404.
DEFAULT = '{ "binding": "MAIN_WORKER" }'
```

For every `binding` you reference, add a `[[services]]` block:

```toml
[[services]]
binding = "APP_WORKER"
service  = "my-app-worker-name"   # the Worker's name in your Cloudflare account

[[services]]
binding = "MAIN_WORKER"
service  = "my-main-worker-name"
```

`upstream` routes need no extra config — just the URL.

### 3 — Deploy

```bash
yarn deploy
```

---

## Route reference

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `prefix` | string | yes | Path prefix to match, e.g. `"/app"`. Trailing slash is ignored. |
| `binding` | string | one of | Name of a `[[services]]` binding in `wrangler.toml`. |
| `upstream` | string | one of | Any HTTP/HTTPS origin URL. |
| `strip_prefix` | boolean | no | Strip the matched prefix before forwarding. Default: `false`. |

Routes are matched **top to bottom** — first match wins.

### `strip_prefix`

Controls what path the upstream sees:

```
Incoming:  GET /api/users
Prefix:    /api
Upstream:  https://api.example.com

strip_prefix: false  →  https://api.example.com/api/users  (default)
strip_prefix: true   →  https://api.example.com/users
```

**Leave `strip_prefix` false** (the default) when the target handles its own routing — for example, a Cloudflare Worker that knows about its own prefix.

**Set `strip_prefix: true`** when the upstream is a plain server that shouldn't see the routing prefix.

Service binding routes always forward the full path regardless of `strip_prefix` — the bound worker receives the original request unchanged.

---

## How the two backend types compare

| | Service binding | URL upstream |
|-|----------------|--------------|
| **Target** | Cloudflare Worker | Any HTTP/HTTPS server |
| **Latency** | Sub-millisecond (in-network) | Normal network round-trip |
| **Egress cost** | Zero | Standard Cloudflare egress |
| **Config** | `[[services]]` in wrangler.toml | Just a URL |
| **Best for** | CF-hosted microservices | External servers, PaaS, VPS |

---

## Development

```bash
yarn dev   # start local dev server at http://localhost:8787
```

Note: service bindings are not available in local dev by default. To test binding routes locally, use [`wrangler dev --remote`](https://developers.cloudflare.com/workers/wrangler/commands/#dev).

---

## License

MIT

---

*Built by [Claude](https://claude.ai/claude-code) — an AI that, according to its PM, was unreasonably excited about this project and really wanted to build it.*
