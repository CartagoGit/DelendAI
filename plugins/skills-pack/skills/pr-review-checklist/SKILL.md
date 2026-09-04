---
name: pr-review-checklist
id: pr-review-checklist
title: PR review checklist
category: dev
tags: ['review', 'pull-request', 'quality', 'security']
tools: ['delendai_git_pr_list', 'delendai_git_pr_view', 'delendai_git_changelog', 'delendai_forge_ci_status', 'delendai_quality_quality_run_all', 'delendai_security_security_audit']
appliesTo: ['@delendai/skills-pack', '@delendai/git', '@delendai/forge', '@delendai/quality', '@delendai/security']
description: Review a PR systematically by checking scope, commit history, CI, project-wide quality gates, and security findings before approval.
---

# PR review checklist

## Goal

Reach a defensible review decision based on behavior, risk, and validation,
not on whether the diff merely looks tidy.

## When to use

Use this when reviewing a pull request, a stacked branch, or a proposed merge
commit that should land without hidden regressions.

## Steps

1. Start with `delendai_git_pr_list` when you need to locate the candidate PR
   or compare several open reviews.
2. Inspect the target PR with `delendai_git_pr_view` and note scope, changed
   files, linked issues, and any obvious missing context.
3. Read the history with `delendai_git_changelog` to see whether the branch
   is coherent or hides unrelated churn.
4. Check `delendai_forge_ci_status` before spending time on stylistic nits.
   A red CI result changes review priority immediately.
5. Run or inspect `delendai_quality_quality_run_all` when project-wide gates
   are part of the acceptance bar.
6. Run `delendai_security_security_audit` when the diff changes inputs,
   dependencies, auth, file writes, or network behavior.
7. If the repo policy requires extra shell gates such as `bun run verify:tools`,
   treat them as release checks, not as MCP tool references.

## Checks

- The diff has one clear user-facing intent.
- CI status, quality gates, and security signals all agree with the review
  decision.
- Any requested change is tied to behavior, risk, or missing validation.
- Any approval records what was checked, not just that the diff was read.

## Exit criteria

- The PR is approved, rejected, or sent back with concrete change requests.
- The final decision cites at least one behavior or risk argument.
- No approval is given while CI or required gates are still unexplained.

## References

- `delendai_git_pr_list`
- `delendai_git_pr_view`
- `delendai_git_changelog`
- `delendai_forge_ci_status`
- `delendai_quality_quality_run_all`
- `delendai_security_security_audit`
  action.
