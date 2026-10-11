---
id: c00125
title: "lint:solid-compliance — enforce the new §6 invariant"
kind: chore
status: done
type: proposal
track: general
date: 2026-07-26
shipped-in: ["25c792779f9f36712e1636e187f39c3fac48ca9e"]
---

# c00125 — lint:solid-compliance — enforce the new §6 invariant

## Goal

Add a `lint:solid-compliance` script that enforces the new §6 / §7.1 #12
invariant (c00124) with a small, hermetic rule set: long `switch` /
`if-else` chains over plugin/tool/enum IDs routed to registries instead;
oversized files; cross-plugin logic duplication; swallowed errors; magic
numbers. The script is pure (`walk → engine → report`), exits 0 when
clean, 1 when findings exist, and is wired into the `lint:solid` npm
script.

## Why

The §6 invariant is non-negotiable in narrative form, but narrative
rules decay without enforcement. The repo already has ~30 lightweight
lints under `tools/scripts/lint/*.script.ts` with the canonical pattern
(`walk → pure engine → report`, hermetic, fast). A small solid-compliance
lint extends that pattern with the same shape so it is on the same
level as `lint:file-conventions`, `lint:bootstrap-canonical`,
`lint:no-shell-python`, etc.

## Non-goals

- Re-implement a full TS language server or run typescript-eslint. The
  lint stays heuristic + regex-based, fast (< 500 ms on the whole repo),
  no AST dependencies.
- Cover every SOLID principle exhaustively. SRP/OCP/LSP/ISP/DIP have
  rules that admit automatic checking (Liskov is type-only, DIP is a
  wiring intent — both out of scope for a heuristic lint).
- Auto-fix any finding. The lint is advisory (warn level by default);
  the agent chooses the fix.

## Slices

- global_gate: lint

### S1 — Implement tools/scripts/lint/solid-compliance.script.ts + .spec.ts + npm script
- **Status**: done
- **Files**: `tools/scripts/lint/solid-compliance.script.ts`, `tools/scripts/lint/solid-compliance.script.spec.ts`, `package.json`
- **Gate**: lint
- acceptance:
  - "`tools/scripts/lint/solid-compliance.script.ts` exists and follows the canonical pattern (`walkAndClassify → report → exit 0/1`); engine logic exported and pure for testing."
  - "Rule set covers: (a) long `switch`/`if-else` chains (≥ 5 cases) over plugin/tool/enum identifiers in `plugins/*` and `packages/core/src/lib/`; (b) oversized files (> 400 lines) flagged for review; (c) syntactic duplication via shingle hash (≥ 3 plugins importing the same util from `packages/core/src/public/` is a positive signal, not a finding); (d) `catch {}` swallowing patterns; (e) flagged magic numbers in `plugins/*` (literal numerics without named const declaration in the same file)."
  - "`tools/scripts/lint/solid-compliance.script.spec.ts` exists with at least 4 unit tests pinning the engine: clean fixture, switch-chain detection, file-size flag, magic-number flag. Each test is hermetic (no I/O on the real repo)."
  - "`package.json` exposes `lint:solid` running the new script."
  - "`bun tools/scripts/lint/solid-compliance.script.ts` exit 0 on a clean fixture and exit 1 on a fixture with one violation."
  - "`bun test tools/scripts/lint/solid-compliance.script.spec.ts` exit 0 with all tests passing."
  - "`bun run lint:bootstrap-canonical` exit 0 (no regression to neighbours)."
  - "Faux-pas audit: no changes outside the 3 files listed (no `git mv`, no `package.json` bumping, no version files)."

## Acceptance

- `tools/scripts/lint/solid-compliance.script.ts` exists and follows the
  canonical pattern (`walkAndClassify → report → exit 0/1`); engine
  logic exported and pure for testing.
- Rule set covers: (a) long `switch`/`if-else` chains (≥ 5 cases) over
  plugin/tool/enum identifiers in `plugins/*` and `packages/core/src/lib/`;
  (b) oversized files (> 400 lines) flagged for review; (c) syntactic
  duplication via shingle hash (≥ 3 plugins importing the same util from
  `packages/core/src/public/` is a positive signal, not a finding); (d)
  `catch {}` swallowing patterns; (e) flagged magic numbers in
  `plugins/*` (literal numerics without named const declaration in the
  same file).
- `tools/scripts/lint/solid-compliance.script.spec.ts` exists with at
  least 4 unit tests pinning the engine: clean fixture, switch-chain
  detection, file-size flag, magic-number flag. Each test is hermetic
  (no I/O on the real repo).
- `package.json` exposes `lint:solid` running the new script.
- `bun tools/scripts/lint/solid-compliance.script.ts` exit 0 on a clean
  fixture and exit 1 on a fixture with one violation.
- `bun test tools/scripts/lint/solid-compliance.script.spec.ts` exit 0
  with all tests passing.
- `bun run lint:bootstrap-canonical` exit 0 (no regression to neighbours).
- Faux-pas audit: no changes outside the 3 files listed (no `git mv`,
  no `package.json` bumping, no version files).
