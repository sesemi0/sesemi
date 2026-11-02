# SESEMI — Independent Digital & Creative Studio

The SESEMI studio website: a cinematic, interactive single-page app with a real
Three.js 3D hero built around the SESEMI star emblem, plus service pages, a
project brief form, a local studio guide (Sesi), and an owner workspace demo.

## Stack

- React 19 + TypeScript + Vite 8
- Three.js (real-time 3D hero scene, lazy-loaded)
- Lenis (smooth scrolling, disabled under `prefers-reduced-motion`)
- Tailwind CSS 4 (base layer only; the design system lives in `src/*.css`)

## Commands

```bash
npm install     # install dependencies
npm run dev     # dev server at http://localhost:5173
npm run build   # production build + static deep-link pages (dist/)
npm run preview # serve the production build locally
```

`npm run build` also runs `scripts/generate-pages.mjs`, which emits real HTML
files for every route (`/services/*`, `/start`, `/privacy`, `/404`) so the site
works on any static host without server rewrites, plus `robots.txt` and (when
`siteUrl` is set) a sitemap and canonicals.

## Configuration

- `site.config.json` — site title/description and the production `siteUrl`
  (set this before going live to enable canonical URLs, sitemap and OG images).
- `.env` (from `.env.example`) — optional same-origin endpoints:
  - `VITE_CONTACT_ENDPOINT` — receives project brief submissions (POST JSON).
  - `VITE_AGENT_ENDPOINT` — turns the Sesi chat from a local guide into a
    connected assistant.
  - `VITE_ANALYTICS_ENDPOINT` — optional, consent-gated visit analytics.
  - `VITE_ADMIN_API_BASE` — owner workspace API base (server-verified session).
  When an endpoint is empty, the UI stays honest: the brief form prepares a
  copyable draft, and the chat says it is a local guide.

## Structure

- `src/App.tsx` — public site (header, hero, toolkit, services, creative lab,
  process, studio, FAQ, contact, footer).
- `src/hero-scene.ts` — the Three.js hero: traced star geometry from
  `public/brand/sesemi-star.webp`, terrain, water, pointer + scroll camera,
  reduced-motion and WebGL-fallback handling.
- `src/Experience.tsx` — service detail pages (content from `src/services.json`).
- `src/Assistant.tsx` — Sesi chat + project brief form (`QuickContact`).
- `src/Admin.tsx` — demo owner workspace at `/admin` (fictional data unless a
  real admin API is connected).

## Deploy

Any static host works: build, then serve `dist/`. Set `siteUrl` in
`site.config.json` to your HTTPS origin first.

## Backend (contact form delivery)

The form stays in honest preview mode until `VITE_CONTACT_ENDPOINT` points at a
real endpoint. A production-ready implementation ships in this repo:

- `supabase/functions/contact/` — Supabase Edge Function (Deno). Validates the
  payload (name, email, consent, size caps), stores it in the `enquiries`
  table and returns `{ ok: true }` only after durable storage.
- `supabase/migrations/0001_enquiries.sql` — the table it writes to.

Deploy steps:
```bash
supabase link --project-ref <your-ref>
supabase db push                                   # create the enquiries table
supabase functions deploy contact --no-verify-jwt  # public form endpoint
```
Then set the site env `VITE_CONTACT_ENDPOINT=https://<ref>.supabase.co/functions/v1/contact`
(and optionally `ALLOWED_ORIGINS=https://yourdomain` in the function secrets).

### Test delivery locally (no deploy needed)
```bash
node scripts/dev-backend.mjs                                            # terminal 1
VITE_CONTACT_ENDPOINT=http://localhost:8787/api/contact npm run dev     # terminal 2
```
Submit the form — the button now reads "Send my brief", the success state
shows after real delivery, and the enquiry is logged to `data/dev-enquiries.json`.
