# Site Editor — setup & how it works

The editor lives at **`/admin/`**. Your non-technical user signs in with a
**passphrase** — no GitHub account, no token, nothing to expire.

```
User types passphrase ──▶ /admin/  ──POST {passphrase, …}──▶ Cloudflare Worker
Worker checks passphrase, then uses its stored GitHub token to read/write index.html
GitHub token NEVER leaves the Worker. User never sees GitHub.
```

You (the maintainer) keep a hidden **GitHub-token** fallback on the same login
screen for direct access.

---

## ✅ One-time setup (you do this once)

You provide **three** things:

| Thing | Where it goes | Secret? |
|---|---|---|
| A **GitHub token** that can write this repo | Worker secret `GITHUB_TOKEN` | **yes — never committed** |
| An **editor passphrase** you invent | Worker secret `EDITOR_PASSPHRASE` | **yes — never committed** |
| The deployed **Worker URL** | `admin/index.html` → `CONFIG.workerUrl` | no (safe to commit) |

### Step 1 — Make a GitHub token for the Worker
Go to `https://github.com/settings/tokens` → **Generate new token (classic)**:
- **Note:** `360rma editor worker`
- **Expiration:** choose **No expiration** (so nothing ever needs renewing — that
  was your requirement). *(If you prefer it locked to just this repo, use a
  fine-grained token with **Contents: Read and write** on `360rma-site` instead —
  but those expire in ≤1 year, so you’d regenerate yearly.)*
- **Scope:** check **`public_repo`**.
- Generate and **copy** the `ghp_…` value.

### Step 2 — Deploy the Worker

**Option A — Cloudflare dashboard (no software to install — recommended)**
1. Go to <https://dash.cloudflare.com> → **Workers & Pages** → **Create** →
   **Create Worker**. Name it `rma-editor`. Click **Deploy** (the placeholder is fine).
2. Click **Edit code**. Delete the sample, paste the entire contents of
   **`worker/src/index.js`** from this repo, then **Deploy**.
3. Open the Worker’s **Settings → Variables**:
   - Under **Variables**, add (plain text):
     - `ALLOWED_ORIGIN` = `https://alexbutson.github.io`
     - `REPO_OWNER` = `alexbutson`
     - `REPO_NAME` = `360rma-site`
     - `REPO_BRANCH` = `main`
     - `REPO_PATH` = `index.html`
   - Under **Secrets** (click **Encrypt**), add:
     - `GITHUB_TOKEN` = your `ghp_…` from Step 1
     - `EDITOR_PASSPHRASE` = the passphrase you’re inventing for the editor
   - **Save and deploy.**
4. Copy the Worker URL shown at the top, e.g. `https://rma-editor.<you>.workers.dev`.

**Option B — wrangler (needs Node installed)**
```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put GITHUB_TOKEN        # paste the ghp_… token
npx wrangler secret put EDITOR_PASSPHRASE   # type your passphrase
npx wrangler deploy                          # prints the Worker URL
```
(Repo coords + `ALLOWED_ORIGIN` come from `wrangler.toml`.)

### Step 3 — Point the editor at the Worker
Edit **`admin/index.html`** → near the top of the `<script>`, set:
```js
workerUrl: "https://rma-editor.<you>.workers.dev",
```
Commit & push.

### Step 4 — Hand it off
Give your user the URL **`https://alexbutson.github.io/360rma-site/admin/`** and
the **passphrase**. That’s all they need. They type it, edit, click
**Review & publish**. The site updates in ~1 minute.

---

## 🔧 Maintainer fallback (you)
On the login screen, **“Maintainer access (GitHub token)”** lets you sign in with
a personal access token and talk to GitHub directly (no Worker involved) — handy
for testing or if the Worker is ever down.

## 🔒 Security notes
- The GitHub token lives **only** in the Worker (encrypted secret) — never in the
  repo or the browser.
- The passphrase is checked on **every** request (constant-time compare, with a
  small delay on failure to slow guessing). **Pick a long passphrase** (e.g. four
  random words) since the Worker is on the public internet.
- Worker CORS is locked to `ALLOWED_ORIGIN`.
- Want a tighter token? Use a **GitHub App** installed only on this repo instead
  of a PAT — narrowest access *and* never expires. Ask and I’ll wire it up.

## 🔁 Changing the passphrase later
Update the `EDITOR_PASSPHRASE` secret (dashboard: Settings → Variables → edit the
secret → Save and deploy; or `npx wrangler secret put EDITOR_PASSPHRASE`). No code
change needed.

## 🌐 If you switch to the custom domain (360rma.com)
1. `admin/index.html` stays the same (relative paths).
2. Worker var `ALLOWED_ORIGIN` → `https://360rma.com` (redeploy).
That’s it — passphrase login has no callback URL to update.

## 🧩 How content editing works (under the hood)
`index.html` has invisible markers around each editable span, e.g.
`<!--e:hero_lede-->…text…<!--/e:hero_lede-->`. They don’t affect the page. The
editor changes **only the text between markers**, so every other byte is preserved
and the change history stays clean. Field list = `FIELDS` in `admin/index.html`.

## 🖼️ Editing images
The editor has an **Images** section to replace the logo and hero photo. Pick a
file, preview it, and publish — it overwrites the file at the same path, so every
place it's used updates automatically. Each image is its own commit.
- Writable image paths are **allow-listed** in the Worker
  (`images/<name>.<png|jpg|jpeg|webp|gif|svg>`) so a leaked passphrase can't write
  arbitrary files.
- To add another editable image, add it to the `IMAGES` list in `admin/index.html`
  (any `images/…` file is already allowed by the Worker).
- **Heads-up:** image support added two new Worker actions, so after pulling this
  change you must **re-paste `worker/src/index.js` into the Cloudflare dashboard
  and Deploy** (Settings/secrets stay as-is).

## ⚠️ Known limitation (this version)
Phone, email, and street address each appear in several places (nav, hero,
contact, footer — and inside `tel:`/`mailto:` links). To avoid partial updates
they’re **not** form fields yet. Edit those directly in `index.html`, or ask to
add properly-synced contact fields.
