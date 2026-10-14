---
id: f00759
title: "one answer to which machine this is, and where its editors keep their files"
kind: feat
status: review
type: proposal
track: general
date: 2026-10-13
last-transition-id: 9505f630-8fe4-4558-8ad9-86476ee9db03
last-correlation-id: 9505f630-8fe4-4558-8ad9-86476ee9db03
last-transition-from: in-progress
last-transition-at: 2026-10-13T23:19:42.440Z
shipped-in:
  - "e6c2e5ac0c56"
---

# f00759 — one answer to which machine this is, and where its editors keep their files

## goal

Every place delendai needs the operating system, WSL, the home directory or an editor's user directory asks one machine profile, so a machine is classified one way everywhere and a new platform or editor location is taught once.

## why

Extracted from f00542 S3 (which stays paused): the owner asks that delendai be agnostic of host, IDE, LLM and runtime, and the part of f00542 that pays off today is one place that knows the machine.

What the code does today:

1. **Three WSL detectors.** `platform/system-profile.helper.ts` (`isWslEnvironment`: `WSL_DISTRO_NAME`/`WSL_INTEROP`, then `/proc/version`) is the careful one. `cli/run-init.ts` and `packages/cli/src/commands/init/init-global.command.ts` each read `/proc/version` again with their own regex. Init decides where editor configurations go from the second answer.
2. **Two maps of the editors' directories.** `install/ide-targets.ts` resolves each editor's configuration from `home`/`appData`. `work-identity/host-chat-model.helper.ts` (`hostUserDirs`) derives the same roots again from `process.platform`, and is the only one that looks at the Windows side of a WSL machine (`/mnt/c/Users/*/AppData/Roaming`). Under WSL, `init` writes the Linux-side paths while the editor runs on Windows.
3. **26 `process.platform` reads in 18 product files**, each one a small classification of its own.

## non-goals

- Abstracting every path join: `node:path` already is the portable layer.
- Platforms delendai does not run on (BSD support, native Windows services).
- Changing what any platform does; only where the answer comes from.

## slices

- global_gate: type

### S1 — One detection of the operating system and WSL

- **Status**: done
- **Files**:
  - `packages/core/src/lib/platform/system-profile.helper.ts`
  - `packages/core/src/lib/cli/run-init.ts`
  - `packages/cli/src/commands/init/init-global.command.ts`
  - `packages/core/src/cli.ts`
  - `packages/core/tests/src/lib/cli/run-init.spec.ts`
  - `packages/cli/src/commands/init/init-global.command.spec.ts`
- **Gate**: type
- acceptance:
  - `run-init.ts` and `init-global.command.ts` take WSL from the system profile; no product file outside `platform/` reads `/proc/version`.
  - A WSL shell that sets `WSL_DISTRO_NAME` but whose `/proc/version` says nothing is WSL to init as it is to the profile.
- shipped-in: `dee6e54e1a7d`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at e6c2e5ac0c56, validate exit 0, tests 1/1 — Approving e6c2e5ac0c56, the commit the supersede guard names (the merge of PR #1071 where all six declared files land; the slice's own dee6e54e1 carries 4 of 6). Gate `type`: `bun run typecheck` exits 0. ACC0 is the "one detector" claim and the enforcement is the part worth checking: `git grep -l '/proc/version' -- '*.ts'` returns exactly one product file — packages/core/src/lib/platform/system-profile.helper.ts — plus the baseline file, its own spec and the lint script. The lint that holds the line is green from my worktree: `bun run lint:platform-reads` → '✓ platform-reads: no platform question outside packages/core/src/lib/platform/ beyond the baseline.' run-init.ts and init-global.command.ts each sit in the baseline at one read, which is the residue this slice leaves — I describe it that way rather than implying the slice erased them, because "no product file outside platform/ reads /proc/version" is the criterion's wording and the baseline is exactly the honest mechanism that makes the wording enforceable over time. ACC1 I read rather than assumed: system-profile.helper.ts:61-67 returns true as soon as `WSL_DISTRO_NAME !== undefined || WSL_INTEROP !== undefined` on a linux family, and only falls through to `/microsoft|wsl/i` against procVersion when neither variable is set — so a shell exporting WSL_DISTRO_NAME with a procVersion that says nothing, or an unreadable one (readProcVersion swallows the error and yields undefined at :79-85), is still WSL. That is precisely the criterion's case. The header at :70-75 states the defect being fixed: "init and the global install each read /proc/version with a regex of their own, so a shell that sets WSL_DISTRO_NAME and a stripped one could be told apart differently by each" — which is why one detector, not two regexes. Evidence 1/1 is the platform-reads gate this proposal introduces.

### S2 — The editors' user directories come from one resolver, the Windows side of WSL included

- **Status**: review
- **Files**:
  - `packages/core/src/lib/platform/user-directories.helper.ts`
  - `packages/core/src/lib/install/ide-targets.ts`
  - `packages/core/src/lib/work-identity/host-chat-model.helper.ts`
  - `packages/core/tests/src/lib/platform/user-directories.helper.spec.ts`
  - `packages/core/src/lib/scan/dip-violation.ts`
  - `packages/core/tests/src/lib/scan/dip-violation.spec.ts`
- **Gate**: type
- acceptance:
  - One helper returns the user-configuration roots of this machine (`APPDATA`, `~/Library/Application Support`, `XDG_CONFIG_HOME`, and under WSL the Windows users' `AppData/Roaming`), honouring the existing `DELENDAI_HOST_USER_DIRS` override.
  - `ide-targets.ts` and `hostUserDirs` read it. Under WSL, Claude Desktop, which runs on Windows, gets its configuration in the Windows user's `AppData/Roaming` instead of the Linux home it never reads.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `a369e1b8bfd1`

### S3 — A platform question asked outside the profile is refused by a lint

- **Status**: review
- **Files**:
  - `tools/scripts/lint/platform-reads.script.ts`
  - `tools/scripts/lint/platform-reads.constant.ts`
  - `tools/scripts/lint/platform-reads.baseline.json`
  - `tools/scripts/lint/platform-reads.script.spec.ts`
  - `package.json`
- **Gate**: type
- acceptance:
  - `lint:platform-reads`, chained into `lint:architecture`, fails on `process.platform`, `os.platform()` or `/proc/version` in product code outside `platform/` beyond a per-file baseline of today's reads, which may only shrink (16 files, after S1 and S2).
  - The reads S1 and S2 replace are gone from the baseline.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `baffcd376c20`

## acceptance

- WSL and the operating system are decided in one module, and every caller agrees with it.
- Under WSL, `init` and the model observer look at the same editor directories.
- The number of platform reads outside `platform/` only goes down, enforced in CI.
