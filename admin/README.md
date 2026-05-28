# Site Editor — setup & how it works

The admin editor lives at **`/admin/`** and lets a non-technical user update the
words on the homepage with a one-click **“Log in with GitHub”** — nothing to
expire, paste, or regenerate.

```
Browser ──"Log in with GitHub"──▶ GitHub authorize
GitHub ──redirect ?code──▶ /admin/  ──POST {code}──▶ Cloudflare Worker
Worker ──code + CLIENT_SECRET──▶ GitHub  ──access_token──▶ Worker ──▶ browser
browser stores token in sessionStorage ──▶ existing editor (fetch + edit + publish index.html)
```

The **client secret never touches the browser** — it lives only in the Worker.
The access token is **non-expiring** (we never enable token expiration), so a
returning user just clicks “Log in with GitHub” again.

---

## ✅ What YOU must set up (one time)

You need to provide exactly **three** things:

| Thing | Where it goes |
|---|---|
| GitHub OAuth App **Client ID** | `wrangler.toml` + `admin/index.html` (public, OK to commit) |
| GitHub OAuth App **Client Secret** | `wrangler secret put` only — **never committed** |
| **Callback URL** `https://alexbutson.github.io/360rma-site/admin/` | registered on the OAuth App |

### 1. Create the GitHub OAuth App
GitHub → **Settings → Developer settings → OAuth Apps → New OAuth App**

- **Application name:** `360rma Site Editor` (anything)
- **Homepage URL:** `https://alexbutson.github.io/360rma-site/admin/`
- **Authorization callback URL:** `https://alexbutson.github.io/360rma-site/admin/`
  *(must match exactly — trailing slash included)*
- **Leave “Expire user authorization tokens” UNCHECKED** → keeps the token
  non-expiring. (If GitHub doesn’t show the option, non-expiring is already the
  default. Do **not** opt into expiring tokens.)

Click **Register application**, then:
- copy the **Client ID**
- click **Generate a new client secret** and copy it (shown only once)

### 2. Deploy the Cloudflare Worker
```bash
cd worker
npm install
npx wrangler login            # first time only

# put your Client ID (public) into wrangler.toml -> GITHUB_CLIENT_ID
# then store the SECRET (encrypted, never written to disk in the repo):
npx wrangler secret put GITHUB_CLIENT_SECRET   # paste the client secret

npx wrangler deploy           # prints https://rma-oauth.<your-subdomain>.workers.dev
```
Confirm `ALLOWED_ORIGIN = "https://alexbutson.github.io"` in `wrangler.toml`.

### 3. Point the admin page at your IDs
Edit **`admin/index.html`** → the `CONFIG` block near the top of the `<script>`:
```js
clientId:  "<paste your GitHub OAuth App Client ID>",
workerUrl: "<paste your deployed Worker URL>",
```
Commit & push.

### 4. Test
Visit `https://alexbutson.github.io/360rma-site/admin/` → **Log in with GitHub**
→ authorize → the editor loads. Edit a field → **Review & publish** → the site
updates in ~1 minute.

---

## 🔧 Maintainer fallback (works right now, no setup)

On the login screen, **“Maintainer access”** (collapsed) accepts a Personal
Access Token. This path is hidden from the everyday user but always available to
you — and it works **before** you’ve done any OAuth setup, so you can test the
whole editor immediately.

- **Fine-grained PAT:** Repository access → *360rma-site*, Permissions →
  **Contents: Read and write**.
- **Classic PAT:** scope **`public_repo`**.
- “Remember on this device” stores it in `localStorage`; otherwise it’s
  `sessionStorage` (gone when the tab closes).

The PAT code path is unchanged from the original editor — OAuth is just the new
default for the non-technical user.

---

## 🔒 Security notes
- Client secret: **only** in the Worker (`wrangler secret put`), never in the repo or browser.
- OAuth token: stored in **sessionStorage** only (cleared when the tab closes).
- Worker CORS is locked to `ALLOWED_ORIGIN`; it rejects requests from other origins.
- Scope is **`public_repo`** (this repo is public — the narrowest scope that can write content). If the repo ever becomes private, change the scope to `repo` in `admin/index.html` and re-authorize.

## 🌐 If you switch to the custom domain (360rma.com)
Update all three to `https://360rma.com/admin/`:
1. OAuth App **Authorization callback URL**
2. `admin/index.html` → `CONFIG.redirectUri`
3. `worker/wrangler.toml` → `ALLOWED_ORIGIN` = `https://360rma.com` (then `wrangler deploy`)

## 🧩 How content editing works (under the hood)
`index.html` contains invisible markers around each editable span, e.g.
`<!--e:hero_lede-->…text…<!--/e:hero_lede-->`. They don’t affect the rendered
page. The editor reads/writes **only the text between markers**, so every other
byte of `index.html` is preserved and the change history stays clean. The field
list lives in `FIELDS` inside `admin/index.html`.

## ⚠️ Known limitation (this version)
Phone number, email address, and street address each appear in **several** places
(nav, hero, contact, footer — and inside `tel:`/`mailto:` links with different
formatting). To avoid partial/inconsistent updates they are **not** form fields
yet. Edit those directly in `index.html`, or ask to add properly-synced contact
fields as a follow-up.
