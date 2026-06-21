---
id: x127
status: done
type: proposal
track: web+ui
date: 2026-06-21
kind: feat
title: Replace hand-drawn logo placeholders with real brand marks (npm, pnpm, yarn, bun, deno, git, github, vscode, cursor, claude, windsurf, antigravity, zed, modelcontextprotocol)
shipped-in: pending
---

# x127 — Real brand logos (x00008 follow-up)

## Goal

Replace the hand-drawn logo placeholders that the previous
generators wrote with the **real brand marks** fetched from
`simple-icons` (CC0) and a couple of hand-curated Wikimedia /
official-repo URLs.

## Why

In x00008 (`gen-plugin-logos.ts`) I drew a letter glyph per
plugin ("A" for audit, "C" for core, etc.) and a coloured
rounded-rect background. In x00009 I swapped the PM/IDE glyphs
for the same letter trick (one-letter brand-coloured squares).
The user feedback after x00009 was that "los iconos de cada
plugin no tienen sentido para lo que muestran" — a single
letter does not tell you what the plugin does; a real brand
mark does. `simple-icons` is already a workspace dep
(`apps/web/package.json`) and ships 3400+ CC0 brand marks at
`node_modules/simple-icons/icons/<slug>.svg`. The obvious
upgrade is to copy the real marks into
`apps/web/public/logos/` so the Install page's tab strips,
the brand favicon, the social links, and any future reference
use the real mark.

## What this changes

- **New script `apps/web/scripts/fetch-brand-logos.ts`**
  (~210 lines): walks a hand-curated mapping of 17 brands →
  output filenames, reads each SVG from `simple-icons` (or
  fetches it from a Wikimedia / official-repo URL when
  simple-icons doesn't have the brand), extracts the **last**
  `<path d="...">` from the source SVG (because multi-path
  marks like VS Code layer the real logo on top of decorative
  background rectangles; simple-icons ships single-path icons
  so the last path is the only one either way), and renders it
  on top of a 64×64 rounded-rect background in the brand
  colour, white foreground (dark foreground for the `bun`
  brand which uses a near-white background).
- **`apps/web/package.json#scripts.fetch:logos`**: runs the
  script. Idempotent (skips files whose rendered output matches
  what's on disk).
- **17 logos in `apps/web/public/logos/`**: the 13 package
  managers / runtimes / version control marks
  (`npm`, `pnpm`, `yarn`, `bun`, `deno`, `node`, `typescript`,
  `git`, `github`, `modelcontextprotocol`) plus the 7 IDE
  marks (`cursor`, `claude`, `claudecode`, `windsurf`,
  `zedindustries`, `vscode` fetched from the official VS Code
  repo, and `antigravity` standing in for `google` until
  simple-icons adds an `antigravity` entry).

## What does NOT change

- The custom plugin glyphs (`plugin-audit.svg`, `plugin-core.svg`,
  …) stay hand-drawn. These plugins don't have a brand mark
  (the names are project-internal), so the semantic stroke
  glyphs from x00009 stay. `gen-plugin-logos.ts` is unchanged.

## Non-goals

- Curating a real `antigravity.svg` mark. simple-icons v16.23.0
  doesn't have one (Google hasn't published a standalone
  Antigravity favicon), so we stand in with `google` (the
  multicoloured G) until that lands in simple-icons or someone
  commits a hand-drawn mark.
- Adding branded social icons beyond `github` (e.g. Twitter,
  Discord, npm). These can come later if the user asks.

## Acceptance

- [x] `bun run fetch:logos` regenerates the 17 logos
      idempotently.
- [x] The Install page tab strips show real brand marks
      (`npm` red `N`, `bun` beige bunny face, `vscode` blue `V`,
      `windsurf` blue `W`, etc.) instead of letters.
- [x] The 2 brands simple-icons v16.23.0 doesn't ship with
      (`vscode`, `antigravity`) are still fetched and committed
      via the `sources` field in `BRANDS`.

## Risk register

- **R1 — Brand colour drift**: we hardcode brand colours
  (`#cb3837` for npm, etc.). If a brand refreshes its palette
  we need to update `BRANDS`. Mitigation: the `fetch:logos`
  output is checked in, so a stale `BRANDS` is visible at
  diff time.
- **R2 — Some paths are big / clipped**: rendering a 1024×1024
  mark into 24×24 inside a 64×64 badge is a 1:42.6 scale. Most
  marks survive (the outline is the same at any scale) but
  hairline details can drop below the 1px threshold. Mitigation:
  visually verified on `/install` and `/es/install`.

## Linked references

- x00008 — the first logo pass that produced letter glyphs.
- x00009 — the polish round that added the 5 PM and 7 IDE
  letter squares.
- `simple-icons` — CC0 brand mark library at
  `https://github.com/simple-icons/simple-icons`.
- VS Code official SVG at
  `https://raw.githubusercontent.com/microsoft/vscode/main/src/vs/workbench/browser/media/code-icon.svg`.
