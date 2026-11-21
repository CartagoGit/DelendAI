---
id: f00759
title: "one answer to which machine this is, and where its editors keep their files"
kind: feat
status: done
type: proposal
track: general
date: 2026-10-13
last-transition-id: 22207884-2f58-42d2-b429-3a9d702776ee
last-correlation-id: 22207884-2f58-42d2-b429-3a9d702776ee
last-transition-from: review
last-transition-at: 2026-10-14T11:51:17.668Z
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

- **Status**: done
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
- shipped-in: `a369e1b8bfd1`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at e6c2e5ac0c56, validate exit 0, tests 4/4 — Approved at e6c2e5ac0c56 (the merge the supersede guard names; the slice's own a369e1b8b carries 2 of the 6 declared files). Gate `type`: `bun run typecheck` exits 0. ACC0: all four roots are resolved in one helper — user-directories.helper.ts:29-34 returns APPDATA (with an `AppData/Roaming` fallback) on win32, `~/Library/Application Support` on darwin and `ctx.xdgConfigHome ?? join(ctx.home, '.config')` on the rest, while :40-54 `windowsAppDataUnderWsl` enumerates `/mnt/c/Users`, filters a SYSTEM_PROFILES set and keeps only the `AppData/Roaming` directories that actually exist (returning [] when the users root is unreadable). The override the criterion names is honoured and defined exactly once: HOST_USER_DIRS_VARIABLE = 'DELENDAI_HOST_USER_DIRS' at host-chat-model.constant.ts:16. Spec run: packages/core user-directories.helper.spec.ts → 4 pass / 0 fail, the 4/4 above. ACC1 is the part worth reading rather than assuming, because "Claude Desktop runs on Windows" only matters if every consumer asks through the one helper: the WSL branch is wired at all three consumers — init-global.command.ts:117 and run-init.ts:81 both pass `windowsAppData: isWslHere() ? windowsAppDataUnderWsl() : []`, and host-chat-model.helper.ts:67 does the same via `...(isWslHere(env) ? windowsAppDataUnderWsl() : [])` — and the helper is re-exported from packages/core/src/cli.ts:216, so consumers read one implementation rather than re-deriving the roots. That is the criterion's substance: under WSL the Windows user's AppData/Roaming is searched instead of the Linux home that application never reads.

### S3 — A platform question asked outside the profile is refused by a lint

- **Status**: done
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
- shipped-in: `baffcd376c20`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at e6c2e5ac0c56, validate exit 0, tests 1/1 — Approved at e6c2e5ac0c56 (the merge the supersede guard names). This slice is the enforcement that makes S1/S2 hold, so I checked the wiring and the number rather than the intent. Chaining confirmed: package.json's `lint:architecture` runs `bun run lint:platform-reads` among its steps. Green: `bun run lint:platform-reads` → '✓ platform-reads: no platform question outside packages/core/src/lib/platform/ beyond the baseline.' The three patterns are exactly the criterion's three — `/\bprocess\.platform\b/u`, `/\bos\.platform\(\)/u`, `/['"`]\/proc\/version['"`]/u` in PLATFORM_READ_PATTERNS — and PRODUCT_SOURCE scans packages|plugins|extensions src while exempting specs, matching "product code". The baseline count is the detail the criterion pins: tools/scripts/lint/platform-reads.baseline.json holds exactly 16 files, which is the stated number after S1 and S2. On ACC1 I read the baseline rather than accepting the phrasing: run-init.ts and init-global.command.ts are each present at exactly 1 read. So the duplicates those two files used to carry (their own /proc/version regexes, per the S1 header) are gone, one baselined read remains on each, and the baseline may only shrink from here. I describe that as "gone from the baseline" in the sense the criterion means — the duplicated reads are what disappeared — and I would rather name the residue than imply the two files read nothing at all. Evidence 1/1 is the platform-reads gate, which is this slice.

## acceptance

- WSL and the operating system are decided in one module, and every caller agrees with it.
- Under WSL, `init` and the model observer look at the same editor directories.
- The number of platform reads outside `platform/` only goes down, enforced in CI.
