/**
 * GitHub OAuth code -> token exchange Worker for the 360rma-site admin editor.
 *
 * Why this exists: the OAuth "code for token" exchange requires the OAuth App's
 * CLIENT SECRET. That secret must never appear in browser JavaScript, so the
 * browser sends us the short-lived `code` and we do the exchange server-side.
 *
 * Secrets / config (set outside this file — see wrangler.toml):
 *   env.GITHUB_CLIENT_ID      (var)    public Client ID
 *   env.GITHUB_CLIENT_SECRET  (secret) `wrangler secret put GITHUB_CLIENT_SECRET`
 *   env.ALLOWED_ORIGIN        (var)    e.g. https://alexbutson.github.io
 *
 * NOTE ON TOKEN EXPIRATION: this Worker returns whatever GitHub issues. As long
 * as the OAuth App does NOT have "Expire user authorization tokens" enabled,
 * GitHub issues a NON-EXPIRING access token (no refresh token, no expires_in).
 * That is the intended behavior here — a returning user just logs in again.
 */

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowed = env.ALLOWED_ORIGIN || "";
    const cors = corsHeaders(origin, allowed);

    // CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors });
    }

    if (request.method !== "POST") {
      return json({ error: "method_not_allowed" }, 405, cors);
    }

    // Only serve the configured admin origin.
    if (allowed && origin !== allowed) {
      return json({ error: "forbidden_origin", origin }, 403, cors);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ error: "bad_request", detail: "expected JSON body" }, 400, cors);
    }

    const code = body && body.code;
    if (!code) {
      return json({ error: "missing_code" }, 400, cors);
    }

    const clientId = env.GITHUB_CLIENT_ID;
    const clientSecret = env.GITHUB_CLIENT_SECRET;
    if (!clientId || !clientSecret || String(clientId).startsWith("TODO")) {
      // Misconfiguration — the maintainer hasn't set the ID/secret yet.
      return json({ error: "server_not_configured" }, 500, cors);
    }

    // Exchange the code with GitHub. The secret stays on the server.
    let ghResp;
    try {
      ghResp = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: {
          "Accept": "application/json",
          "Content-Type": "application/json",
          "User-Agent": "rma-oauth-worker",
        },
        body: JSON.stringify({
          client_id: clientId,
          client_secret: clientSecret,
          code,
          // redirect_uri must match the value used in the authorize step.
          redirect_uri: body.redirect_uri || undefined,
        }),
      });
    } catch (e) {
      return json({ error: "github_unreachable" }, 502, cors);
    }

    let data;
    try {
      data = await ghResp.json();
    } catch {
      return json({ error: "github_bad_response" }, 502, cors);
    }

    if (data.error) {
      // e.g. bad_verification_code, redirect_uri_mismatch
      return json(
        { error: data.error, error_description: data.error_description },
        400,
        cors
      );
    }

    // Return ONLY what the browser needs. Never leak the client secret.
    return json(
      {
        access_token: data.access_token,
        token_type: data.token_type,
        scope: data.scope,
      },
      200,
      cors
    );
  },
};

function corsHeaders(origin, allowed) {
  const h = {
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    "Vary": "Origin",
  };
  if (allowed) {
    // Reflect only the allowed origin.
    if (origin === allowed) h["Access-Control-Allow-Origin"] = allowed;
  } else {
    // No allow-list configured: fall back to the requesting origin.
    h["Access-Control-Allow-Origin"] = origin || "*";
  }
  return h;
}

function json(obj, status, cors) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json", ...cors },
  });
}
