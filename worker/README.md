# rma-editor — Cloudflare Worker

Passphrase-gated proxy for the `/admin/` editor. Verifies the editor passphrase,
then reads/writes `index.html` via the GitHub Contents API using a token that
**never leaves the Worker**.

## Protocol
`POST /` with JSON:
- `{ "action":"load", "passphrase":"…" }` → `{ content, sha }`
- `{ "action":"save", "passphrase":"…", "content":"…", "sha":"…", "message":"…" }` → `{ commit_sha, content_sha }`

Wrong passphrase → `401`. Edit conflict (stale `sha`) → `409`.

## Config
| Name | Type | Notes |
|---|---|---|
| `GITHUB_TOKEN` | **secret** | repo write token (kept server-side only) |
| `EDITOR_PASSPHRASE` | **secret** | the passphrase you give the editor |
| `ALLOWED_ORIGIN` | var | e.g. `https://alexbutson.github.io` |
| `REPO_OWNER`/`REPO_NAME`/`REPO_BRANCH`/`REPO_PATH` | var | which file to edit |

## Deploy
- **No Node?** Use the Cloudflare dashboard — paste `src/index.js`, add the vars +
  secrets in **Settings → Variables**. Full walkthrough in **`../admin/README.md`**.
- **With Node:**
  ```bash
  npm install
  npx wrangler login
  npx wrangler secret put GITHUB_TOKEN
  npx wrangler secret put EDITOR_PASSPHRASE
  npx wrangler deploy
  ```

Then paste the printed Worker URL into `admin/index.html` → `CONFIG.workerUrl`.
