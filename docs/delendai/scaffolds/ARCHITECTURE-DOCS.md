---
applies-to: apps/web/src/**/*.astro
---

# Architecture: docs

## Purpose

The web app is generated from the live registry and should not drift from the
published tool surface.

## Required Shape

- User-visible copy is represented in all 12 language dictionaries.
- Generated data stays generated; do not hand-edit generated capability output.
- Pages render useful product/docs surfaces directly, not placeholder landing
  shells.

## Validation

Run `bun run site:strict` for docs and i18n completeness.

