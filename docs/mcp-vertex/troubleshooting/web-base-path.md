---
slug: web-base-path
symptom: "The web site builds fine but every internal link is broken in dev (`astro dev`), or conversely every internal link 404s once deployed to GitHub Pages — never both at once."
cause: "`apps/web/astro.config.mjs` resolves `base` from `process.env.PAGES_BASE`, defaulting to `/mcp-vertex` for the GitHub Pages project-site deployment. Local dev scripts export `PAGES_BASE=''` so links resolve from the root during `astro dev`/`astro preview`. If a script or CI step builds without that override (or a custom deploy target uses a different sub-path), every `${base}/...` link in the codebase silently points at the wrong prefix — the symptom is path-shaped, not content-shaped: pages render, but every `<a href>` lands one segment off."
fix: "For local dev, always go through `bun run dev`/`bun run preview` (already wire `PAGES_BASE=''`) — never call `astro dev` directly without the env var. For a deploy target other than the default GitHub Pages project site (e.g. a user/root-level Pages site, or a custom domain), set `PAGES_BASE=''` (root) or `PAGES_BASE=/your-prefix` explicitly in that environment's build step, matching where the site is actually served from."
tags: [web, astro, deploy]
closedBy: "B4 / x00004 web bugfixes — dev API base path"
---

The fastest diagnostic: open any page and hover a nav link. If the URL shown
has `/mcp-vertex` prefixed in dev (where it shouldn't), or is missing it in
the deployed GitHub Pages build (where it should be there), `PAGES_BASE` is
the first thing to check — before touching any page or component code.
