---
id: x00890
title: "what the part-by-part review of the project found, fixed at the root"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-13
last-transition-id: 6db080f0-2744-4b87-9e9e-4e709c5d9340
last-correlation-id: 6db080f0-2744-4b87-9e9e-4e709c5d9340
last-transition-from: ready
last-transition-at: 2026-10-13T16:55:16.370Z
---

# x00890 — what the part-by-part review of the project found, fixed at the root

## goal

Every defect the owner-requested review of the whole project finds (core, each plugin, web, extension) is recorded here with its evidence and fixed at its root, one slice per defect, so the review leaves a list of what was wrong and proof that it no longer is.

## why

The owner, 2026-10-13: once the open proposals are finished, review the project exhaustively, part by part (core, plugin by plugin, web, extension), and keep fixing what is wrong so everything works better each time. A review that only reports leaves the defects in place; one proposal per finding buries the review's shape. Each finding is a slice here, with the evidence that showed it and the root it was fixed at. A finding too large for a slice becomes its own proposal, referenced from here.

## non-goals

- New features. A finding that is a missing capability, not a defect, is proposed separately.
- Raising a baseline or a budget to make a finding go away.

## slices

- global_gate: type

### S1 — A review claim taken on a merged branch is recognised as spent

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/stray-refs-reap.service.ts`
  - `packages/core/tests/src/lib/work-units/stray-refs-reap.service.spec.ts`
- **Gate**: type
- evidence: `work doctor` on 2026-10-13 reports `refs/delendai-remote-claims/{q00018,r00040,x00877}` as BROKEN and `work reap` keeps them. Each is a root commit (`review claim <id> <uuid>`) whose tree is the tree of `chore(review): claim <id>`, a commit that is in develop, but reached through a merged pull request, not develop's first-parent line. The stray reaper reads only the first-parent trees (`git log --first-parent`), so a claim made on a review unit's branch never matches.
- acceptance:
  - A root commit whose tree is the tree of any commit develop reaches (within the same history bound) is a snapshot already held and is removed by `work reap --apply`; a root commit over a tree nobody has is still kept.
  - `work doctor` reports the stray-refs invariant as holding on the clone where the three refs were found, after one `work reap --apply`.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — An editor configuration with comments is edited, never a reason for `init` to stop

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/install/merge-config.ts`
  - `packages/core/src/lib/install/installer.ts`
  - `packages/core/src/lib/scaffold/detect-existing-install.ts`
  - `packages/core/src/lib/scaffold/agent-grant-reconcile.service.ts`
  - `packages/core/tests/src/lib/install/merge-config.spec.ts`
  - `packages/core/tests/src/lib/install/installer.spec.ts`
- **Gate**: type
- evidence: `delendai init --force` exited 1 with `SyntaxError: JSON Parse error: Unrecognized token '/'` in `mergeServerEntry` on a machine whose `~/.gemini/antigravity-ide/mcp_config.json` carries a comment. Editor MCP configurations are JSONC (VS Code `mcp.json`, Zed settings, Antigravity), and `JSON.parse` stopped the whole set-up at the first one.
- acceptance:
  - A configuration with comments has the server added as an edit of its text: every comment, sibling and the user's formatting stay. An unchanged one is returned byte for byte.
  - A configuration that cannot be read as a JSON object is skipped and reported (`left as it is: …`), and every other target is still set up.
  - The server-name detection and the grant reconciler read the same files as JSONC.

### S3 — The install smoke never writes the developer's own editor configurations

- **Status**: pending
- **Files**:
  - `tools/scripts/verify/external-install-smoke.script.ts`
- **Gate**: type
- evidence: `verify:external-install` runs `init --force` with the inherited home directory, and `init` writes every editor configuration it detects there. On this machine `~/.cursor/mcp.json`, `~/.codeium/windsurf/mcp_config.json` and `~/.config/Claude/claude_desktop_config.json` all changed within 40 ms of each other on 2026-10-11, the signature of one automated `init`.
- acceptance:
  - The smoke's `init` runs with a home directory inside its scratch folder (`HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `APPDATA`); a local run leaves every file under the real home untouched.

## acceptance

- Every slice names the evidence that showed its defect and is closed with the check that shows it gone.
