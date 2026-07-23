---
id: f00134
kind: feat
title: i18n plugin — translation key extraction, missing/unused detection and interpolation validation (promotes internal i18n tooling)
status: ready
date: 2026-07-23
track: plugin+i18n+quality
---

# f00134 — i18n plugin

## goal

An adopter-facing `i18n` plugin that extracts translation keys, finds
**missing / unused** keys across locales, and validates **interpolation / ICU**
placeholders — promoting mcp-vertex's internal i18n tooling (already used for
`apps/web` and the per-locale tool-description catalogs) into a reusable
plugin, reporting normalized findings.

## why

i18n hygiene (missing keys shipping to users, unused keys rotting) is a real
recurring need, and mcp-vertex already validates its own i18n internally.
Promoting it is cheap and dogfoods directly: the repo's own `es`/`en` tool
catalogs gain a first-class, gated check.

## why this design

Promote the existing internal i18n scan/validation to a plugin surface: a
**pure key-diff** over injected locale files, reusing the catalogue structure
the project already maintains, emitting the shared `IFinding` shape (r00012).
No machine translation, no file rewrites.

## non-goals

- No machine translation and no bundled translation API.
- No locale-file rewrites without an explicit, reviewed diff.
- Not a runtime i18n library — this is a static hygiene checker.

## slices

### S1 — extract + missing/unused diff

- **Status**: pending
- **Files**: `plugins/i18n/src/lib/keys/`, `plugins/i18n/src/lib/tools/i18n-check.tool.ts`
- **Gate**: bun run validate

`i18n_check` extracts used keys and diffs against each locale → missing/unused
findings. Pure over injected sources + locale files.

### S2 — interpolation / ICU validation

- **Status**: pending
- **Files**: `plugins/i18n/src/lib/validate/`, `plugins/i18n/src/lib/tools/i18n-validate.tool.ts`
- **Gate**: bun run validate

`i18n_validate` checks placeholder/ICU consistency across locales → findings.
Pure validator.

### S3 — catalog + pack

- **Status**: pending
- **Files**: `plugins/i18n/README.md`, `packages/core/src/lib/plugins/preset-catalog.ts`
- **Gate**: bun run validate

Catalog + wiki + `web-app` pack membership (r00011).

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Detects a seeded missing key and an unused key across fixture locales.
- Flags a placeholder mismatch between locales.

## notes

Reuses the internal i18n tooling + catalogue structure and r00012 findings.
Prior art: i18next-parser, FormatJS, i18n-ally.
