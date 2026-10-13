---
id: f00759
title: "one answer to which machine this is, and where its editors keep their files"
kind: feat
status: in-progress
type: proposal
track: general
date: 2026-10-13
last-transition-id: b4a1621d-9957-4f5f-9c6d-e45b4b8e1ad3
last-correlation-id: b4a1621d-9957-4f5f-9c6d-e45b4b8e1ad3
last-transition-from: ready
last-transition-at: 2026-10-13T23:02:05.003Z
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

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/platform/system-profile.helper.ts`
  - `packages/core/src/lib/cli/run-init.ts`
  - `packages/cli/src/commands/init/init-global.command.ts`
  - `packages/core/src/cli.ts`
- **Gate**: type
- acceptance:
  - `run-init.ts` and `init-global.command.ts` take WSL from the system profile; no product file outside `platform/` reads `/proc/version`.
  - A WSL shell that sets `WSL_DISTRO_NAME` but whose `/proc/version` says nothing is WSL to init as it is to the profile.

### S2 — The editors' user directories come from one resolver, the Windows side of WSL included

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/platform/user-directories.helper.ts`
  - `packages/core/src/lib/install/ide-targets.ts`
  - `packages/core/src/lib/work-identity/host-chat-model.helper.ts`
  - `packages/core/tests/src/lib/platform/user-directories.helper.spec.ts`
- **Gate**: type
- acceptance:
  - One helper returns the user-configuration roots of this machine (`APPDATA`, `~/Library/Application Support`, `XDG_CONFIG_HOME`, and under WSL the Windows users' `AppData/Roaming`), honouring the existing `DELENDAI_HOST_USER_DIRS` override.
  - `ide-targets.ts` and `hostUserDirs` read it. Under WSL, Claude Desktop, which runs on Windows, gets its configuration in the Windows user's `AppData/Roaming` instead of the Linux home it never reads.

### S3 — A platform question asked outside the profile is refused by a lint

- **Status**: pending
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

## acceptance

- WSL and the operating system are decided in one module, and every caller agrees with it.
- Under WSL, `init` and the model observer look at the same editor directories.
- The number of platform reads outside `platform/` only goes down, enforced in CI.
