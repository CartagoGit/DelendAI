---
id: x00934
title: "An ACP agent's archive is unpacked without a shell, under a name delendai chose"
kind: fix
status: in-progress
type: proposal
track: security
date: 2026-10-22
last-transition-id: f9097922-e651-4f27-a6b5-202681841a6e
last-correlation-id: f9097922-e651-4f27-a6b5-202681841a6e
last-transition-from: ready
last-transition-at: 2026-10-22T17:27:50.948Z
---

# x00934 — An ACP agent's archive is unpacked without a shell, under a name delendai chose

## goal

`installAgentBinary` unpacks a verified registry archive by running `tar` or `unzip` with an argument list, under a file name delendai fixes, so no value from the registry ever reaches a shell; the three code-scanning alerts it carries on develop close, and the 0.2.0 promotion is unblocked.

## why

The 0.2.0 promotion (#1366) failed `release-pr-gate`: `promotion-alerts` found three CodeQL alerts open on develop, all in `packages/core/src/lib/shared/declared-agents.service.ts` (f00783): #453 and #454 js/shell-command-constructed-from-input at :170-171, #455 js/http-to-file-access at :168.

The first two are real. The archive's file name is the last path part of the registry's `archive` URL, and it and the install directory are interpolated into `unzip -o -q '<archive>' -d '<dir>'` or `tar -xf '<archive>' -C '<dir>'`, run by `runClientCommand` through `/bin/bash -c`. The runner's own contract says it is for trusted catalogue command lines; a URL ending in `x';rm -rf ~;'.tar.gz` would break out of the quotes. The sha256 check before it does not help: a registry entry names its own hash.

The third flags the write of downloaded bytes to disk, which is what an installer does; the bytes are written only after their sha256 matches the one the registry publishes. With the shell gone and the name fixed, the write is to a path delendai chose, of bytes it verified; the alert is dismissed with that reason if CodeQL still raises it.

## non-goals

- Changing `runClientCommand`, which runs catalogue command lines and keeps its contract.
- Verifying signatures beyond the sha256 the registry publishes.

## slices

- global_gate: type

### S1 — The archive is unpacked by argv, under a fixed name
- **Status**: done
- **Files**: `packages/core/src/lib/shared/declared-agents.service.ts`, `packages/core/tests/src/lib/shared/declared-agents.service.spec.ts`
- **Gate**: type
- acceptance:
  - "`installAgentBinary` writes the verified bytes to `archive.zip` or `archive.tar` (with the URL's compression suffix kept only when it is one of a fixed list) inside the install directory, and runs `unzip` or `tar` through the shared argv runner (`runArgv` in `run-command.ts`, no shell) with the paths as separate arguments."
  - "A spec drives an archive URL whose last part carries quotes and a `;` and asserts the runner receives the fixed name as one argument and no shell is involved."
  - "CodeQL reports no js/shell-command-constructed-from-input in the file; js/http-to-file-access is either gone or dismissed with the reason that the bytes are written only after their published sha256 matches."

## acceptance

- `installAgentBinary` writes the verified bytes to `archive.zip` or `archive.tar` (with the URL's compression suffix kept only when it is one of a fixed list) inside the install directory, and runs `unzip` or `tar` through the shared argv runner (`runArgv` in `run-command.ts`, no shell) with the paths as separate arguments.
- A spec drives an archive URL whose last part carries quotes and a `;` and asserts the runner receives the fixed name as one argument and no shell is involved.
- CodeQL reports no js/shell-command-constructed-from-input in the file; js/http-to-file-access is either gone or dismissed with the reason that the bytes are written only after their published sha256 matches.
