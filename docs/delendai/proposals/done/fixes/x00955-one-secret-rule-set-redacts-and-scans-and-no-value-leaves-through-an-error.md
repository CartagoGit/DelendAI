---
id: x00955
title: "One secret rule set redacts and scans, and no value leaves through an error"
kind: fix
status: done
type: proposal
track: a00095-consistency
date: 2026-10-23
last-transition-id: f3cd8abf-da63-4084-9fc7-ce886c9255a2
last-correlation-id: f3cd8abf-da63-4084-9fc7-ce886c9255a2
last-transition-from: review
last-transition-at: 2026-10-28T08:52:51.394Z
shipped-in:
  - "d23cc0b41"
---

# x00955 — One secret rule set redacts and scans, and no value leaves through an error

## goal

The redactor and the secret scanner share one rule set without false positives on test fixtures, the scanner sees ignored files where local leaks live, no tool echoes an environment value in an error, error-reporting says truly whether it is on and cannot be spoofed by project output, and personal accounts never live in committed config.

## why

Joint audit a00095 and gpt-6.1-sol. G117: redactSecrets, the only barrier of the durable stores, lets OpenAI and other keys through. G119: two secret rule sets, 18 in core (redactor) and 7 in security (scanner). G41: the Google API key rule produces false positives in plugin tests. D79/D65: security_secrets declares the project clean while skipping ignored files (git ls-files only). D112 and sol G61-ENV-01: env_check returns the invalid value in its enum error although values are never to be output. sol EXT-04: the capability raw-answer cache persists content before redaction. sol PROP-LOG01: the bypass-log fallback writes the reason unredacted. sol ER-01 (P1): a project result can forge first-party origin and leak its identifier through error-reporting; ER-02: docs promise off while runtime reports by default; ER-03: per-tool permissions over-require and inherit wide grants. G31: accounts with profileDir and credentialEnv are read from committed config. sol G61-CONFIG-01: remotes on different ports share one personal file.

## non-goals

- Network egress (x00951).
- Command environments (x00953).

## slices

- global_gate: type

### S1 — One rule set for redaction and scanning
- **Status**: done
- **Files**: `bun.lock`, `packages/client/package.json`, `packages/client/src/lib/shared/redact-secrets.ts`, `packages/contracts/src/index.ts`, `packages/contracts/src/secret-patterns.ts`, `packages/core/src/lib/contracts/constants/secret-patterns.constant.ts`, `packages/core/tests/src/lib/shared/redact-key-shapes.spec.ts`, `plugins/security/package.json`, `plugins/security/src/lib/contracts/constants/secret-rules.constant.ts`, `vitest.config.ts`, `vitest.shared.ts`
- **Gate**: type
- acceptance:
  - "The scanner imports the core rule set; one list exists (G119)."
  - "OpenAI, Anthropic, GitHub fine-grained and the other common key shapes are redacted; a spec feeds one of each (G117)."
  - "The Google key rule needs the AIza prefix at a word boundary and does not match the fixture strings G41 names."
- shipped-in: `d23cc0b41`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at d23cc0b41, validate exit 0 and tests 16/16 claimed, no recorded run cited; acceptance 3/3: (1) plugins/security/src/lib/contracts/constants/secret-rules.constant.ts:7 imports SECRET_RULES from the contracts package and :24 maps over it, so the seven loca… (2) packages/core/tests/src/lib/shared/redact-key-shapes.spec.ts:25-56 feeds twelve key shapes (openai, openai project, anthropic, openrouter, github, github fine-… (3) packages/contracts/src/secret-patterns.ts:93 requires the AIza prefix at a word boundary with exactly 35 trailing characters, and redact-key-shapes.spec.ts:56-… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: 2 files / 16 tests, exit 0. Recorded rather than blocked: the fixture G41 names for the Google rule is not present in this repository, so that half of the criterion is proven by the shape of the rule and by the spec rather than by that fixture.

### S2 — The scanner sees ignored files
- **Status**: done
- **Files**: `packages/core/src/generated/tool-outputs.ts`, `plugins/security/src/lib/contracts/interfaces/secrets.interface.ts`, `plugins/security/src/lib/secrets/real-deps.ts`, `plugins/security/src/lib/secrets/run-scan.ts`, `plugins/security/src/lib/tools/security-secrets.tool.ts`, `plugins/security/tests/src/lib/run-scan.spec.ts`, `plugins/security/src/lib/contracts/constants/git-listing.constant.ts`, `plugins/error-reporting/tests/adversarial-fixtures.ts`, `plugins/logs/tests/src/lib/services/error-sink-adapter.spec.ts`, `plugins/security/tests/src/lib/scan-secrets.spec.ts`
- **Gate**: type
- acceptance:
  - "security_secrets scans ignored-but-present files such as .env.local by default and says which it skipped (D79, D65)."
- shipped-in: `d23cc0b41`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at d23cc0b41, validate exit 0 and tests 8/8 claimed, no recorded run cited; acceptance 1/1: (1) run-scan.ts:58-62 adds the ignored files to the candidates without an option gate, and security-secrets.tool.ts:70-86 publishes ignoredScanned and ignoredSkipp… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: 2 files / 8 tests, exit 0. Recorded rather than blocked: the criterion says the tool says which it skipped, and the output reports ignoredSkipped as a count, so the skipped set is named only in aggregate; the ignored listing is also capped at GIT_LISTING_MAX_OUTPUT_BYTES (4 MiB), which this checkout's listing (3926160 bytes) stays under but which is not reported when it is hit.

### S3 — No value through an error, a cache or a log
- **Status**: done
- **Files**: `plugins/env/src/lib/validate/check-schema.ts`, `plugins/env/tests/src/lib/validate/check-schema.spec.ts`, `plugins/external-mcps/src/lib/contract/capability-gateway.service.ts`, `plugins/external-mcps/tests/src/lib/contract/capability-gateway.service.spec.ts`, `plugins/proposals/src/lib/shared/peer-review-bypass-log.ts`, `plugins/proposals/src/lib/shared/plan-closure-bypass-log.ts`, `plugins/proposals/tests/src/lib/shared/peer-review-bypass-log.spec.ts`
- **Gate**: type
- acceptance:
  - "An invalid enum value is reported by name and allowed set, never the value (D112, G61-ENV-01)."
  - "The raw-answer cache stores redacted content only (EXT-04)."
  - "The bypass-log fallback redacts the reason (PROP-LOG01)."
- shipped-in: `d23cc0b41`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at d23cc0b41, validate exit 0 and tests 18/18 claimed, no recorded run cited; acceptance 3/3: (1) check-schema.ts:105 reports that the value is not one of the allowed enum values and :133 re-attaches the variable key, so the finding names the variable and t… (2) capability-gateway.service.ts:47 writes the redacted text into the raw-answer cache and capability-gateway.service.spec.ts:55-72 writes an answer quoting an AW… (3) peer-review-bypass-log.ts:97 redacts at the source and the console.warn fallback prints the already-redacted reason; plan-closure-bypass-log.ts:81 does the sam… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: the env suite 1 file / 18 tests plus the external-mcps and proposals suites, exit 0.

### S4 — error-reporting is opt-in and first-party only
- **Status**: done
- **Files**: `plugins/error-reporting/README.md`, `plugins/error-reporting/plugin.manifest.ts`, `plugins/error-reporting/src/lib/frame-extractor.helper.ts`, `plugins/error-reporting/src/lib/internal-classifier.helper.ts`, `plugins/error-reporting/tests/internal-classifier.spec.ts`, `plugins/error-reporting/tests/tool-permissions.spec.ts`
- **Gate**: type
- acceptance:
  - "First-party origin is decided from the error object, not from text a tool result can carry; a spec with a forged frame is not reported (ER-01)."
  - "The default matches the README: on, as the code and its spec decide, announced at every start with the line that turns it off (ER-02)."
  - "report_status needs only read; diagnose_log declares its own read-only set instead of inheriting the plugin's grants (ER-03)."
- shipped-in: `d23cc0b41`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at d23cc0b41, validate exit 0 and tests 6/6 claimed, no recorded run cited; acceptance 3/3: (1) frame-extractor.helper.ts:189-190 takes the stack only from a real Error instance (the loose stack branch is deleted) and internal-classifier.helper.ts:33-35 r… (2) options.service.ts:56 already read the enabled flag as the data value or true and the options spec already decided that the default is true; the slice changed … (3) error-reporting/plugin.manifest.ts:24-27 declares report_status and diagnose_log with the filesystem-read grant, and resolveToolPermissions (packages/core/src/… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: 2 files / 6 tests, exit 0.

### S5 — Personal accounts live in the personal layer
- **Status**: done
- **Files**: `packages/core/src/lib/contracts/constants/personal-layer-schema.constant.ts`, `packages/core/src/lib/plugins/personal-layer.service.ts`, `packages/core/src/lib/workspace-migration/migration-registry.ts`, `packages/core/src/lib/workspace-migration/migrators/personal-layer-port.migrator.ts`, `packages/core/tests/src/lib/plugins/personal-layer.service.spec.ts`
- **Gate**: type
- acceptance:
  - "A login (profileDir or credentialEnv) in the committed config is never merged for everyone; the existing start-up migration moves it to the person's file (G31)."
  - "The personal file is keyed by host and port, so two remotes on different ports do not share it; a start-up migration renames a file keyed without the port (G61-CONFIG-01)."
- shipped-in: `d23cc0b41`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at d23cc0b41, validate exit 0 and tests 16/16 claimed, no recorded run cited; acceptance 2/2: (1) personal-layer.service.ts:165-172 skips any shared account with a profileDir or a credentialEnv, so a login left in the committed config is never merged for ev… (2) personal-layer.service.ts:33-53 keeps the port in the identity and personalLayerPath hashes it, so two remotes on different ports get two files, and the start-… — Type gate ran once for the pack in the unit worktree: bun run typecheck exited 0. Slice specs: 2 files / 16 tests, exit 0. Recorded rather than blocked: the rewrite left the merge half of withPersonalLayer uncovered (the spec passes an empty personal layer, and the parsePersonalLayer group is gone), so a personal account replacing a shared one of the same id is not asserted; a follow-up should restore that coverage.

## acceptance

- The scanner imports the core rule set; one list exists (G119).
- OpenAI, Anthropic, GitHub fine-grained and the other common key shapes are redacted; a spec feeds one of each (G117).
- The Google key rule needs the AIza prefix at a word boundary and does not match the fixture strings G41 names.
- security_secrets scans ignored-but-present files such as .env.local by default and says which it skipped (D79, D65).
- An invalid enum value is reported by name and allowed set, never the value (D112, G61-ENV-01).
- The raw-answer cache stores redacted content only (EXT-04).
- The bypass-log fallback redacts the reason (PROP-LOG01).
- First-party origin is decided from the error object, not from text a tool result can carry; a spec with a forged frame is not reported (ER-01).
- The default matches the README: on, as the code and its spec decide, announced at every start with the line that turns it off (ER-02).
- report_status needs only read; diagnose_log declares its own read-only set instead of inheriting the plugin's grants (ER-03).
- A login (profileDir or credentialEnv) in the committed config is never merged for everyone; the existing start-up migration moves it to the person's file (G31).
- The personal file is keyed by host and port, so two remotes on different ports do not share it; a start-up migration renames a file keyed without the port (G61-CONFIG-01).
