---
id: x00980
title: "The documentation site is published, canonical and complete after a clean build"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-24
last-transition-id: e2688ed5-cb49-4b8c-8fda-14ca35732fec
last-correlation-id: e2688ed5-cb49-4b8c-8fda-14ca35732fec
last-transition-from: in-progress
last-transition-at: 2026-11-17T20:26:04.621Z
---

# x00980 — The documentation site is published, canonical and complete after a clean build

## goal

The Pages workflow publishes the site, every page declares canonical and hreflang with one h1, and a clean checkout builds a site whose /api is present and current.

## why

Joint audit a00095. G136: the documentation site is not published: has_pages is false and every expected route returns 404. D12: 50 of 51 pages lack canonical; hreflang only on the home page. G137: capabilities pages have more than one h1 (81 pages) and only the home declares canonical and hreflang, confirmed in the built output. G50: the API nav link 404s unless the full `bun run site` ran (public/api is a build-time symlink). D33: a local apps/web build can serve an empty or stale /api without warning.

## non-goals

- Translation content (the web-i18n proposal).

## slices

- global_gate: type

### S1 — Pages publishes the site
- **Status**: pending
- **Files**: `.github/workflows/pages.yml`, `apps/web/astro.config.mjs`
- **Gate**: type
- acceptance:
  - "A push to main deploys Pages; the published root and three deep routes answer 200 (G136). Enabling Pages in the repo settings is the owner's step and is stated in the PR."
- shipped-in: `ae10a17064dc`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Need empirical acceptance evidence in this review round (validate exit code, test pass/total, and shipped commit hash) so the slice can be approved under current review policy.

### S2 — Canonical, hreflang, one h1
- **Status**: pending
- **Files**: `apps/web/src/layouts/Base.astro`, `apps/web/src/pages/capabilities.astro`, `apps/web/src/pages/[lang]/capabilities.astro`
- **Gate**: type
- acceptance:
  - "Every built page has one h1, a canonical and hreflang for each locale; a built-output check fails otherwise (D12, G137)."
- shipped-in: `fb363c7ec614`
- review-state: changes_requested
- review-implementer: claude-sonnet-5-5
- review-reviewer: gpt-5.3-codex
- review-log: requested_changes by gpt-5.3-codex — Need empirical acceptance evidence in this review round (validate exit code, test pass/total, and shipped commit hash) so the slice can be approved under current review policy.

### S3 — /api is built, not linked
- **Status**: review
- **Files**: `apps/web/scripts/sync-public-api.ts`, `apps/web/package.json`
- **Gate**: type
- acceptance:
  - "dev, preview and build generate or copy the API docs and fail when the source is missing or older than the code (G50, D33)."
- shipped-in: `3638714938ca`
- review-state: in_review
- review-implementer: claude-sonnet-5-5

## acceptance

- A push to main deploys Pages; the published root and three deep routes answer 200 (G136). Enabling Pages in the repo settings is the owner's step and is stated in the PR.
- Every built page has one h1, a canonical and hreflang for each locale; a built-output check fails otherwise (D12, G137).
- dev, preview and build generate or copy the API docs and fail when the source is missing or older than the code (G50, D33).
