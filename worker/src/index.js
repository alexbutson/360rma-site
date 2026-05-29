/**
 * Passphrase-gated GitHub proxy for the 360rma-site admin editor.
 *
 * The non-technical user logs in with a PASSPHRASE (no GitHub account needed).
 * This Worker verifies the passphrase, then reads/writes files on their behalf
 * using a GitHub token that lives ONLY here — it never reaches the browser.
 *
 * Secrets (set with `wrangler secret put …`, or in the Cloudflare dashboard):
 *   GITHUB_TOKEN       repo token (classic PAT w/ `public_repo`, "No expiration"
 *                      recommended; or fine-grained w/ Contents:Read&Write)
 *   EDITOR_PASSPHRASE  the passphrase you give the editor
 *
 * Vars (wrangler.toml or dashboard, NOT secret):
 *   ALLOWED_ORIGIN  e.g. https://alexbutson.github.io  (only origin served)
 *   REPO_OWNER, REPO_NAME, REPO_BRANCH, REPO_PATH
 *
 * Protocol (POST JSON to this Worker):
 *   { action:"load", passphrase }                                  -> { content, sha }       (index.html text)
 *   { action:"save", passphrase, content, sha, message }            -> { commit_sha, content_sha }
 *   { action:"filemeta", passphrase, path }                         -> { sha }  (sha:null if file is new)
 *   { action:"filesave", passphrase, path, content_base64, sha?, message } -> { commit_sha, content_sha }
 * Wrong passphrase -> 401. Disallowed path -> 403. Edit conflict -> 409.
 *
 * Writable paths are allow-listed (index.html + images/<name>.<ext>) so a leaked
 * passphrase can't be used to write arbitrary files or traverse the repo.
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";
    const cors = corsHeaders(origin, allowed);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);
    if (allowed && origin !== allowed) return json({ error: "forbidden_origin", origin }, 403, cors);

    let body;
    try { body = await request.json(); }
    catch { return json({ error: "bad_request" }, 400, cors); }

    const expected = env.EDITOR_PASSPHRASE || "";
    const token = env.GITHUB_TOKEN || "";
    if (!expected || !token) return json({ error: "server_not_configured" }, 500, cors);

    if (!constantEq(String(body.passphrase || ""), expected)) {
      await sleep(300);
      return json({ error: "unauthorized" }, 401, cors);
    }

    const owner  = env.REPO_OWNER  || "alexbutson";
    const repo   = env.REPO_NAME   || "360rma-site";
    const branch = env.REPO_BRANCH || "main";
    const repoPath = env.REPO_PATH || "index.html";
    const ghHeaders = {
      "Accept": "application/vnd.github+json",
      "Authorization": "token " + token,
      "User-Agent": "rma-editor-worker",
      "X-GitHub-Api-Version": "2022-11-28",
    };
    // Per-segment encode so subfolders keep their "/".
    const contentsUrl = p => `https://api.github.com/repos/${owner}/${repo}/contents/${p.split("/").map(encodeURIComponent).join("/")}`;

    try {
      if (body.action === "load") {
        const r = await fetch(`${contentsUrl(repoPath)}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders });
        if (!r.ok) return json({ error: "github_error", status: r.status }, 502, cors);
        const data = await r.json();
        return json({ content: b64ToUtf8(data.content), sha: data.sha }, 200, cors);
      }

      if (body.action === "save") {
        if (typeof body.content !== "string" || !body.sha) return json({ error: "bad_request" }, 400, cors);
        const r = await fetch(contentsUrl(repoPath), {
          method: "PUT",
          headers: { ...ghHeaders, "Content-Type": "application/json" },
          body: JSON.stringify({
            message: String(body.message || "Update site content via editor"),
            content: utf8ToB64(body.content),
            sha: body.sha,
            branch,
          }),
        });
        if (r.status === 409 || r.status === 422) return json({ error: "conflict" }, 409, cors);
        if (!r.ok) { const e = await r.json().catch(() => ({})); return json({ error: "github_error", status: r.status, detail: e.message }, 502, cors); }
        const data = await r.json();
        return json({ commit_sha: data.commit.sha, content_sha: data.content.sha }, 200, cors);
      }

      // ---- generic file ops (used for images), path allow-listed ----
      if (body.action === "filemeta") {
        if (!isAllowedPath(body.path, repoPath)) return json({ error: "forbidden_path" }, 403, cors);
        const r = await fetch(`${contentsUrl(body.path)}?ref=${encodeURIComponent(branch)}`, { headers: ghHeaders });
        if (r.status === 404) return json({ sha: null }, 200, cors);   // new file
        if (!r.ok) return json({ error: "github_error", status: r.status }, 502, cors);
        const d = await r.json();
        return json({ sha: d.sha }, 200, cors);
      }

      if (body.action === "filesave") {
        if (!isAllowedPath(body.path, repoPath)) return json({ error: "forbidden_path" }, 403, cors);
        if (typeof body.content_base64 !== "string") return json({ error: "bad_request" }, 400, cors);
        const payload = {
          message: String(body.message || "Update file via editor"),
          content: body.content_base64.replace(/\s/g, ""),
          branch,
        };
        if (body.sha) payload.sha = body.sha;   // omit to create a new file
        const r = await fetch(contentsUrl(body.path), {
          method: "PUT",
          headers: { ...ghHeaders, "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        if (r.status === 409 || r.status === 422) return json({ error: "conflict" }, 409, cors);
        if (!r.ok) { const e = await r.json().catch(() => ({})); return json({ error: "github_error", status: r.status, detail: e.message }, 502, cors); }
        const d = await r.json();
        return json({ commit_sha: d.commit.sha, content_sha: d.content.sha }, 200, cors);
      }
    } catch (e) {
      return json({ error: "proxy_error", detail: e.message }, 502, cors);
    }

    return json({ error: "unknown_action" }, 400, cors);
  },
};

/* ---------- helpers ---------- */
function isAllowedPath(p, repoPath) {
  if (typeof p !== "string" || p.includes("..") || p.startsWith("/")) return false;
  if (p === repoPath) return true;
  return /^images\/[A-Za-z0-9._-]+\.(png|jpe?g|webp|gif|svg)$/i.test(p);
}
function corsHeaders(origin, allowed) {
  const h = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (allowed) { if (origin === allowed) h["Access-Control-Allow-Origin"] = allowed; }
  else h["Access-Control-Allow-Origin"] = origin || "*";
  return h;
}
function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json", ...cors } });
}
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function constantEq(a, b) {
  const ea = new TextEncoder().encode(a), eb = new TextEncoder().encode(b);
  if (ea.length !== eb.length) return false;
  let diff = 0;
  for (let i = 0; i < ea.length; i++) diff |= ea[i] ^ eb[i];
  return diff === 0;
}
function utf8ToB64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = "", chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk));
  return btoa(bin);
}
function b64ToUtf8(b64) {
  const bin = atob(String(b64).replace(/\s/g, ""));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}
