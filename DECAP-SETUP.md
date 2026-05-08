# Decap CMS Setup for rizzo.cc

End state: visit `https://rizzo.cc/admin/`, log in with your `yada-yoda`
GitHub account, edit content via web forms, hit save &mdash; the site
rebuilds and updates within ~60 seconds.

This doc walks through the setup. **Read it top to bottom before
starting**, then execute the &ldquo;Your steps&rdquo; sections in order.

---

## Architecture

```
┌────────────────────────┐
│ rizzo.cc/admin/        │  Decap CMS UI (HTML + JS, no server)
│   index.html           │  Loaded from CDN, configured via:
│   config.yml           │  collection schema (what fields, what files)
└──────────┬─────────────┘
           │ Login: redirects to OAuth proxy
           ▼
┌────────────────────────┐
│ Cloudflare Worker      │  Tiny OAuth proxy. ~50 lines of JS.
│ (rizzo-oauth.*)        │  Holds the OAuth client secret.
│                        │  Forwards user to GitHub, exchanges
│                        │  the auth code for a token.
└──────────┬─────────────┘
           │ Token returned to Decap
           ▼
┌────────────────────────┐
│ Decap commits to GitHub via API:
│   /data/bio.md         │  Plain Markdown
│   /data/credits.yml    │  Film/TV/Theater credit lists
│   /data/training.yml   │  Training entries
└──────────┬─────────────┘
           │ Commit triggers GitHub Action
           ▼
┌────────────────────────┐
│ Build script           │  Reads YAML/Markdown
│ (Python)               │  Regenerates index.html with content
│                        │  baked in (preserves SEO)
└──────────┬─────────────┘
           │ Action commits the rebuilt index.html
           ▼
       GH Pages serves the live site
```

---

## Decisions made (you can override)

| Decision | Choice | Why |
|---|---|---|
| **GitHub host account** | `yada-yoda` | You chose this. Pairs with Waiter Boys repo. |
| **Repo name** | `rizzo` | Cleaner than `acting` for direct GitHub visits |
| **OAuth proxy** | Cloudflare Worker | You already use CF Workers (stocks-worker, usage-worker). Free tier, no leak surface. |
| **Build approach** | GitHub Action regenerates `index.html` | Keeps SEO-friendly static HTML. JS-rendered content is a real SEO regression we just spent v0.5.0 fixing. |
| **Content fields managed by Decap** | Bio, Film/TV/Theater credits, Training | The most-frequently-changed items. Hero quotes, socials, skills stay in Option B (HTML markers) since they rarely change. |

If you want to override any of these, tell me before we start and I&rsquo;ll
adjust the plan.

---

## Phase 1 &mdash; What I&rsquo;ll do (no input from you needed)

When you say &ldquo;go,&rdquo; I&rsquo;ll commit these changes in stages:

1. **Extract content to structured files**
   - `/data/bio.md` &mdash; the centered bio paragraph
   - `/data/credits.yml` &mdash; Film, TV, Theater credit lists with all fields
   - `/data/training.yml` &mdash; Training entries
2. **Build script** (`/scripts/build-content.py`)
   - Reads the YAML/MD files
   - Regenerates `index.html` (between the existing `<!-- EDIT: ... -->` markers)
   - Also regenerates the JSON-LD Movie nodes from credits.yml
3. **Decap admin page**
   - `/admin/index.html` &mdash; loads Decap from CDN
   - `/admin/config.yml` &mdash; collection schema for the three content files
4. **OAuth proxy Worker** (`/oauth-worker/`)
   - `wrangler.toml` &mdash; Cloudflare Worker config
   - `src/worker.js` &mdash; the OAuth flow (auth redirect + code exchange)
5. **GitHub Action** (`.github/workflows/build.yml`)
   - Runs on every push that touches `/data/`
   - Runs the build script
   - Commits the rebuilt `index.html`

After Phase 1, the *code* is in place. The system isn&rsquo;t live until
Phase 2 (your steps) is complete.

---

## Phase 2 &mdash; Your steps (in order)

### Step A: Deploy the OAuth proxy first

Why first: the OAuth App needs to know the proxy URL. The proxy URL
exists only after you deploy it. Chicken-and-egg, so we deploy a
placeholder Worker first to get the URL, then create the OAuth App.

1. Open a terminal in `T:\ClaudeCodeRepo\acting\oauth-worker\`
2. Make sure you&rsquo;re logged into the right Cloudflare account:
   ```
   npx wrangler whoami
   ```
   You should see your CF account. If not: `npx wrangler login`
3. Deploy:
   ```
   npx wrangler deploy
   ```
4. Copy the deployed URL it prints. Will look like:
   `https://rizzo-oauth.<your-subdomain>.workers.dev`
5. **Save this URL somewhere.** You&rsquo;ll paste it in Step B and Step E.

### Step B: Create GitHub OAuth App on yada-yoda

1. Sign in to GitHub as **yada-yoda**
2. Click your avatar (top-right) &rarr; **Settings**
3. Left sidebar &rarr; **Developer settings** (very bottom)
4. **OAuth Apps** &rarr; **New OAuth App**
5. Fill in:
   | Field | Value |
   |---|---|
   | Application name | `Rizzo.cc CMS` |
   | Homepage URL | `https://rizzo.cc` |
   | Application description | `Decap CMS for rizzo.cc` (optional) |
   | Authorization callback URL | `https://rizzo-oauth.<your-subdomain>.workers.dev/callback` (the Worker URL from Step A + `/callback`) |
6. Click **Register application**
7. On the next page:
   - Copy the **Client ID** (visible immediately)
   - Click **Generate a new client secret**
   - Copy the **Client Secret** (only shown once &mdash; if you lose it, regenerate)

Keep both values handy for Step C. **Don&rsquo;t paste them anywhere
public** &mdash; not in the repo, not in chat, not in commits.

### Step C: Set the OAuth credentials as Worker secrets

These are stored encrypted on Cloudflare; the Worker reads them at
runtime. They never appear in the repo.

1. In `T:\ClaudeCodeRepo\acting\oauth-worker\`:
   ```
   npx wrangler secret put GITHUB_CLIENT_ID
   ```
   Paste the Client ID from Step B when prompted, hit Enter.
2. Then:
   ```
   npx wrangler secret put GITHUB_CLIENT_SECRET
   ```
   Paste the Client Secret, hit Enter.
3. Redeploy so the Worker picks up the new secrets:
   ```
   npx wrangler deploy
   ```

### Step D: Push the repo to yada-yoda

1. Switch to the right account:
   ```
   gh auth switch -u yada-yoda
   ```
2. Create the repo and push:
   ```
   gh repo create yada-yoda/rizzo --public \
     --description "Rizzo.cc - Frank Rizzo, actor portfolio" \
     --source=. --push
   ```

### Step E: Enable GitHub Pages with custom domain

1. Browse to `https://github.com/yada-yoda/rizzo/settings/pages`
2. **Source**: Deploy from a branch &rarr; `main` &rarr; `/ (root)`
3. **Custom domain**: `rizzo.cc` (it will auto-fill if the `CNAME`
   file is in the repo). I&rsquo;ll add `CNAME` containing `rizzo.cc` as
   part of Phase 1.
4. **Save**.
5. Wait for the DNS check (usually 1&ndash;5 min). Once green, tick
   **Enforce HTTPS** (cert provisioning takes another ~10 min).

### Step F: Update Namecheap DNS

This is the existing rizzo.cc apex going to GitHub Pages. (You may
already have this if rizzo.cc currently points at the WordPress
install &mdash; if so, this is the swap.)

In Namecheap &rarr; Domain List &rarr; rizzo.cc &rarr; Manage &rarr;
**Advanced DNS**:

| Type | Host | Value |
|---|---|---|
| A Record | `@` | `185.199.108.153` |
| A Record | `@` | `185.199.109.153` |
| A Record | `@` | `185.199.110.153` |
| A Record | `@` | `185.199.111.153` |
| CNAME | `www` | `yada-yoda.github.io.` |

Delete any old `A`/`CNAME` records pointing at the franktrades WP host.

---

## Phase 3 &mdash; Together (test)

1. Wait ~10 minutes for DNS + cert provisioning
2. Visit `https://rizzo.cc/admin/`
3. Click **Login with GitHub**
4. Approve the OAuth App on the redirect
5. You should see the CMS dashboard with collections: Bio,
   Credits, Training
6. Open Bio, change a word, hit Publish
7. Watch the GitHub Action run (~30 sec) at
   `https://github.com/yada-yoda/rizzo/actions`
8. Reload `https://rizzo.cc/` &mdash; the change is live

If anything misbehaves at this stage, message me and I&rsquo;ll debug.

---

## Maintenance / FAQ

**Do I need to keep paying for the Worker?**
No. Cloudflare Workers free tier covers 100k requests/day. Your CMS
will use ~10 requests per editing session. You&rsquo;ll never exceed it.

**What if I lose my OAuth Client Secret?**
GitHub OAuth Apps &rarr; your app &rarr; Generate a new client secret.
Then redo Step C with the new value.

**What if Decap stops working / I&rsquo;m locked out?**
You can always edit content directly in GitHub web UI using the
`<!-- EDIT: ... -->` markers from `EDITING.md`. Decap is a convenience
layer; it never replaces git.

**Will Decap commits leak my Google profile like Empire?**
No. We&rsquo;re using a custom GitHub OAuth App, not Decap Bridge.
Commits are made via the GitHub API as the `yada-yoda` GitHub user.
No Google involvement at all.

**How do I edit the OAuth proxy code later?**
Edit `oauth-worker/src/worker.js`, then `npx wrangler deploy` from
that directory.

**How long do I stay logged in to /admin/?**
Decap stores the access token in browser localStorage. It doesn&rsquo;t
expire (legacy GitHub OAuth tokens never expire). You log in once and
stay logged in until you click logout or clear browser data.

---

## Status

- [ ] Phase 1: Code &amp; config files (I do this)
- [ ] Step A: Deploy placeholder Worker (you)
- [ ] Step B: Create GitHub OAuth App (you)
- [ ] Step C: Set Worker secrets (you)
- [ ] Step D: Push repo to yada-yoda (you)
- [ ] Step E: Enable GitHub Pages (you)
- [ ] Step F: Update Namecheap DNS (you)
- [ ] Phase 3: End-to-end test (together)

When you&rsquo;re ready for me to start Phase 1, just say &ldquo;go.&rdquo; I&rsquo;ll
ship it as v0.5.8.
