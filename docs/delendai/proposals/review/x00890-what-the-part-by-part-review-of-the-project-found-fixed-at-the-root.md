---
id: x00890
title: "what the part-by-part review of the project found, fixed at the root"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-13
last-transition-id: 4863cf40-e9d3-4dd1-9f05-140538cac5a1
last-correlation-id: 4863cf40-e9d3-4dd1-9f05-140538cac5a1
last-transition-from: in-progress
last-transition-at: 2026-10-13T16:56:30.832Z
shipped-in:
  - "b802bd2e8c36"
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

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-units/stray-refs-reap.service.ts`
  - `packages/core/tests/src/lib/work-units/stray-refs-reap.service.spec.ts`
- **Gate**: type
- evidence: `work doctor` on 2026-10-13 reports `refs/delendai-remote-claims/{q00018,r00040,x00877}` as BROKEN and `work reap` keeps them. Each is a root commit (`review claim <id> <uuid>`) whose tree is the tree of `chore(review): claim <id>`, a commit that is in develop, but reached through a merged pull request, not develop's first-parent line. The stray reaper reads only the first-parent trees (`git log --first-parent`), so a claim made on a review unit's branch never matches.
- acceptance:
  - A root commit whose tree is the tree of any commit develop reaches (within the same history bound) is a snapshot already held and is removed by `work reap --apply`; a root commit over a tree nobody has is still kept.
  - `work doctor` reports the stray-refs invariant as holding on the clone where the three refs were found, after one `work reap --apply`.
- shipped-in: `8452a84f5388`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at b802bd2e8c36, validate exit 0, tests 4/4; acceptance 2/2: (1) Pinned by two named passing tests covering both halves: 'removes a stray ref of empty commits and keeps one that carries work' and 'is true for nothing beyond … (2) Verified by name on this checkout: `bun run cli work doctor` prints `no-stray-refs — the clone holds no ref that is nobody's`, the check whose fix this slice d… — Approved at b802bd2e8c36, the commit the supersede guard names (merge of PR #1061); the slice's own 8452a84f5 also carries both files. Gate `type`. This slice deletes git refs — the most dangerous operation in the review corpus — so I looked hard at what is KEPT rather than at what is removed. `bunx vitest run --root packages/core tests/src/lib/work-units/stray-refs-reap.service.spec.ts` → 4 pass / 0 fail (the 4/4 above), and the names state both halves of ACC0: 'removes a stray ref of empty commits and keeps one that carries work' is the criterion's own sentence (a root commit over a tree develop already reaches is a snapshot already held and is reaped; a ref carrying real work survives), and 'is true for nothing beyond the base, and false for a merge' pins the reachability bound, which is what stops this from degrading into "delete anything that looks empty". The blast radius has its own test — 'never touches branches, tags or the product namespace' — and that is the assertion I would insist on before agreeing that deletion is safe. ACC1 is a claim about the invariant on a real clone, so I verified the check by name: `bun run cli work doctor` prints `no-stray-refs — the clone holds no ref that is nobody's` in this checkout.

### S2 — An editor configuration with comments is edited, never a reason for `init` to stop

- **Status**: review
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
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `86cd7ecb0f6f`

### S3 — The install smoke never writes the developer's own editor configurations

- **Status**: review
- **Files**:
  - `tools/scripts/verify/external-install-smoke.script.ts`
- **Gate**: type
- evidence: `verify:external-install` runs `init --force` with the inherited home directory, and `init` writes every editor configuration it detects there. On this machine `~/.cursor/mcp.json`, `~/.codeium/windsurf/mcp_config.json` and `~/.config/Claude/claude_desktop_config.json` all changed within 40 ms of each other on 2026-10-11, the signature of one automated `init`.
- acceptance:
  - The smoke's `init` runs with a home directory inside its scratch folder (`HOME`, `USERPROFILE`, `XDG_CONFIG_HOME`, `APPDATA`); a local run leaves every file under the real home untouched.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `86cd7ecb0f6f`

### S4 — Eviction never removes a unit, delendai's records or the state database

- **Status**: review
- **Files**:
  - `packages/core/src/lib/contracts/constants/core-eviction.constant.ts`
  - `packages/core/src/lib/cache/eviction-registry.ts`
  - `packages/core/src/lib/cache/eviction-protected-paths.helper.ts`
  - `tools/scripts/verify/cache-eviction-verify.script.ts`
  - `packages/core/src/lib/plugins/load-config-file.ts`
  - `packages/core/tests/src/lib/cache/eviction-registry.spec.ts`
  - `plugins/cache/src/lib/static-rules.ts`
  - `plugins/cache/src/index.ts`
  - `plugins/cache/README.md`
  - `plugins/cache/tests/registry.spec.ts`
- **Gate**: type
- evidence: on 2026-10-13 at 19:09, the first start of the host server on the code that made the boot sweep apply by default (x00889 S2), the live unit `claude-opus-5-5-x00890-all` lost every file but `node_modules` while its gates were running in it; `work doctor` then reported it under `no-leftover-worktrees`. The `cache` plugin registers `cache-worktrees-orphans` (`.worktrees`, keep the newest 3 by mtime) and `state-journal-roll` (`state`, keep the newest 5 entries: the state database, its WAL and shared-memory files are entries). Both had only ever run as a dry run. The unit's commits were safe on its branch; uncommitted work would have been lost.
- acceptance:
  - The core refuses to register a rule whose path is, or is inside, `.worktrees`, `records` or `state`, naming the path it refused.
  - The `cache` plugin contributes neither rule; its `worktrees` option is accepted and ignored, so no configuration stops validating.
  - A sweep over a cache with units of any age removes none of them.
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- Every slice names the evidence that showed its defect and is closed with the check that shows it gone.
