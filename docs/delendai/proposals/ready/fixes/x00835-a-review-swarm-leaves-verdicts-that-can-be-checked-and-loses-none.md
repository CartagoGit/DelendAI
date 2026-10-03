---
id: x00835
title: "A review swarm leaves verdicts that can be checked, and loses none"
kind: fix
status: ready
type: proposal
track: trust
date: 2026-10-03
priority: P1
related: [x00831, x00834, x00850]
---

# x00835 — A review swarm leaves verdicts that can be checked, and loses none

## goal

A swarm of reviewers from other model families, less capable than the ones
that wrote the work, produces verdicts a person can re-check, records them
where they survive, signs them with one identity per model, and never removes
or duplicates work while doing it. What the guidance told them and they did
anyway, the tools refuse.

## why

On 2026-10-02/03 the owner ran a swarm on purpose, to find what breaks when
many agents work at once: fourteen reviewers over the review backlog (five
MiniMax M3, three Luna 6, two GLM 5.3 Flash, two Qwen 3.8 Flash and two
ChatGPT 5.4 through Copilot), one Claude Opus orchestrator implementing
proposals through subagents, and one Claude Opus (this proposal's author)
working and recording what the rest did wrong. Over
about ten hours they opened 38 review refs and 16 review pull requests, and
recorded 59 distinct verdicts: 55 approvals and 4 requests for changes. What
went wrong, measured on the refs, pull requests and processes of that run:

### Verdicts that cannot be checked

- E10 — 14 of minimax-3's 33 verdicts are the bare line `approved by
  minimax-3`: no commit, no file, no gate result (x00868, d00416, f00641,
  f00755, x00641, …). Approval rate across the swarm: 93%.
- E9 — glm-5.3-max recorded `request_changes` on x00790 because *it* had not
  read the diff nor run the gate ("el diff del commit no quedó inspeccionado
  y el gate declarado no se ejecutó"). x00790 had merged in #703 two days
  earlier; the verdict moved it from `review` back to `in-progress`.
- E10 — glm-5.3-max on x00752: "No puedo emitir request_changes sin
  inspeccionar el diff…", then issued `request_changes`.
- E3 — minimax-3 approved x00830 "at fe8889c334e0", the unit's first commit,
  describing a pattern that was removed before #722 merged. The verdict is
  about code that never landed, and that commit was recorded as `shipped-in`.
- E9 — verdicts written in Spanish in English proposals;
  `review-implementer: unrecorded` because no delivering commit was found.

### Commits on the integration branch that nothing refused

- E2 — `bun ./apps/web/node_modules/.bin/delendai review approve x00796 S1
  --agent=minimax-3 …` ran with the shared checkout as its working directory.
  The review CLI resolved the workspace from cwd and wrote four verdicts into
  the shared checkout, which the work model forbids, although the reviewer
  had a review worktree.
- E7 — the reviewers then committed straight onto the shared checkout's local
  `develop`: thirty commits between 00:20 and 04:49 (claims, verdicts,
  "join existing PR for review pack" merges, "sync shared checkout with
  origin/develop"), never pushed. Local develop ended "ahead 30, behind 13"
  of the forge. Their merges also sent six done proposals back to `review`
  (d00416, v00127, x00641, x00750, x00761, x00785). Nothing was lost: every
  line they wrote is in origin/develop or a review ref, and the tip is kept
  at `refs/recovery/shared-develop-2026-10-03`. The guard that refuses an
  agent's commit on the integration branch recognises agents by Claude's
  environment markers (`CLAUDECODE`, `AI_AGENT`); the other hosts set
  neither, so their commits passed as a person's.
- E12 — every later `work enter` took that local develop as its base
  (`integrationBase` prefers the local branch), so new units, including
  this proposal's first draft, carried the reviewers' thirty commits.

### One model, many identities

- E4/E11 — the MiniMax reviewers signed as `minimax-3`, `minimax-m3`,
  `MiniMax-M3`, `MiniMaxM3`, `minimaxm3`, `minimaxm3-3` and `minimaxm3-batch`;
  the others as `glm-5.3-max` (the GLM launched was 5.3 Flash),
  `glm-5.3-flash`, `qwen-3.8-max` and `qwen3-flash` (both Qwen 3.8 Flash),
  `gpt-5.4` and "GitHub Copilot" (ChatGPT 5.4 through Copilot). Luna 6 never
  appears under its own name, so its three instances signed as something
  else. A review unit appeared as
  `claude-sonnet-5-5/review/batch-all-g1`, an identity owned by another
  orchestrator that runs no reviewers. Reviewer≠implementer independence and
  every count compare names; one model signing seven ways is seven reviewers
  to them, and a reviewer signing as an implementer's model is no reviewer.

### Packs that carry other packs, and duplicate pull requests

- 23 review commits written between 00:53 and 01:07 sit in seven review refs
  under three identities: packs were started from, or merged, other packs'
  unmerged work ("merge: join existing review pack PR #744").
- #741, #742 and #743 (`minimax-m3` g10, g11, g12) carry an identical diff.
  f00645's verdict is in six open pull requests; the first to merge wins and
  the rest conflict.
- Review packs published with no commits of their own (`minimax-m3` g4, g5,
  g6), and units left from an earlier run (`qwen-3.8-max` g1, g3, untouched
  for two days).

### A pack that deletes a proposal

- #744 (`minimaxm3` g1) removed `done/fixes/x00785-…`, the canonical copy on
  develop: commit 8ecb95372 "drop stale review copies of f00751 and x00785"
  and the merges that joined other packs left the done/ copy out. Held as a
  draft on 2026-10-03 with the cause in a comment; merging it would have lost
  x00785.

### Tools that are behind the code under review

- E1/E6 — reviewers ran `packages/cli/dist/index.js` (built 2026-10-01 19:36),
  `apps/web/node_modules/.bin/delendai` (the same dist) and
  `packages/cli/src/index.ts` side by side, and one server from another
  agent's worktree. The swarm applied different versions of the rules, and
  the dist one predates the held-slice refusal and the swarm fixes.

### What the Claude orchestrators did wrong too

The same run exposed the two Opus orchestrators, this author included:

- C1 — two orchestrators allocated the same id (x00811) an hour apart; the
  shared counter had drifted to x09905 through a CLI allocator bug (fixed by
  #724, atomic reservation through remote refs).
- C2 — a unit published under three generations at once (x00780 g1, g2, g3)
  and units stacked on each other's unlanded commits (x00766 → x00780,
  x00781), before x00791/x00831 made the swarm see and refuse it.
- C3 — kept-for-continuation units outlived their proposal: `publish` keeps a
  unit's worktree while its proposal is in progress (f00642), and when the
  next slice went to another agent nothing reaped it (f00547 S3/S4, x00556
  S2, f00538 S5, q00011 S8). x00850's "delivered-kept" verdict covers it.
- C4 — a publication with no pull request (x00795) made the queue's reap step
  fail on every run; empty `create` units were left behind (x00767 with TODO
  templates and colliding ids, x00797, x09905).
- C5 — this author's batch reported a publication as done when the push had
  been refused as non-fast-forward (the queue had refreshed the pull request
  meanwhile); `publish` answers `published: false` with a `nextAction`, which
  is easy to miss. It also lost its tooling twice to /tmp being wiped on
  restart, and recorded two findings it later had to correct (the dist's
  build date, and E7 as "lost" verdicts).
- C6 — this author's first draft of this proposal was built on the diverged
  local develop (E12) and carried thirty foreign commits until the gates
  refused it.

### What good verdicts did

- P1 — `MiniMaxM3` named the delivering commit and the gate with its count in
  all 16 of its approvals ("S1 verified at b28c3883ac9e …
  keep-the-queue-moving.script.spec.ts 22/22").
- P2 — gpt-5.4 ran r00043 S5's declared gate and found it does not exist in
  package.json: a real defect, found by running the declared command.
- P3 — a reviewer reported typecheck errors on its own branch instead of
  approving silently.

## why this design

The guidance can say all of this, and the owner pasted it to the swarm; a
model that drifts under load drifts past guidance. So each failure becomes a
refusal at the one place it can happen, phrased as what to do instead, and
the good verdicts' shape (P1) becomes the required shape.

## non-goals

- Choosing which models review. The owner chooses; the tools make any choice
  safe.
- Unit ownership and liveness, and reaping abandoned review units: x00850's
  lease and verdict own that, and this reads them.

## Slices

- global_gate: none

### S1 — A verdict names the commit it judged and the gate it ran

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/review.tool.ts`, `plugins/proposals/src/lib/tools/review-verdict-lifecycle.ts`
- `approve` and `request_changes` require the delivering commit and the
  declared gate's result (command, exit code or count). The commit must be on
  the integration branch, or be the tip of the unit's publication; a commit
  that a later commit of the same unit superseded is refused with the newer
  one named (E3).
- A reviewer that could not inspect or run anything does not record a
  verdict: the tool tells it to release the claim (E9, E10).
- The verdict text is checked for language like the rest of the proposal.

### S2 — A verdict is written in the reviewer's own unit, or not at all

- **Status**: pending
- **Files**: `packages/cli/src/commands/review.command.ts`, `plugins/proposals/src/lib/tools/review-claim.tool.ts`
- `review approve|request_changes|next` resolve the reviewer's review unit
  worktree from `--agent`/`--session` and write there. Run from the shared
  checkout with no unit, they refuse and name the unit to enter (E2, E7).

### S3 — One model, one identity

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/command-args.helper.ts`
- An agent id that differs from an identity already present in the refs only
  by case, hyphens or a numeric suffix (`MiniMax-M3`, `minimaxm3`,
  `minimaxm3-3`) is refused with the existing spelling named. Verdicts are
  signed with the canonical id, never with free text (E4, E11).
- An identity whose refs belong to another orchestrator's session (x00850's
  lease) is refused for review units.

### S4 — A review pack carries only its own verdicts

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`
- A review unit starts from the integration branch. Publishing a review pack
  whose commits are already carried by another open review pack, or that
  merges another pack, is refused with that pack named; a pack with no
  commits of its own is not published.
- `work swarm`'s duplicate relation (x00791) covers review packs that carry
  the same verdict.

### S5 — A review pack never deletes a proposal

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-publish.service.ts`
- The review-scope check refuses a pack that deletes a proposal file without
  adding it elsewhere in the same pack (a move), naming the file and the
  commit (#744).

### S6 — The CLI an agent runs is not behind the code it judges

- **Status**: pending
- **Files**: `packages/cli/src/lib/cli/entrypoint.ts`
- A CLI started from `dist` inside the repository compares its build stamp
  with the sources it was built from and refuses writing commands when the
  sources moved on, naming `bun packages/cli/src/index.ts` as the way to run
  the current rules (E1, E6).

### S7 — A unit starts from the integration branch the forge has

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-shared.service.ts`
- `integrationBase` uses the remote-tracking integration branch whenever the
  local one carries commits the forge does not: under a pull-request model the
  local branch can only follow, so unpublished commits on it are an accident
  to report, never a base to build on (E12, C6). `work status` and the
  doctor name the divergence and the backup to restore from.

### S8 — A publication that did not land says so loudly

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-publish.service.ts`
- `work publish` exits non-zero when the publication was not proved on the
  remote, and its first line says why and what to merge (C5).

## dependency graph

- S3 reads x00850's lease to recognise another orchestrator's identity.
- E7's root cause (the guard recognising only Claude's markers) is fixed by
  the other orchestrator's guard work; this proposal does not repeat it.
- The others are independent.

## acceptance

- Re-running the 2026-10-03 swarm's mistakes against the tools: a bare
  `approve`, a `request_changes` without a commit, a verdict from the shared
  checkout, `MiniMax-M3` beside `minimax-m3`, a pack merging another pack, a
  pack deleting `done/…/x00785`, and a stale dist CLI are each refused with
  what to do instead.
- A verdict shaped like P1 goes through unchanged.
