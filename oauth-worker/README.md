# OAuth proxy for Decap CMS

Cloudflare Worker that bridges Decap CMS to GitHub&rsquo;s OAuth flow.
Required because GitHub OAuth needs a server-side step (the client
secret can&rsquo;t be embedded in browser JS).

## Setup

```
cd oauth-worker
npx wrangler login        # first time only
npx wrangler deploy
```

Wrangler prints the deployed URL (e.g.
`https://acting-oauth.&lt;your-subdomain&gt;.workers.dev`). Two things to
do with that URL:

1. Use `<URL>/callback` as the GitHub OAuth App&rsquo;s authorization
   callback URL.
2. Paste `<URL>` into `acting/admin/config.yml` as the `base_url`.

Then set the OAuth secrets and redeploy:

```
npx wrangler secret put GITHUB_CLIENT_ID
npx wrangler secret put GITHUB_CLIENT_SECRET
npx wrangler deploy
```

## How it works

| Endpoint | Behavior |
|---|---|
| `GET /auth` | Redirects the user to `github.com/login/oauth/authorize` with the configured client id and scope (`repo,user`). |
| `GET /callback` | Receives the GitHub authorization code, exchanges it for an access token, and returns an HTML page that posts the token back to the Decap popup&rsquo;s opener via `window.postMessage`. |

Tokens are never stored on Cloudflare &mdash; the Worker is stateless.
Decap holds the token in the user&rsquo;s browser `localStorage`.
