---
id: x01103
title: "The docs site publishes from develop and can be triggered by hand"
kind: fix
status: ready
type: proposal
track: default
date: 2026-11-19
tags:
    - workflow
    - pages
    - documentation
---

# x01103 — The docs site publishes from develop and can be triggered by hand

## goal

The documentation site is published from `develop`, the branch where the code and the tool
registry actually live, and it can also be published on demand. Today the workflow only reacts
to a push on `main`, so the site never publishes: `main` is a release branch and it is thousands
of commits behind `develop`.

## why

Observed on 2026-11-19. `pages.yml` declares `on: push: branches: [main]`. `main` was last
touched on 2026-09-29 and is 9.898 commits behind `develop`; the tool registry, the plugin
catalogue and the public API that the site is generated from all live on `develop`. The
consequence is that the site is built but never published, and the URL that the repository
advertises as its homepage answers 404.

The workflow already handles the "Pages not enabled" case: it checks
`gh api repos/$GITHUB_REPOSITORY/pages` and, when the site is disabled, it builds and checks
the site but skips the publication with a notice (x00879 S12). That gate was added so a
push would not leave a red run for a setting nobody had chosen. Pages **is** enabled now, so
the gate passes and only the trigger is wrong.

## non-goals

- **No change to the site itself.** The build, the strict mode and the verification job stay
  exactly as they are; only *when* it runs changes.
- **No merge of `develop` into `main`.** Which commits a release carries is a release decision
  and is not touched here.
- **No change to the release workflow.** `release.yml` is tag-driven and stays untouched.

## slices

- global_gate: none

### S1 — Publish from develop, and allow a manual run
- **Status**: pending
- **Files**: `.github/workflows/pages.yml`
- **Gate**: none

## acceptance

- A push to `develop` runs the Pages workflow and publishes the site.
- The workflow can be triggered by hand from the Actions tab, on any branch, so the site can be
  republished without waiting for a push.
- A push to `main` still publishes, so a release keeps its own site build.
- The "Pages not enabled" gate still works: with Pages disabled the workflow builds and checks
  the site and skips the publication with a notice, and it does not fail.
- The `verify` job still requires the published root and its deep routes to answer 200.

## risks

- **More frequent publishing.** Every push to `develop` now rebuilds and redeploys the site.
  The build is the same build the release already runs, so the cost is CI minutes, not a
  different code path. If that turns out to be too loud, the trigger can be narrowed to
  `main` plus a manual dispatch, which is the second half of this slice.
- **A half-landed `develop` publishes.** The site is generated in strict mode from the live
  tool registry, so a tool that is not documented fails the build rather than publishing a
  silent gap. The strict build is the guard.

## notes

- The homepage advertised by the repository is `https://cartagogit.github.io/DelendAI/`. It
  answers 404 today and starts answering 200 once this lands and the workflow runs.
