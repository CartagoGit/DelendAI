---
id: x00159
title: "push-to-develop-discipline pre-push guard never actually fires (lefthook {3} template has no refspec on plain git push)"
kind: fix
status: done
type: proposal
track: git-hooks+ci-discipline+self-hosting
date: 2026-07-27
shipped-in:
    - ab803b83 # S1 — pre-push develop guard reads real STDIN, not the broken lefthook {3} template
    - bc70c0cd # S1 follow-up — wire use_stdin: true
    - 3a145a14 # S2 — make LEFTHOOK_BYPASS=1 real
---

# x00159 — push-to-develop-discipline pre-push guard never actually fires (lefthook {3} template has no refspec on plain git push)

## Goal

Fix the pre-push guard that is supposed to block direct `develop → origin/develop` pushes but never actually fires in the common case, because it reads the refspec from a lefthook argv template (`{3}`) that git's real pre-push hook contract never populates for a plain `git push` — the actual ref-update data only ever arrives on STDIN.

## why

Discovered live during this stabilization session: committing and pushing directly to `develop` (exactly the case f00086 says should be blocked) printed `✓ push-to-develop-discipline: ok` and the push went straight through. Reproduction showed the hook was invoked as `bun tools/scripts/lint/push-to-develop-discipline.script.ts origin git@github.com:CartagoGit/mcp-vertex.git "{3}"` — the third argument was the literal, unsubstituted lefthook placeholder text `"{3}"`, not a real refspec. Git's pre-push hook contract only ever passes `<remote name> <remote url>` on argv; every ref being pushed arrives as a STDIN line (`<local ref> <local oid> <remote ref> <remote oid>`). Because lefthook has no refspec to substitute for a plain push, `{3}` stays literal, `parseGitPushArgs` parses it as a branch literally named `{3}` (not `develop`), and the guard silently no-ops. This is very likely part of why the last few days of swarm work (and this session's own early commits) landed straight on `develop` with no PR — the safety net that was supposed to catch that never engaged.

## non-goals

- Changing the underlying f00086 policy (still: block develop-from-develop pushes, allow the PR-merge shape) — only the detection mechanism was broken.
- Auditing every other lefthook command for the same argv-template assumption — this proposal fixes the one confirmed-broken, security-relevant case; a follow-up audit of the remaining `{1} {2} {3}`-style templates is a separate task.
- Retroactively re-doing the direct-to-develop commits already pushed during this session (the user explicitly authorized direct commit+push for this stabilization pass).

## Slices

- global_gate: type

### S1 — Read the real pre-push STDIN contract instead of the broken {3} argv template
- **Status**: done
- **Implementation**: added `parsePrePushStdin` (parses `<local ref> <local oid> <remote ref> <remote oid>` lines) and `lintPrePushStdinUpdates` (applies the existing f00086 policy per parsed ref). `main()` now reads real STDIN first via `readStdinRefUpdates` — which short-circuits on `process.stdin.isTTY` so it never blocks waiting for keyboard input — and only falls back to the old argv-based parsing for direct/manual invocation. Verified live: a realistic `develop -> develop` stdin payload now blocks with the pre-existing message; `agent/x -> develop` still allows; `< /dev/null` (no stdin, simulating `bun run validate`'s invocation) no-ops immediately with no hang.
- **Follow-up fix found by testing against a real push**: the script-only fix was not enough. A live `git push` on `develop` after the script change still printed `ok` — lefthook connects a pseudo-TTY to a command's stdin by default and does NOT forward git's real hook stdin unless the command sets `use_stdin: true` (confirmed against lefthook's own docs/issue tracker: "lefthook uses pseudo TTY by default, and it doesn't close stdin when all data is read" unless `use_stdin: true` is set). Added `use_stdin: true` to the `push-to-develop-discipline` command in `lefthook.yml` and dropped the now-meaningless `{3}` from its `run:` line. This is the piece that actually closes the gap end-to-end; the script change alone would have kept silently falling back to the broken argv path in real lefthook usage.
- **Files**: `tools/scripts/lint/push-to-develop-discipline.script.ts`, `tools/scripts/lint/push-to-develop-discipline.script.spec.ts`, `lefthook.yml`
- **Gate**: type
- acceptance:
  - "A realistic `refs/heads/develop <sha> refs/heads/develop <sha>` stdin payload is blocked (reproduced live)."
  - "An `agent/x -> develop` stdin payload (PR-merge shape) is allowed."
  - "No stdin / TTY invocation (e.g. inside `bun run validate`) no-ops immediately, no hang."
  - "bun test tools/scripts/lint/push-to-develop-discipline.script.spec.ts is green (23/23)."
  - "A real `git push` on `develop` is blocked end-to-end (reproduced live, post use_stdin: true)."

### S2 — Make the documented `LEFTHOOK_BYPASS=1` escape hatch real

- **Status**: done
- **Implementation**: while verifying S1 end-to-end, `LEFTHOOK_BYPASS=1 git push` did **not** bypass the (now-working) block — that variable is not one lefthook itself reads; lefthook's only real kill-switch is `LEFTHOOK=0` (skips every hook unconditionally). Every blocking script's own printed remedy ("bypass the hook with: `LEFTHOOK_BYPASS=1` ...") was a promise with nothing behind it. Added a shared `tools/scripts/lib/lefthook-bypass.ts` (`isLefthookBypassed()`) and wired an early-return check into both `push-to-develop-discipline.script.ts` and `commit-branch-discipline.script.ts` (the only two scripts that print this promise) so the documented variable now genuinely works.
- **Files**: `tools/scripts/lib/lefthook-bypass.ts`, `tools/scripts/lib/lefthook-bypass.spec.ts`, `tools/scripts/lint/push-to-develop-discipline.script.ts`, `tools/scripts/lint/commit-branch-discipline.script.ts`
- **Gate**: type
- acceptance:
  - "`LEFTHOOK_BYPASS=1` piped into a realistic develop-to-develop stdin payload now prints `bypassed` and exits 0 (reproduced live; previously still blocked)."
  - "Without the variable set, the guard still blocks as in S1."
  - "bun test tools/scripts/lib/lefthook-bypass.spec.ts is green."

## acceptance

- A realistic `refs/heads/develop <sha> refs/heads/develop <sha>` stdin payload is blocked (reproduced live).
- An `agent/x -> develop` stdin payload (PR-merge shape) is allowed.
- No stdin / TTY invocation (e.g. inside `bun run validate`) no-ops immediately, no hang.
- bun test tools/scripts/lint/push-to-develop-discipline.script.spec.ts is green (23/23).
- A real `git push` on `develop` is blocked end-to-end after `use_stdin: true` (reproduced live).
- `LEFTHOOK_BYPASS=1` genuinely bypasses both blocking scripts that document it (reproduced live).
