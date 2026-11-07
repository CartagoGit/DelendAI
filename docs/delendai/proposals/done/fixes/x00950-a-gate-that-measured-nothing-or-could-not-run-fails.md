---
id: x00950
title: "A gate that measured nothing, or could not run, fails"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: 37d535e1-adb6-4b5c-aafe-d1147234c0da
last-correlation-id: 37d535e1-adb6-4b5c-aafe-d1147234c0da
last-transition-from: review
last-transition-at: 2026-10-28T07:58:10.482Z
shipped-in:
  - "1ee97d05727f11d9f5a4d124e01b59d1105f54b3"
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
- **Status**: done
- **Files**: `.github/workflows/ci.yml`, `package.json`, `tools/scripts/lint/architecture-readfile-via-safe-reader.script.ts`, `tools/scripts/lint/capabilities-declared.script.ts`, `tools/scripts/lint/check-adr-coverage.script.ts`, `tools/scripts/lint/check-agent-md.script.ts`, `tools/scripts/lint/check-ephemeral-paths.script.ts`, `tools/scripts/lint/cli-shape.script.ts`, `tools/scripts/lint/compat-window.script.ts`, `tools/scripts/lint/detail-levels-coverage.script.ts`, `tools/scripts/lint/effect-boundaries.script.ts`, `tools/scripts/lint/host-manifest-drift.script.ts`, `tools/scripts/lint/i18n-english-prose.script.ts`, `tools/scripts/lint/json-entry-collision.script.ts`, `tools/scripts/lint/lib/empty-root-probe.lib.spec.ts`, `tools/scripts/lint/lib/empty-root-probe.lib.ts`, `tools/scripts/lint/lib/scan-roots.lib.spec.ts`, `tools/scripts/lint/lib/scan-roots.lib.ts`, `tools/scripts/lint/manifest-vs-package.script.ts`, `tools/scripts/lint/manifest-vs-presets.script.ts`, `tools/scripts/lint/no-absolute-local-imports.script.ts`, `tools/scripts/lint/no-any.script.ts`, `tools/scripts/lint/no-control-bytes.script.ts`, `tools/scripts/lint/no-core-public-types-in-client.script.ts`, `tools/scripts/lint/no-duplicate-brand-hex.script.ts`, `tools/scripts/lint/no-duplicate-implementation.script.ts`, `tools/scripts/lint/no-global-git-config-in-tests.script.ts`, `tools/scripts/lint/no-internal-core-imports.script.ts`, `tools/scripts/lint/no-internal-imports.script.ts`, `tools/scripts/lint/no-node-imports-in-contracts.script.ts`, `tools/scripts/lint/no-proposal-id-comments-in-source.script.ts`, `tools/scripts/lint/no-silent-gates.empty-root-allowlist.json`, `tools/scripts/lint/no-silent-gates.script.ts`, `tools/scripts/lint/no-stdout-in-runtime.script.ts`, `tools/scripts/lint/plugin-physical-containment.script.ts`, `tools/scripts/lint/proposal-filename-canonical.script.ts`, `tools/scripts/lint/proposal-files-exist.script.ts`, `tools/scripts/lint/proposal-uniqueness.script.ts`, `tools/scripts/lint/repository-identity.script.ts`, `tools/scripts/lint/shared-ui-ratchet.script.ts`, `tools/scripts/lint/shell-is-bash.script.ts`, `tools/scripts/lint/single-frontmatter.script.ts`, `tools/scripts/lint/skill-coverage.script.ts`, `tools/scripts/lint/solid-compliance.script.ts`, `tools/scripts/lint/spec-timeout-undercut.script.ts`, `tools/scripts/lint/state-engine-purity.script.ts`, `tools/scripts/lint/state-telemetry-purity.script.ts`, `tools/scripts/lint/test-unsafe-casts.script.ts`, `tools/scripts/lint/test-zones-cover-projects.script.ts`, `tools/scripts/lint/tool-schema-shape.script.ts`, `tools/scripts/lint/type-naming.script.ts`, `tools/scripts/lint/types-in-contracts.script.ts`, `tools/scripts/lint/unregistered-tools.script.ts`, `tools/scripts/lint/web-absolute-api-urls.script.ts`, `tools/scripts/lint/workflow-command-duplication.script.ts`, `tools/scripts/lint/workflow-local-action-bootstrap.script.ts`, `tools/scripts/lint/workspace-deps-declared.script.ts`, `tools/scripts/verify/plugin-tool-verify.script.ts`
- **Gate**: type
- acceptance:
  - "no-silent-gates runs every lint the gate chains reach over a git tree holding only tools/ and fails each one that exits 0 there, unless an allowlist names it with the reason its surface is in that tree; the lints that passed over nothing refuse a missing scan root through one helper, and the host-manifest-drift run that compared nothing leaves the chains."
  - "verify:tools with zero discovered plugins exits non-zero with the cause (G157)."
- shipped-in: `25d07003fc50`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 1ee97d05727f, validate exit 0 and tests 19/19 claimed, no recorded run cited; acceptance 2/2: (1) empty-root-probe.lib.ts:60 runs each lint over a git tree holding only tools/ and fails the ones that exit 0 there, unless the reviewed allowlist names the lin… (2) plugin-tool-verify.script.ts:512-519 returns 1 with the cause 'verify:tools: no plugin was discovered under <root>/plugins; nothing was verified.'; running it … — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: 4 files / 19 tests, exit 0; bun run lint:architecture exits 0 and the two script runs above are green.

### S2 — The security gate scans the repo and fails when it cannot
- **Status**: done
- **Files**: `tools/scripts/verify/security.script.ts`, `tools/scripts/verify/security.baseline.json`, `plugins/security/tests/src/lib/tools/security-gate.spec.ts`
- **Gate**: type
- acceptance:
  - "The repo root resolves to the checkout; a spec plants a fake key in a fixture tree and the gate fails (G154)."
  - "A missing baseline and a failed or unparsable bun audit fail the gate with the cause, instead of `skipped` (G155, G156)."
- shipped-in: `78b875261b3d`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 1ee97d05727f, validate exit 0 and tests 6/6 claimed, no recorded run cited; acceptance 2/2: (1) security.script.ts resolves the repo root from the checkout (resolve of the here root three levels up) and the security-gate spec case 'resolves the checkout a… (2) The skipped state is gone from the result type; a missing baseline pushes 'No baseline at <path>' into the failures and returns ok false (security.script.ts:18… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice spec: 1 file / 6 tests, exit 0; bun run verify:security exits 0.

### S3 — Wiring, links and control bytes are enforced in CI
- **Status**: done
- **Files**: `.github/workflows/ci.yml`, `docs/PRIVACY.md`, `docs/delendai/ADOPTER-CONFIG-FOOTGUNS.md`, `docs/delendai/ADOPTER-SURFACE-MODE.md`, `docs/delendai/ARCHITECTURE.md`, `docs/delendai/CI-GATES.md`, `docs/delendai/CODE-MAP.md`, `docs/delendai/CROSS-IDE.md`, `docs/delendai/CROSS-PROJECT-SETUP.md`, `docs/delendai/DOCS-MANUAL-VS-GENERATED.md`, `docs/delendai/GOVERNANCE-BRANCH-PROTECTION.md`, `docs/delendai/IDE-EXTENSION.md`, `docs/delendai/README-DELENDAI.md`, `package.json`, `packages/core/src/lib/wip-engine/patch-digest.ts`, `plugins/prompts-pack/src/prompts/review-diff.ts`, `tools/scripts/lint/biome-baseline.script.spec.ts`, `tools/scripts/lint/doc-links.script.spec.ts`, `tools/scripts/lint/doc-links.script.ts`, `tools/scripts/lint/no-control-bytes.script.spec.ts`, `tools/scripts/lint/no-control-bytes.script.ts`, `tools/scripts/verify/plugin-wiring.allowlist.json`, `tools/scripts/verify/plugin-wiring.script.spec.ts`, `tools/scripts/verify/plugin-wiring.script.ts`, `packages/core/tests/src/lib/wip-engine/patch-digest.spec.ts`, `plugins/prompts-pack/src/prompts/review-diff.spec.ts`
- **Gate**: type
- acceptance:
  - "validate:run calls verify:plugin-wiring without --report, with the four unwired plugins wired or listed in a reviewed allowlist (G153)."
  - "A new lint rejects any C0 byte other than tab/newline inside source string literals and runs in CI (G61)."
  - "A link-check script over the root docs runs in a CI-run chain and fails on a broken internal link (G40)."
- shipped-in: `601342c2b3f6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 1ee97d05727f, validate exit 0 and tests 30/30 claimed, no recorded run cited; acceptance 3/3: (1) validate:run contains the plugin wiring verification without --report and the old advisory script is gone from package.json; the four unwired plugins (executio… (2) no-control-bytes.script.ts:22 rejects every C0 byte plus DEL over the tracked source files (:38) and reports the path, and it runs in the CI chain; bun run lin… (3) doc-links.script.ts checks the links of the root documents and returns 1 with the broken links listed, and it is in lint:architecture and therefore in CI; bun … — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: 6 files / 30 tests, exit 0, plus lint:doc-links and lint:no-control-bytes green.

### S4 — One lint per fact, and the web audit gates
- **Status**: done
- **Files**: `apps/web/package.json`, `apps/web/src/data/pages-audit.ts`
- **Gate**: type
- acceptance:
  - "Only one of the two proposal-file lints checks that a slice's Files exist; the other is narrowed to what it alone checks, so one baseline holds that fact (G26) — delivered earlier, in 64aa83743."
  - "The web build generates its manifests strictly, so a PR's site job fails on an undocumented tool or skill as main's does; pages-audit.spec fails a page tree that drifted from the audited inventory (D13)."
- shipped-in: `131dcb824033`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 1ee97d05727f, validate exit 0 and tests 4/4 claimed, no recorded run cited; acceptance 2/2: (1) 64aa83743 ('fix(lint): one check for a declared file') is an ancestor of this slice's shipped-in commit and removed the file-existence check from the other pro… (2) apps/web/package.json:11 makes the build run the strict manifest generation (gen:pages, gen-capabilities and gen:skills, each with --strict) and the root site … — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: the apps/web pages-audit suite 1 file / 4 tests plus the lint specs, exit 0.

## acceptance

- no-silent-gates runs every lint the gate chains reach over a git tree holding only tools/ and fails each one that exits 0 there, unless an allowlist names it with the reason its surface is in that tree; the lints that passed over nothing refuse a missing scan root through one helper, and the host-manifest-drift run that compared nothing leaves the chains.
- verify:tools with zero discovered plugins exits non-zero with the cause (G157).
- The repo root resolves to the checkout; a spec plants a fake key in a fixture tree and the gate fails (G154).
- A missing baseline and a failed or unparsable bun audit fail the gate with the cause, instead of `skipped` (G155, G156).
- validate:run calls verify:plugin-wiring without --report, with the four unwired plugins wired or listed in a reviewed allowlist (G153).
- A new lint rejects any C0 byte other than tab/newline inside source string literals and runs in CI (G61).
- A link-check script over the root docs runs in a CI-run chain and fails on a broken internal link (G40).
- Only one of the two proposal-file lints checks that a slice's Files exist; the other is narrowed to what it alone checks, so one baseline holds that fact (G26) — delivered earlier, in 64aa83743.
- The web build generates its manifests strictly, so a PR's site job fails on an undocumented tool or skill as main's does; pages-audit.spec fails a page tree that drifted from the audited inventory (D13).
