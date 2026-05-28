# rma-oauth — Cloudflare Worker

Does the GitHub OAuth **code → access-token** exchange for the `/admin/` editor,
so the OAuth **client secret never ships to the browser**.

## Deploy
```bash
npm install
npx wrangler login                              # first time only
# 1) set your public Client ID in wrangler.toml -> GITHUB_CLIENT_ID
# 2) store the secret (encrypted; never committed):
npx wrangler secret put GITHUB_CLIENT_SECRET
# 3) deploy:
npx wrangler deploy                             # -> https://rma-oauth.<subdomain>.workers.dev
```
Then paste the printed URL into `admin/index.html` → `CONFIG.workerUrl`.

## Local dev
```bash
npx wrangler dev      # also needs the secret: npx wrangler secret put ... (or a .dev.vars file you do NOT commit)
```

## Config (see `wrangler.toml`)
| Name | Type | Notes |
|---|---|---|
| `ALLOWED_ORIGIN` | var | e.g. `https://alexbutson.github.io` — only this origin is served |
| `GITHUB_CLIENT_ID` | var | public Client ID |
| `GITHUB_CLIENT_SECRET` | **secret** | `wrangler secret put GITHUB_CLIENT_SECRET` — never in the repo |

## Contract
`POST /` with JSON `{ "code": "...", "redirect_uri": "https://alexbutson.github.io/360rma-site/admin/" }`
→ `{ "access_token": "...", "token_type": "bearer", "scope": "public_repo" }`

Full end-to-end setup (OAuth App, callback URL, etc.): see **`../admin/README.md`**.
