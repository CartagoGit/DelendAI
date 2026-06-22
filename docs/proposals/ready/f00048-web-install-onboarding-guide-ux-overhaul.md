---
id: f00048
status: ready
type: proposal
track: web+ui+i18n
date: 2026-06-22
kind: feat
title: Web install + onboarding + guide UX overhaul (shared UI primitives, real tab transitions, 12-language i18n)
shipped-in: []
related:
    - f00047
    - f00043
    - l030
    - l105
globalGate: lint
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run lint:scss, expect: exit0 }
    - { command: bun run check:i18n, expect: exit0 }
    - { command: bun run build, expect: exit0 }
---

# f00048 — Web install + onboarding + guide UX overhaul

## goal

Make the install, first-5-minutes and guide pages consistent, rich and
demo-quality. Right now they look like three different sites: install has
two ad-hoc tab strips, first-5-minutes borrows the plugin-page tabs and
its steps are plain text, guide is a single long page with a manually
listed sidebar and no section identity. The reader cannot tell these three
pages share a product.

This proposal:

1. Extracts a small `ui/` component kit so every page renders code,
   tabs, callouts, steps and copy-to-clipboard in the same shape.
2. Rewrites the install page so changing a tab actually transitions
   (cross-fade + slide) and every (package manager × IDE) cell shows a
   real config snippet, plus a "what plugins do I get?" matrix and a
   pointer to `init`/`--check`/`--exclude-plugins`.
3. Rewrites first-5-minutes so each profile is a tab with the same
   transition as install, with copyable code blocks and a "next step"
   rail at the bottom.
4. Rewrites guide into a true wiki: sticky TOC, anchored sections,
   shared `Callout`/`Stepper` blocks, and consistent headings.
5. Keeps i18n complete: every new string ships in all 12 languages and
   the gate (`check-i18n`) stays green.

## why

- The install page is the highest-traffic surface — it is where users
  decide whether to commit. Today it shows two generic tabs and a raw
  JSON dump; it does not explain which preset to pick, what plugins
  ship with each preset, or how to exclude one.
- First-5-minutes and install share a tab pattern but each implements it
  in place. Repeating the same `<script>` twice means future fixes have
  to be applied in both.
- The guide page renders correctly but reads like a flat Markdown dump.
  No code blocks, no callouts, no progress indicator for the reader.
- The i18n gate currently passes because the existing copy is complete.
  The moment new copy is added without translating to all 12 languages,
  the gate goes red. To prevent silent drift, this proposal adds the
  new copy in all 12 languages at once and tightens the gate to warn
  loudly if a future slice skips a language.

## what ships

### UI primitives (`apps/web/src/components/ui/`)

- `Tabs.astro` — generic ARIA-correct tab strip with sliding underline,
  keyboard navigation, cross-fade between panels, controlled by a
  single `data-active` attribute (no per-page JS).
- `CodeBlock.astro` — code block with header (filename/lang), copy
  button, line-numbers on demand, optional caption. SSR-safe (no JS
  required to view); JS only adds the copy affordance.
- `Callout.astro` — variants `note` / `tip` / `warn` / `danger`, used
  for "preset recommendation", "scope" notes, "breaking change" markers.
- `Stepper.astro` — numbered ordered list with a connected rail and
  optional code-in-step rendering (inline `` `code` `` → `<code>`).
- `CopyButton.astro` — small button with `navigator.clipboard` write,
  graceful fallback to `document.execCommand` for older browsers,
  visual confirmation ("Copied!" for 1.5s).

### Install page rewrite (`pages/install.astro` + `components/Install.astro`)

- Header section: hero title, lead, version chip from
  `capabilities.json`.
- **Row 1: package manager tabs** (npm/pnpm/yarn/bun/deno)
  → each panel shows: one-command init, what gets created, a `Callout`
  tip if the package is the recommended one, copy button per command.
- **Row 2: IDE tabs** (VS Code, Cursor, Windsurf, Claude Code, Claude
  Desktop, Antigravity, Zed)
  → each panel shows: file path, scope (project/global), the rendered
  config JSON in a `CodeBlock` (re-rendered when PM changes), and a
  short explanation of the snippet's shape (why `mcpServers` vs
  `servers` vs `context_servers`).
- **Row 3: preset matrix** (minimal / standard / swarm / full)
  → each panel shows: which plugins ship, the size cost, and a
  recommended use case.
- **Foot**: `--check`, `--exclude-plugins=`, `--init --cwd`, plus a
  short FAQ callout ("Why is deno slow to install?", "What if my IDE
  isn't listed?").

### First-5-minutes rewrite

- Same `<Tabs>` primitive as install.
- Three profile tabs (Bun/Node, VS Code/Copilot, Claude Code) each
  with: title, intro, `Stepper` (with `CodeBlock` inside the relevant
  steps), and a "next step" rail linking to install, tools,
  troubleshooting.
- All inline code rendered via the same `Stepper` → inline-code path.

### Guide rewrite

- `pages/guide.astro` becomes a two-column layout (sticky TOC on the
  left, article on the right).
- Each section uses the new primitives: `Callout` for "important"
  notes, `CodeBlock` for every snippet, `Stepper` for sequential
  guidance.
- Section headings get `id` anchors automatically; the TOC is rendered
  from a single `sections` array (one source of truth).
- Active TOC item highlights as the user scrolls (IntersectionObserver).

### i18n

- New keys land in `apps/web/src/i18n/shared.ts` and are filled in all
  12 languages (`en, es, fr, de, pt, it, zh, hi, ar, ja, vi, th`).
- The gate (`scripts/check-i18n.ts`) is upgraded to fail the build if
  any new key is missing in any of the 12 languages, not just
  missing-in-en.

## non-goals

- No rewrite of pages other than install / first-5-minutes / guide.
  Plugin pages, presets, tools index and benchmarks keep their current
  shape; they consume the new primitives opportunistically.
- No new runtime dependencies; everything renders in Astro + a tiny
  `<script>` per component (≤ 30 lines, hand-rolled, no
  headless-ui/alpine/etc).
- No dark/light theme changes beyond the existing 5 palettes.
- No change to the JSON schema for `mcp-vertex.config.json`.

## architecture

- The new primitives live in `apps/web/src/components/ui/` and import
  nothing from `components/Plugin*.astro` (the plugin page pattern is
  a special case of `Tabs`).
- Each primitive owns its own CSS in a colocated `<style>` block, so
  they are drop-in anywhere.
- The install page's pre-computed `(pm × ide)` snippet map is moved
  from the inline `<script>` to the Astro frontmatter (where it
  belongs — the snippets are content, not behaviour). The client only
  looks up `snippets[pm + '|' + ide]`.
- The guide TOC scroll-spy uses a 5-line `IntersectionObserver` —
  no library.
- `check-i18n.ts` is upgraded to enforce: every language has the
  exact same set of keys as `en`. The current rule "every key in `en`
  must exist in every language" stays; we add the inverse to catch
  drift the other way.

## Slices

### S1 — UI primitives kit

- **Status**: done
- **Files**:
  - `apps/web/src/components/ui/Tabs.astro`
  - `apps/web/src/components/ui/CodeBlock.astro`
  - `apps/web/src/components/ui/Callout.astro`
  - `apps/web/src/components/ui/Stepper.astro`
  - `apps/web/src/components/ui/CopyButton.astro`
  - `apps/web/src/components/ui/_tabs-controller.ts`
  - `apps/web/src/components/ui/_code-copy-controller.ts`
- **Gate**: `bun run check:i18n && bun run typecheck && bun run lint`

### S2 — Install page rewrite

- **Status**: done
- **Files**:
  - `apps/web/src/components/Install.astro`
  - `apps/web/src/pages/install.astro`
  - `apps/web/tsconfig.json` (added `#UI/*` alias)
- **Gate**: `bun run typecheck && bun run lint:scss && bun run build`

### S3 — First-5-minutes rewrite

- **Status**: done
- **Files**:
  - `apps/web/src/components/FirstFiveMinutesSection.astro`
  - `apps/web/src/pages/first-5-minutes.astro`
- **Gate**: `bun run typecheck && bun run lint:scss && bun run build`

### S4 — Guide rewrite

- **Status**: done
- **Files**:
  - `apps/web/src/pages/guide.astro`
- **Gate**: `bun run typecheck && bun run lint:scss && bun run build`

### S5 — i18n gate hardening + final validate

- **Status**: pending
- **Files**:
  - `apps/web/scripts/check-i18n.ts`
- **Gate**: `bun run validate`