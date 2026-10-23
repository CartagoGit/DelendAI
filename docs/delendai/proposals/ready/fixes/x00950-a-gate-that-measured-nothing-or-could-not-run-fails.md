---
id: x00950
title: "A gate that measured nothing, or could not run, fails"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# x00950 — A gate that measured nothing, or could not run, fails

## goal

No gate passes over an empty scan root, a missing tool, a failed subprocess or a report-only mode: the security, wiring, tools, link and proposal-file gates fail loudly, a C0 control byte in a source literal is rejected, and one lint owns each fact.

## why

Joint audit a00095. G153: the wiring gate is wired as `--report`, which cannot fail; 4 of 58 plugins are unwired. G154: security.script.ts resolves the repo root one level too high, so the leak gate scans the wrong tree. G155: the security baseline points at a path nothing creates; the `skipped` branch is the one that runs. G156: a failed `bun audit` becomes 'zero vulnerabilities' reported as skipped. G157: verify:tools exits 0 after discovering zero plugins. G61: no CI linter rejects C0 control bytes in string literals (G60 found a NUL in a prompt). G40: plugins/link-check is not wired into CI lint nor validate, despite D14's 16 broken links. G26: proposal-files-exist and proposal-slice-completeness check the same fact with two baselines. D13: the web pages audit is decorative and web manifest drift is not caught in PRs. The orchestrator also measured 33 lints that exit 0 over an empty scan root, which no-silent-gates does not cover.

## non-goals

- Fixing what the gates find once they are loud (each finding's own proposal).
- verify:tools' error-path validation (x00939).

## slices

- global_gate: type

### S1 — An empty scan root or zero discoveries is a failure
- **Status**: pending
- **Files**: `tools/scripts/lint/no-silent-gates.script.ts`, `tools/scripts/lint/no-silent-gates.script.spec.ts`
- **Gate**: type
- acceptance:
  - "no-silent-gates runs each lint against an empty fixture root and fails for every lint that exits 0 having scanned nothing; the 33 lints it finds today either print and fail on zero inputs or are listed with a reason."
  - "verify:tools with zero discovered plugins exits non-zero (G157) — covered by the same check."

### S2 — The security gate scans the repo and fails when it cannot
- **Status**: pending
- **Files**: `tools/scripts/verify/security.script.ts`
- **Gate**: type
- acceptance:
  - "The repo root resolves to the checkout; a spec plants a fake key in a fixture tree and the gate fails (G154)."
  - "A missing baseline and a failed or unparsable bun audit fail the gate with the cause, instead of `skipped` (G155, G156)."

### S3 — Wiring, links and control bytes are enforced in CI
- **Status**: pending
- **Files**: `tools/scripts/verify/plugin-wiring.script.ts`, `tools/scripts/lint/no-control-bytes.script.ts`, `tools/scripts/lint/no-control-bytes.script.spec.ts`, `plugins/link-check/src/lib/link-check/check-links.ts`, `package.json`
- **Gate**: type
- acceptance:
  - "validate:run calls verify:plugin-wiring without --report, with the four unwired plugins wired or listed in a reviewed allowlist (G153)."
  - "A new lint rejects any C0 byte other than tab/newline inside source string literals and runs in CI (G61)."
  - "A link-check script over the root docs runs in a CI-run chain and fails on a broken internal link (G40)."

### S4 — One lint per fact, and the web audit gates
- **Status**: pending
- **Files**: `tools/scripts/lint/proposal-files-exist.script.ts`, `tools/scripts/lint/proposal-files-exist.baseline.json`, `tools/scripts/lint/proposal-slice-completeness.script.ts`, `tools/scripts/lint/proposal-slice-completeness.baseline.json`, `apps/web/src/data/pages-audit.ts`, `apps/web/src/data/pages-audit.spec.ts`
- **Gate**: type
- acceptance:
  - "Only one of the two proposal-file lints checks that a slice's Files exist; the other is narrowed to what it alone checks, and one baseline remains (G26)."
  - "The pages audit fails a PR whose web manifest drifted from the pages it describes (D13)."

## acceptance

- no-silent-gates runs each lint against an empty fixture root and fails for every lint that exits 0 having scanned nothing; the 33 lints it finds today either print and fail on zero inputs or are listed with a reason.
- verify:tools with zero discovered plugins exits non-zero (G157) — covered by the same check.
- The repo root resolves to the checkout; a spec plants a fake key in a fixture tree and the gate fails (G154).
- A missing baseline and a failed or unparsable bun audit fail the gate with the cause, instead of `skipped` (G155, G156).
- validate:run calls verify:plugin-wiring without --report, with the four unwired plugins wired or listed in a reviewed allowlist (G153).
- A new lint rejects any C0 byte other than tab/newline inside source string literals and runs in CI (G61).
- A link-check script over the root docs runs in a CI-run chain and fails on a broken internal link (G40).
- Only one of the two proposal-file lints checks that a slice's Files exist; the other is narrowed to what it alone checks, and one baseline remains (G26).
- The pages audit fails a PR whose web manifest drifted from the pages it describes (D13).
