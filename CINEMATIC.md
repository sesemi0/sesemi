# SESEMI cinematic experience

## Architecture

- `src/CinematicHero.tsx`: lazy-loads the scene, preserves the immediate image
  fallback, and handles loading failures and unmounting.
- `src/hero-scene.ts`: Three.js perspective camera, traced logo geometry,
  physical materials, studio environment lighting, procedural terrain, rocks,
  water, shadow-receiving platform and an inexpensive artistic reflection.
- `src/cinematic.css`: scoped public-site tokens and responsive refinements.
  Existing services, forms, FAQ, legal pages and Sesi are retained.
- `public/brand/`: the supplied official artwork with only the connected white
  background removed; white highlights inside the logo are preserved. The
  original PNG is retained, while runtime presentation uses a 68 KB WebP.

The source is attachment `6d4acef9-19a6-49ab-9c3e-2a287cf42b1f`.
Other supplied screenshots informed composition and interface direction; they
are not used as finished website artwork or claimed as client projects.

## What the 3D logo is

The supplied master is a raster image, not a CAD model. Its silhouette is traced
from alpha into an actual beveled extrusion. A tessellated shallow relief carries
the original artwork, keeping its recognizable folds and colors. This is a
dimensional presentation of that artwork, **not an exact reconstruction of the
unknown original sculpture**. A source mesh would allow accurate free viewing
from the back and extreme angles; camera movement is intentionally restrained.

The scene uses real camera and object transforms with frame-rate-independent
damping. Pointer interaction is optional, not an essential control. Native
scroll progress changes camera elevation/distance and logo position without
pinning or consuming scroll events. Existing Lenis handles smooth scrolling.

Water and reflections are art-directed approximations, not ray-traced water.
No bloom, large environment textures or per-frame reflection render is used.

## Performance and accessibility

Three.js is dynamically imported only on the home page. Pixel ratio and terrain
resolution are capped, and mobile shadow rendering is disabled. Rendering pauses
outside the viewport and when the document is hidden. Geometry, materials,
textures, observers, event listeners and the renderer are released on unmount.

Reduced motion disables continuous rendering, idle animation, pointer motion,
camera travel, reveals and marquee movement. The static scene remains responsive
to layout changes. With unavailable WebGL, load failure or context loss, the
official artwork is shown in a CSS-composed atmosphere. All public copy and
navigation remain ordinary HTML outside the canvas.

## Production boundaries

- Contact delivery, owner authentication, CRM persistence, analytics and live AI
  have **not** been connected by this visual update. Existing explicit preview
  and locked states remain. See `INTEGRATIONS.md`.
- Only a clearly labeled studio concept is shown; there are no fabricated
  clients, campaigns, testimonials, metrics or awards.
- Set the actual HTTPS origin in `site.config.json` for production canonicals
  and sitemap generation.
- Google Fonts remain wired through the existing CSS imports. The site falls
  back to sans-serif if they cannot load.
- The existing TypeScript lib declaration is aligned to ES2021 because existing
  components use `String.replaceAll`; no application API was removed.

## Verification

Run the repository production entry point: `pnpm build`.
Type validation: `pnpm exec tsc --noEmit`.

Browser checks should cover 1440, 1024, 768, 390 and 320 pixel widths, actual
camera changes under pointer movement, reduced motion, no-WebGL fallback,
mobile navigation/Escape, FAQ controls, anchor destinations, theme switching
and the contact form's honest unsent preview state.

These checks were exercised in headless Chromium with software WebGL during
implementation. This validates functionality and layout, not frame rates on
physical mobile hardware. The production build reports its standard warning for
the dynamically loaded Three.js scene chunk (approximately 148 KB gzip); this
chunk is separate from the initial application and is not loaded on service,
contact, legal or admin routes.
