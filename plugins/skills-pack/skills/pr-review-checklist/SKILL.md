---
name: mcp-vertex-pr-review-checklist
id: mcp-vertex-pr-review-checklist
title: PR review checklist
category: development
tags: ['pr-review', 'checklist', 'merge-gate', 'quality', 'security', 'git']
tools: ['mcp-vertex_git_pr_list', 'mcp-vertex_git_pr_view', 'mcp-vertex_git_changelog', 'mcp-vertex_forge_ci_status', 'mcp-vertex_quality_quality_run_all', 'mcp-vertex_security_security_audit']
appliesTo: ['@mcp-vertex/skills-pack', '@mcp-vertex/git', '@mcp-vertex/forge', '@mcp-vertex/quality', '@mcp-vertex/security']
description: Review a pull request systematically by inspecting scope, history, CI, quality gates, and security signals before approving. Use the gated tools to confirm claims in the PR description, not the description itself.
---

# PR review checklist

Work the list **in order**. Every box must be checkable, or the PR is
not ready to merge. Use the gated tools to confirm the claims in the
PR description, not the description itself.

## Goal

Approve a PR only when every box on the checklist is green, every
claim in the description is verified by a tool, and there is no
scope creep, regression, or security risk that the author has not
explicitly addressed.

## Steps

1. **The PR matches its proposal slice** — Use
   `mcp-vertex_git_pr_list` / `mcp-vertex_git_pr_view` to see the
   full PR. Confirm the linked proposal/slice, frontmatter, status
   flip, file-disjoint from other open slices, and **no scope
   creep** (the diff is exactly what the slice promised).
2. **The contract holds** — Every new public export has a TypeScript
   type and a docstring (f00037). Every new MCP tool has an
   `outputSchema` (Zod) and a tag/effect declaration (r00012). The
   plugin is wired at all six sites (tsconfig, vitest aliases,
   plugin-defaults, preset-catalog, release-plan, generated
   tool-outputs). No file outside the slice's `Files` list was
   modified.
3. **The validation gate is green** — `mcp-vertex_git_changelog` +
   `mcp-vertex_forge_ci_status` to read the actual CI run. The PR
   shows `bun run validate` exit 0 (or the `validate-summary.md`
   shows the only failures are pre-existing and unrelated). New
   code is covered by at least one happy-path and one edge-case
   test.
4. **No regressions** — No neighbouring test that previously passed
   is now failing. No token budget was silently blown. No preset
   catalog count changed without an updated test. No
   `tool-outputs.ts` is stale.
5. **Security and secrets** — `mcp-vertex_security_security_audit`
   against the PR diff. No new `readFileSync` of untrusted paths.
   No new string interpolation into shell commands. No new
   secret-like literal. No new dependency without a license/CVE
   review.
6. **Documentation is updated** — The plugin's README lists the new
   tool. The relevant skill reflects the contract change. The
   proposal's `## slices` table has the commit hash and a
   one-line "Delivered:" note. If the PR closed a proposal, it was
   moved to `docs/mcp-vertex/proposals/done/<kind>/`.
7. **Commit hygiene** — Conventional Commits format. The `type`
   correctly maps to a semver bump. The commit is on `develop` (or
   the right `agent/*` branch for multi-agent work) and pushed
   before opening the PR. No merge commits in the slice itself.

## When to refuse a review

- "I'll fix the tests in a follow-up" — refuse. Tests are part of
  this PR.
- "I rebased but the diff is now huge" — ask for it to be split.
- "It's a refactor, no behaviour change" — confirm by reading the
  diff, not by trusting the description.
- "I had to touch a few other files too" — those are scope creep;
  ask for them in a follow-up PR with their own proposal.

## Exit criteria

- Every box in steps 1–7 is green, OR a follow-up PR is opened for
  every unchecked box.
- The PR description's claims are all verified by a tool call, not
  by trust.
- The author is pinged on any unchecked box with a concrete
  action.
