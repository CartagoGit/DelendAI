---
id: x00973
title: "Code-analysis tools scan the scope they announce, or name what they left out"
kind: fix
status: review
type: proposal
track: a00095-consistency
date: 2026-10-24
last-transition-id: 735c91de-2996-4a1f-bdd4-42927a058bb0
last-correlation-id: 735c91de-2996-4a1f-bdd4-42927a058bb0
last-transition-from: in-progress
last-transition-at: 2026-11-01T06:25:25.790Z
---

# x00973 — Code-analysis tools scan the scope they announce, or name what they left out

## goal

Every tool that says it covers the workspace (frameworks, i18n keys, conventions, rules, quality policy, style tokens, test drift, impact, context, diagram, links, docs, tech debt) either scans the whole declared scope or returns the parts it skipped and why, and tools given an explicit slice do not mix in the working tree.

## why

Joint audit a00095. D60: framework_guidance promises to pick in a mixed repo but inspects package.json only. D72: i18n_check marks live keys unused (legacy t() form only). D77/D108: test-convention sees only src/*.tsx? sources. D78: conventions_explain_path always uses the TS defaults. D85: the rules builder lost the services/ group. D105: quality_policy samples three lint areas as if they were the repo. D49: the type policy reads only the root tsconfig chain. D107: style_profile counts only configured token files. D116: context_for_change mixes unrequested working-tree changes. D118: impact_analyze and tests_for_change add the global working tree to an explicit slice. D119: diagram_deps omits whole package families. D117: link_check reads **/*.md only, with silent caps. D120: debt_scan imposes silent caps. D109: docs_list paginates a pre-truncated collection.

## non-goals

- Operational tools (the scope-ops proposal).

## slices

- global_gate: type

### S1 — Explicit slices stay explicit
- **Status**: review
- **Files**: `plugins/context-for-change/src/lib/services/context-for-change.service.ts`, `plugins/context-for-change/tests/src/context-for-change.tool.spec.ts`, `plugins/impact-analysis/src/lib/services/impact-analysis.service.ts`, `plugins/impact-analysis/tests/src/lib/services/impact-analysis.service.spec.ts`
- **Gate**: type
- acceptance:
  - "With files or a diff given, the working tree is not added (D116, D118)."
- shipped-in: `a6c27d556c95`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — Scans report their coverage
- **Status**: review
- **Files**: `plugins/diagram/src/lib/graph/real-deps.ts`, `plugins/diagram/tests/src/lib/graph/real-deps.spec.ts`, `plugins/docs/src/lib/services/engine.ts`, `plugins/docs/src/lib/tools/tools.ts`, `plugins/docs/tests/src/lib/docs-list-pagination.spec.ts`, `plugins/link-check/src/lib/contracts/constants/link-check.constant.ts`, `plugins/link-check/src/lib/contracts/interfaces/link-check.interface.ts`, `plugins/link-check/src/lib/link-check/real-deps.ts`, `plugins/link-check/src/lib/tools/link-check.tool.ts`, `plugins/link-check/tests/src/lib/link-check-coverage.spec.ts`, `plugins/tech-debt/src/lib/contracts/constants/tech-debt.constant.ts`, `plugins/tech-debt/src/lib/contracts/interfaces/tech-debt.interface.ts`, `plugins/tech-debt/src/lib/tech-debt/real-deps.ts`, `plugins/tech-debt/src/lib/tools/debt-scan.tool.ts`, `plugins/tech-debt/tests/src/lib/debt-scan-coverage.spec.ts`, `packages/core/src/lib/shared/scan-scope.helper.ts`, `packages/core/tests/src/lib/shared/scan-scope.helper.spec.ts`
- **Gate**: type
- acceptance:
  - "link_check covers md and mdx and returns a truncated flag with the cap (D117); debt_scan likewise (D120)."
  - "docs_list paginates the full collection; total is the real total (D109)."
  - "diagram_deps reads the root workspaces list (D119)."
- shipped-in: `a6c27d556c95`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Language and convention tools see the repo
- **Status**: review
- **Files**: `packages/core/src/generated/tool-outputs.ts`, `packages/core/src/lib/shared/workspace-packages.helper.ts`, `packages/core/src/runtime/index.ts`, `packages/core/tests/src/lib/shared/workspace-packages.helper.spec.ts`, `plugins/conventions/src/lib/tools/explain-path.tool.ts`, `plugins/conventions/tests/src/lib/tools/explain-path.tool.spec.ts`, `plugins/framework-knowledge/src/lib/resolve/installed-framework.helper.ts`, `plugins/framework-knowledge/src/lib/tools/guidance.tool.ts`, `plugins/framework-knowledge/tests/src/lib/resolve/installed-framework.helper.spec.ts`, `plugins/i18n/src/lib/contracts/interfaces/i18n.interface.ts`, `plugins/i18n/src/lib/i18n/check-i18n.ts`, `plugins/i18n/src/lib/keys/extract-used-keys.ts`, `plugins/i18n/src/lib/tools/i18n-check.tool.ts`, `plugins/i18n/tests/src/lib/keys/extract-used-keys.spec.ts`, `plugins/style-convention/src/lib/profile/style-workspace.service.ts`, `plugins/style-convention/tests/src/lib/profile/style-workspace.service.spec.ts`, `plugins/test-convention/src/generated/tool-outputs.ts`, `plugins/test-convention/src/lib/tools/scan-drift.ts`, `plugins/test-convention/src/scan.ts`, `plugins/test-convention/tests/src/lib/scan.spec.ts`, `plugins/test-convention/src/scan-paths.helper.ts`
- **Gate**: type
- acceptance:
  - "Each finding's tool covers the declared scope or names what it left out (D60, D72, D77, D108, D78, D107)."
- shipped-in: `a6c27d556c95`
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — rules and quality-policy
- **Status**: review
- **Files**: `plugins/quality-policy/src/lib/contracts/constants/quality-policy.constant.ts`, `plugins/quality-policy/src/lib/contracts/interfaces/quality-policy.interface.ts`, `plugins/quality-policy/src/lib/services/quality-policy-types.service.ts`, `plugins/quality-policy/src/lib/services/quality-policy.service.ts`, `plugins/quality-policy/src/lib/tools/quality-policy.tool.ts`, `plugins/quality-policy/tests/src/lib/services/quality-policy-types.service.spec.ts`, `plugins/rules/src/lib/contracts/constants/area-group-dirs.constant.ts`, `plugins/rules/src/lib/frameworks/manifest-via-composition.ts`, `plugins/rules/src/lib/frameworks/manifest.ts`, `plugins/rules/tests/src/lib/frameworks/manifest-via-composition.spec.ts`
- **Gate**: type
- acceptance:
  - "The composed rules builder covers services/ as the legacy one did (D85)."
  - "quality_policy derives its areas from the workspaces and every tsconfig (D105, D49)."
- shipped-in: `a6c27d556c95`
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- With files or a diff given, the working tree is not added (D116, D118).
- link_check covers md and mdx and returns a truncated flag with the cap (D117); debt_scan likewise (D120).
- docs_list paginates the full collection; total is the real total (D109).
- diagram_deps reads the root workspaces list (D119).
- Each finding's tool covers the declared scope or names what it left out (D60, D72, D77, D108, D78, D107).
- The composed rules builder covers services/ as the legacy one did (D85).
- quality_policy derives its areas from the workspaces and every tsconfig (D105, D49).

## notes
- 2026-10-27, S1: `context_for_change`, `impact_analyze` and `tests_for_change` anchored on every changed file in the working tree as well as the slice they were given. The working tree now stands in only when nothing is named (files, diff or symbols).
- S2: `link_check` and `debt_scan` return `coverage { capped, maxFiles|maxDocs, skippedTotal, skipped[] }` (too-large, unreadable). `link_check` reads `.md` and `.mdx`. `docs_list` catalogues up to 10,000 docs before paginating, so `total` is the real total. `diagram_deps` reads the root workspaces (array or `packages` form; `dir/*`, `dir/**`, plain paths) instead of four fixed folders.
- S3: a core helper, `workspacePackageDirs` (`@delendai/core/runtime`), names the folders the root workspaces declare. `diagram_deps`, `framework_guidance` and `quality_policy` read through it, so all three see the same packages. `framework_guidance` reads every workspace package's dependencies. `i18n_check` counts `$t`, `translate`, `i18nKey`, `formatMessage({ id })`, Angular/Transloco pipes, keys under a `useTranslations` namespace, and the fixed prefix of keys built at run time. `scan_drift` reads script sources under any `src/`, matches specs by name in mirrored tests trees, and reports `skippedFiles` past its cap. `conventions_explain_path` uses the profile it is given or the one the path's extension belongs to. `style_profile` counts tokens declared in any stylesheet under the style roots.
- S4: both rules manifest builders read one list of group folders (`AREA_GROUP_DIRS`), which restores `services/` to the composed one. `quality_policy` takes its lint areas and samples from the workspaces' packages, and reads every package tsconfig: a package whose type policy differs from the root's is named in `tsconfigAreas`.
- S2: the scanners' excluded paths and their findings report (`total`, `findings`, `truncated`, `summary`, `worst`) moved into core (`isOutsideScanScope`, `findingsReport` in `@delendai/core/runtime`), so link_check and debt_scan share one copy instead of two.
