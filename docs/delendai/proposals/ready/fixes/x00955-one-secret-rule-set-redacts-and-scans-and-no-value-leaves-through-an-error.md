---
id: x00955
title: "One secret rule set redacts and scans, and no value leaves through an error"
kind: fix
status: ready
type: proposal
track: a00095-consistency
date: 2026-10-23
---

# x00955 — One secret rule set redacts and scans, and no value leaves through an error

## goal

The redactor and the secret scanner share one rule set without false positives on test fixtures, the scanner sees ignored files where local leaks live, no tool echoes an environment value in an error, error-reporting is off unless enabled and cannot be spoofed by project output, and personal accounts never live in committed config.

## why

Joint audit a00095 and gpt-6.1-sol. G117: redactSecrets, the only barrier of the durable stores, lets OpenAI and other keys through. G119: two secret rule sets, 18 in core (redactor) and 7 in security (scanner). G41: the Google API key rule produces false positives in plugin tests. D79/D65: security_secrets declares the project clean while skipping ignored files (git ls-files only). D112 and sol G61-ENV-01: env_check returns the invalid value in its enum error although values are never to be output. sol EXT-04: the capability raw-answer cache persists content before redaction. sol PROP-LOG01: the bypass-log fallback writes the reason unredacted. sol ER-01 (P1): a project result can forge first-party origin and leak its identifier through error-reporting; ER-02: docs promise off while runtime reports by default; ER-03: per-tool permissions over-require and inherit wide grants. G31: accounts with profileDir and credentialEnv are read from committed config. sol G61-CONFIG-01: remotes on different ports share one personal file.

## non-goals

- Network egress (x00951).
- Command environments (x00953).

## slices

- global_gate: type

### S1 — One rule set for redaction and scanning
- **Status**: pending
- **Files**: `packages/core/src/lib/contracts/constants/secret-patterns.constant.ts`, `packages/core/src/lib/shared/redact.ts`, `plugins/security/src/lib/contracts/constants/secret-rules.constant.ts`
- **Gate**: type
- acceptance:
  - "The scanner imports the core rule set; one list exists (G119)."
  - "OpenAI, Anthropic, GitHub fine-grained and the other common key shapes are redacted; a spec feeds one of each (G117)."
  - "The Google key rule needs the AIza prefix at a word boundary and does not match the fixture strings G41 names."

### S2 — The scanner sees ignored files
- **Status**: pending
- **Files**: `plugins/security/src/lib/secrets/real-deps.ts`, `plugins/security/src/lib/secrets/run-scan.ts`, `plugins/security/src/lib/tools/security-secrets.tool.ts`
- **Gate**: type
- acceptance:
  - "security_secrets scans ignored-but-present files such as .env.local by default and says which it skipped (D79, D65)."

### S3 — No value through an error, a cache or a log
- **Status**: pending
- **Files**: `plugins/env/src/lib/validate/check-schema.ts`, `plugins/env/src/lib/tools/env-check.tool.ts`, `plugins/env/src/index.ts`, `plugins/external-mcps/src/lib/contract/capability-gateway.service.ts`, `plugins/external-mcps/src/lib/normalize/normalize-response.service.ts`, `plugins/proposals/src/lib/shared/peer-review-bypass-log.ts`, `plugins/proposals/src/lib/shared/plan-closure-bypass-log.ts`
- **Gate**: type
- acceptance:
  - "An invalid enum value is reported by name and allowed set, never the value (D112, G61-ENV-01)."
  - "The raw-answer cache stores redacted content only (EXT-04)."
  - "The bypass-log fallback redacts the reason (PROP-LOG01)."

### S4 — error-reporting is opt-in and first-party only
- **Status**: pending
- **Files**: `plugins/error-reporting/src/index.ts`, `plugins/error-reporting/src/lib/frame-extractor.helper.ts`, `plugins/error-reporting/src/lib/internal-classifier.helper.ts`, `plugins/error-reporting/src/lib/report-builder.helper.ts`, `plugins/error-reporting/src/lib/options.service.ts`, `plugins/error-reporting/src/lib/startup-notice.helper.ts`, `plugins/error-reporting/plugin.manifest.ts`, `plugins/error-reporting/README.md`, `plugins/error-reporting/src/lib/tools/diagnose-log.tool.ts`, `plugins/error-reporting/src/lib/tools/report-status.tool.ts`, `packages/core/src/lib/contracts/interfaces/plugin-tool-permissions.interface.ts`
- **Gate**: type
- acceptance:
  - "First-party origin is decided from the error object, not from text a tool result can carry; a spec with a forged frame is not reported (ER-01)."
  - "The default matches the README; the start-up notice states it (ER-02)."
  - "report_status needs only read; diagnose_log does not inherit report grants (ER-03)."

### S5 — Personal accounts live in the personal layer
- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/account-registry.helper.ts`, `packages/core/src/lib/plugins/personal-layer.service.ts`
- **Gate**: type
- acceptance:
  - "accounts are read from the personal layer only and a committed config carrying them is refused with a migration (G31)."
  - "The personal file is keyed by host and port, so two remotes on different ports do not share it (G61-CONFIG-01)."

## acceptance

- The scanner imports the core rule set; one list exists (G119).
- OpenAI, Anthropic, GitHub fine-grained and the other common key shapes are redacted; a spec feeds one of each (G117).
- The Google key rule needs the AIza prefix at a word boundary and does not match the fixture strings G41 names.
- security_secrets scans ignored-but-present files such as .env.local by default and says which it skipped (D79, D65).
- An invalid enum value is reported by name and allowed set, never the value (D112, G61-ENV-01).
- The raw-answer cache stores redacted content only (EXT-04).
- The bypass-log fallback redacts the reason (PROP-LOG01).
- First-party origin is decided from the error object, not from text a tool result can carry; a spec with a forged frame is not reported (ER-01).
- The default matches the README; the start-up notice states it (ER-02).
- report_status needs only read; diagnose_log does not inherit report grants (ER-03).
- accounts are read from the personal layer only and a committed config carrying them is refused with a migration (G31).
- The personal file is keyed by host and port, so two remotes on different ports do not share it (G61-CONFIG-01).
