---
name: migrate-from-x
id: migrate-from-x
title: Migrate from <X>
category: migration
tags: ['migration', 'refactor', 'legacy', 'quality']
tools: ['mcp-vertex_refactor_refactor_codemod', 'mcp-vertex_refactor_refactor_rename', 'mcp-vertex_git_changelog', 'mcp-vertex_quality_quality_run_all']
appliesTo: ['@delendai/skills-pack', '@delendai/refactor', '@delendai/git', '@delendai/quality', '@delendai/proposals']
description: Extend the legacy migration discipline to plan and execute a migration from a legacy tool or pattern with codemods, rename, history checks, and final quality gates.
---

# Migrate from <X>

## Goal

Move a codebase off a legacy tool, pattern, or folder scheme with an explicit
mapping, bounded edits, and verification at the end of each migration stage.

## When to use

Use this when replacing a deprecated internal convention, third-party tool, or
historical layout with a supported path that needs more than a simple rename.

## Steps

1. Read the existing legacy migration skill at
   `plugins/proposals/skills/legacy-proposal-migration/SKILL.md` when the work
   involves historical proposals or a repo-authored migration contract.
2. Write the old-to-new mapping first: API names, config keys, folder paths,
   and any data shape that must stay backward-compatible during rollout.
3. Use `mcp-vertex_refactor_refactor_codemod` for mechanical tree-wide edits
   that are deterministic enough for dry-run review.
4. Use `mcp-vertex_refactor_refactor_rename` for symbol-level renames that need
   language-aware updates instead of text replacement.
5. Inspect `mcp-vertex_git_changelog` when you need to understand how the
   legacy surface evolved or to confirm whether a compatibility layer still has
   downstream consumers.
6. Run `mcp-vertex_quality_quality_run_all` at the end of each meaningful
   migration increment, not only at the very end.

## Checks

- The migration has a written mapping from every important old surface to its
  new owner.
- Codemods and renames are dry-run reviewed before apply.
- Compatibility notes exist for anything intentionally left behind.
- Each increment ends with quality validation, not just a larger future promise.

## Exit criteria

- The supported replacement path is live and validated.
- The legacy surface is removed, isolated, or explicitly documented.
- Reviewers can audit the migration through codemod output, rename intent, and
  final quality results.

## References

- `plugins/proposals/skills/legacy-proposal-migration/SKILL.md`
- `mcp-vertex_refactor_refactor_codemod`
- `mcp-vertex_refactor_refactor_rename`
- `mcp-vertex_git_changelog`
- `mcp-vertex_quality_quality_run_all`