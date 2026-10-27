---
id: x00973
title: "Code-analysis tools scan the scope they announce, or name what they left out"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-24
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
- **Status**: pending
- **Files**: `plugins/context-for-change/src/lib/services/context-for-change.service.ts`, `plugins/context-for-change/tests/src/context-for-change.tool.spec.ts`, `plugins/impact-analysis/src/lib/services/impact-analysis.service.ts`, `plugins/impact-analysis/tests/src/lib/services/impact-analysis.service.spec.ts`
- **Gate**: type
- acceptance:
  - "With files or a diff given, the working tree is not added (D116, D118)."

### S2 — Scans report their coverage
- **Status**: pending
- **Files**: `plugins/link-check/src/lib/link-check/real-deps.ts`, `plugins/link-check/src/lib/tools/link-check.tool.ts`, `plugins/tech-debt/src/index.ts`, `plugins/tech-debt/src/lib/tech-debt/real-deps.ts`, `plugins/tech-debt/src/lib/tools/debt-scan.tool.ts`, `plugins/docs/src/lib/services/engine.ts`, `plugins/docs/src/lib/tools/tools.ts`, `plugins/diagram/src/lib/graph/real-deps.ts`, `plugins/diagram/src/lib/tools/diagram-graph.tool.ts`
- **Gate**: type
- acceptance:
  - "link_check covers md and mdx and returns a truncated flag with the cap (D117); debt_scan likewise (D120)."
  - "docs_list paginates the full collection; total is the real total (D109)."
  - "diagram_deps reads the root workspaces list (D119)."

### S3 — Language and convention tools see the repo
- **Status**: pending
- **Files**: `plugins/framework-knowledge/src/lib/resolve/installed-framework.helper.ts`, `plugins/framework-knowledge/src/lib/tools/guidance.tool.ts`, `plugins/i18n/src/lib/keys/extract-used-keys.ts`, `plugins/i18n/src/lib/tools/i18n-check.tool.ts`, `plugins/conventions/src/lib/profiles/profile-registry.ts`, `plugins/conventions/src/lib/tools/explain-path.tool.ts`, `plugins/test-convention/src/convention.ts`, `plugins/test-convention/src/scan.ts`, `plugins/style-convention/src/lib/profile/style-workspace.service.ts`, `plugins/style-convention/src/lib/tools/style-profile.tool.ts`
- **Gate**: type
- acceptance:
  - "Each finding's tool covers the declared scope or names what it left out (D60, D72, D77, D108, D78, D107)."

### S4 — rules and quality-policy
- **Status**: pending
- **Files**: `plugins/rules/src/lib/frameworks/manifest-via-composition.ts`, `plugins/rules/src/lib/frameworks/manifest.ts`, `plugins/rules/src/index.ts`, `plugins/rules/src/public/index.ts`, `plugins/quality-policy/src/lib/contracts/constants/quality-policy.constant.ts`, `plugins/quality-policy/src/lib/services/quality-policy.service.ts`, `plugins/quality-policy/src/lib/services/quality-policy-types.service.ts`
- **Gate**: type
- acceptance:
  - "The composed rules builder covers services/ as the legacy one did (D85)."
  - "quality_policy derives its areas from the workspaces and every tsconfig (D105, D49)."

## acceptance

- With files or a diff given, the working tree is not added (D116, D118).
- link_check covers md and mdx and returns a truncated flag with the cap (D117); debt_scan likewise (D120).
- docs_list paginates the full collection; total is the real total (D109).
- diagram_deps reads the root workspaces list (D119).
- Each finding's tool covers the declared scope or names what it left out (D60, D72, D77, D108, D78, D107).
- The composed rules builder covers services/ as the legacy one did (D85).
- quality_policy derives its areas from the workspaces and every tsconfig (D105, D49).
