# 360 Risk Management Associates — Website

A modern, single-page rebuild of 360rma.com. Static HTML + CSS + a tiny bit of JavaScript — no build step, no dependencies. Drop it on any host.

## Files

```
index.html          ← the entire site
images/
  logo.png          ← header + footer logo
  hero-bg.jpg       ← hero image
admin/              ← passphrase-protected content editor (see admin/README.md)
worker/             ← Cloudflare Worker that the editor saves through
```

## Deploy to GitHub Pages (free)

1. Create a new public repo on GitHub, e.g. `360rma-site`.
2. Upload all files from this folder (keep the `images/` folder structure).
3. In the repo: **Settings → Pages → Source: Deploy from branch → Branch: main / root → Save**.
4. After ~1 minute, your site is live at `https://<your-username>.github.io/360rma-site/`.

## Point 360rma.com to it

Once the GitHub Pages URL works:

1. In the repo: **Settings → Pages → Custom domain** → enter `360rma.com` → Save.
2. At your DNS host (Cloudflare is free and easy), add these records for `360rma.com`:

   | Type  | Name | Value                  |
   |-------|------|------------------------|
   | A     | @    | 185.199.108.153        |
   | A     | @    | 185.199.109.153        |
   | A     | @    | 185.199.110.153        |
   | A     | @    | 185.199.111.153        |
   | CNAME | www  | <your-username>.github.io |

3. Back on GitHub Pages, enable **Enforce HTTPS** once the cert provisions (a few minutes).

## The contact form

The form posts to **Formspree** (free for 50 submissions/month). To activate it:

1. Sign up at https://formspree.io with `bobj@360rma.com`.
2. Create a new form, copy the form ID.
3. In `index.html`, find `YOUR_FORM_ID` and replace it with the real ID.

If Formspree isn't wanted, swap the form for a `mailto:` link instead — happy to do that if you ask.

## Editing content

Two ways:

1. **Admin editor (recommended for non-technical edits)** — go to `/admin/`, enter
   the **passphrase**, edit the form fields, and publish. No GitHub account needed
   for the editor. One-time setup (a Cloudflare Worker holds the GitHub token) is
   documented in **[`admin/README.md`](admin/README.md)**.
2. **Directly** — all text lives in `index.html`; search for what you want to
   change, edit it, save, push. No CMS, no rebuild step.
