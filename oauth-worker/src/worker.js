/**
 * OAuth proxy for Decap CMS at dev.rizzo.cc/acting/admin/.
 *
 * Two endpoints:
 *   GET /auth      → redirect user to GitHub for OAuth consent
 *   GET /callback  → exchange the code for a token, post it back to
 *                    the Decap popup window via postMessage
 *
 * Secrets read from CF env:
 *   GITHUB_CLIENT_ID
 *   GITHUB_CLIENT_SECRET
 *
 * Compatible with Decap CMS's github backend with `base_url` +
 * `auth_endpoint: auth` configuration.
 */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/$/, "");

    if (path === "/auth") return handleAuth(url, env);
    if (path === "/callback") return handleCallback(url, env);

    return new Response("Decap CMS OAuth proxy. See /auth and /callback.", {
      status: 200,
      headers: { "content-type": "text/plain" },
    });
  },
};

function handleAuth(url, env) {
  if (!env.GITHUB_CLIENT_ID) {
    return new Response("Worker not configured: GITHUB_CLIENT_ID missing.", { status: 500 });
  }
  const scope = url.searchParams.get("scope") || "repo,user";
  const state = crypto.randomUUID();
  const redirectUri = `${url.origin}/callback`;

  const authUrl = new URL("https://github.com/login/oauth/authorize");
  authUrl.searchParams.set("client_id", env.GITHUB_CLIENT_ID);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", scope);
  authUrl.searchParams.set("state", state);

  return Response.redirect(authUrl.toString(), 302);
}

async function handleCallback(url, env) {
  const code = url.searchParams.get("code");
  if (!code) return new Response("Missing ?code", { status: 400 });
  if (!env.GITHUB_CLIENT_ID || !env.GITHUB_CLIENT_SECRET) {
    return new Response("Worker not configured: GitHub OAuth secrets missing.", { status: 500 });
  }

  let tokenJson;
  try {
    const tokenResp = await fetch("https://github.com/login/oauth/access_token", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "accept": "application/json",
        "user-agent": "decap-cms-oauth-proxy",
      },
      body: JSON.stringify({
        client_id: env.GITHUB_CLIENT_ID,
        client_secret: env.GITHUB_CLIENT_SECRET,
        code,
      }),
    });
    tokenJson = await tokenResp.json();
  } catch (err) {
    return new Response("Token exchange failed: " + err.message, { status: 502 });
  }

  if (tokenJson.error || !tokenJson.access_token) {
    return new Response(
      "OAuth error from GitHub: " + (tokenJson.error_description || tokenJson.error || "unknown"),
      { status: 400 }
    );
  }

  // Decap's expected postMessage protocol: send "authorizing:github"
  // first, then "authorization:github:success:<json>" when the
  // popup receives the same authorizing message back from Decap.
  const payload = JSON.stringify({ token: tokenJson.access_token, provider: "github" });
  const html = `<!doctype html>
<html><head><meta charset="utf-8"><title>Authorizing&hellip;</title></head>
<body style="font-family:system-ui,sans-serif;padding:24px;background:#2c2e3d;color:#f2f2f2">
<p>Authentication complete. You can close this window.</p>
<script>
(function () {
  function send(msg) { if (window.opener) window.opener.postMessage(msg, '*'); }
  send('authorizing:github');
  window.addEventListener('message', function (e) {
    if (e.data === 'authorizing:github') {
      send('authorization:github:success:' + ${JSON.stringify(payload)});
    }
  });
  // Best-effort fallback in case Decap never echoes 'authorizing'
  setTimeout(function () {
    send('authorization:github:success:' + ${JSON.stringify(payload)});
  }, 600);
})();
</script>
</body></html>`;

  return new Response(html, {
    status: 200,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
