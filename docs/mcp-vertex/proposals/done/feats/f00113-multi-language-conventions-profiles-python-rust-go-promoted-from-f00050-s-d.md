---
id: f00113
title: "Multi-language conventions profiles (python/rust/go) — promoted from f00050 S-D"
kind: feat
status: done
type: proposal
track: conventions+plugins
date: 2026-07-14
---

# f00113 — Multi-language conventions profiles (python/rust/go) — promoted from f00050 S-D

## Goal

Add opt-in language profiles to the conventions plugin so `conventions_check`/`conventions_classify` can classify Python, Rust and Go repos, not only TypeScript. Trigger fired 2026-07-14: the user committed to making mcp-vertex adoptable in any project ("que se pueda usar facilmente en cualquier otro proyecto"), which is the S-D consumer-need precondition. Profiles live plugin-side (`plugins/conventions/src/lib/profiles/`) as data tables over an open role vocabulary; the core's canonical TypeScript contract (`file-conventions.contract.ts`) stays untouched and remains the default, so AGENTS.md rule #1 (core agnostic) is preserved.

## why

Parked non-goal S-D of f00049 (via f00050). The conventions plugin only understands TypeScript today; any non-TS repo that adopts mcp-vertex gets zero value from the plugin. The parked contract requires: per-language modules extending the base classifier with language-native equivalents (*.py module, __init__.py package marker, mod.rs, go.mod), the TS profile unchanged as regression baseline.

## non-goals

- Do not touch packages/core/src/lib/contracts/file-conventions.contract.ts — the TS profile stays the core-canonical default and its parity spec must keep passing.
- Do not lift the tools/-is-TypeScript-only repo rule (no-shell-python lint) — that is explicitly a separate proposal per the parked note.
- No auto-detection magic in v1: the caller passes profile explicitly; default remains typescript.

## Slices

- global_gate: e2e

### S1 — Profile contract + registry (open role vocabulary, typescript as default)
- **Status**: done
- **Files**: `plugins/conventions/src/lib/profiles/profile.contract.ts`, `plugins/conventions/src/lib/profiles/profile-registry.ts`, `plugins/conventions/tests/src/lib/profiles/profile-registry.spec.ts`
- **Gate**: e2e
- acceptance:
  - "ILanguageProfile = { id, displayName, fileExtensions, rules: readonly { name: string; match(rel): boolean }[] } — role names are plugin-local strings, NOT the core Role union."
  - "resolveProfile('typescript') wraps the core DEFAULT_TS_RULES unchanged; unknown profile id returns a structured error listing supported ids."
  - "Registry spec proves typescript resolution is byte-identical in classification to the core contract on a fixture tree."

### S2 — Python profile
- **Status**: done
- **Files**: `plugins/conventions/src/lib/profiles/python.profile.ts`, `plugins/conventions/tests/src/lib/profiles/python.profile.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Classifies at minimum: module (*.py), package-marker (__init__.py), test (test_*.py / *_test.py / tests/ dir), config (pyproject.toml/setup.cfg handled as config role for .py-adjacent scan), script (scripts/ dir), entry (__main__.py), generated (*_pb2.py)."
  - "Spec runs the profile over an in-memory fixture repo and asserts per-role counts + unmatched list."

### S3 — Rust profile
- **Status**: done
- **Files**: `plugins/conventions/src/lib/profiles/rust.profile.ts`, `plugins/conventions/tests/src/lib/profiles/rust.profile.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Classifies at minimum: module (*.rs), module-root (mod.rs), crate-entry (main.rs/lib.rs), test (tests/ dir + *_test.rs), build-script (build.rs), example (examples/ dir), bench (benches/ dir)."
  - "Spec over an in-memory fixture crate asserts counts + unmatched."

### S4 — Go profile
- **Status**: done
- **Files**: `plugins/conventions/src/lib/profiles/go.profile.ts`, `plugins/conventions/tests/src/lib/profiles/go.profile.spec.ts`
- **Gate**: e2e
- acceptance:
  - "Classifies at minimum: module (*.go), test (*_test.go), entry (main.go / cmd/ dir), internal (internal/ dir), generated (*.pb.go / *_gen.go), vendor skipped like node_modules."
  - "Spec over an in-memory fixture module asserts counts + unmatched."

### S5 — Wire profile option into scan service + both tools + docs
- **Status**: done
- **DependsOn**: [S1, S2, S3, S4]
- **Files**: `plugins/conventions/src/lib/services/conventions-scan.service.ts`, `plugins/conventions/src/lib/tools/check-conventions.tool.ts`, `plugins/conventions/src/lib/tools/classify-paths.tool.ts`, `plugins/conventions/README.md`
- **Gate**: e2e
- acceptance:
  - "conventions_check + conventions_classify gain optional profile: 'typescript'|'python'|'rust'|'go' (default typescript); scan filters by the profile's fileExtensions instead of hardcoded .ts/.tsx."
  - "Omitting profile is byte-identical to today's behaviour on this repo (regression, per the parked gate)."
  - "outputSchema updated; bun run types:generate clean; README documents the profiles."

## acceptance

- ILanguageProfile = { id, displayName, fileExtensions, rules: readonly { name: string; match(rel): boolean }[] } — role names are plugin-local strings, NOT the core Role union.
- resolveProfile('typescript') wraps the core DEFAULT_TS_RULES unchanged; unknown profile id returns a structured error listing supported ids.
- Registry spec proves typescript resolution is byte-identical in classification to the core contract on a fixture tree.
- Classifies at minimum: module (*.py), package-marker (__init__.py), test (test_*.py / *_test.py / tests/ dir), config (pyproject.toml/setup.cfg handled as config role for .py-adjacent scan), script (scripts/ dir), entry (__main__.py), generated (*_pb2.py).
- Spec runs the profile over an in-memory fixture repo and asserts per-role counts + unmatched list.
- Classifies at minimum: module (*.rs), module-root (mod.rs), crate-entry (main.rs/lib.rs), test (tests/ dir + *_test.rs), build-script (build.rs), example (examples/ dir), bench (benches/ dir).
- Spec over an in-memory fixture crate asserts counts + unmatched.
- Classifies at minimum: module (*.go), test (*_test.go), entry (main.go / cmd/ dir), internal (internal/ dir), generated (*.pb.go / *_gen.go), vendor skipped like node_modules.
- Spec over an in-memory fixture module asserts counts + unmatched.
- conventions_check + conventions_classify gain optional profile: 'typescript'|'python'|'rust'|'go' (default typescript); scan filters by the profile's fileExtensions instead of hardcoded .ts/.tsx.
- Omitting profile is byte-identical to today's behaviour on this repo (regression, per the parked gate).
- outputSchema updated; bun run types:generate clean; README documents the profiles.
