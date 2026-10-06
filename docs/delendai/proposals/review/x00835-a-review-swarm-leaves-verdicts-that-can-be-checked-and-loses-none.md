---
id: x00835
title: "A review swarm leaves verdicts that can be checked, and loses none"
kind: fix
status: review
type: proposal
track: trust
date: 2026-10-03
priority: P1
related: [x00831, x00834, x00850]
last-transition-id: 56ca3e7f-3176-439f-8a8f-71a96d4dedb4
last-correlation-id: 56ca3e7f-3176-439f-8a8f-71a96d4dedb4
last-transition-from: in-progress
shipped-in:
  - "f83c85addc9e"
  - "70f0d67de5cddf9a6ce91f75abf65e9eadbd2e77"
  - "6f63a52e168e57203553e0858b508c432998ef0e"
  - "b0f8d072ad9d6d9aff05e76c270ccef1b0218283"
  - "aefe63385650e029adf6b7618599e1675f13be96"
  - "cef6142b3105dc7896c396e953507acd90769795"
  - "6839c65ecf19b69cc2cf7511bceb29728e309903"
  - "fa48b1c9f7fd69b1f13b4a97c8f70f4f83f33f11"
  - "27b60933038a5913ccecf4856cecc24e02b33a4e"
  - "7fa7e95db68420cfe10ded78ec9144e3e82243f9"
  - "17d1fa53353c7b4de9ad67392f75e198b301c26d"
  - "657da3ff96183e12acf10efe5cef4ee54b54273f"
  - "345f73884420995774374681a50ff8ea6d827777"
---

# x00835 — A review swarm leaves verdicts that can be checked, and loses none

## goal

At the end of a swarm run nothing hangs: every unit of work is merged and
gone, waiting in an open pull request, or live with an owner that answers;
the integration branch everyone starts from is the one the forge has; and
every deviation the run showed is either refused by the tools or reported by
them. Every way the run below departed from the intended workflow is treated
as a defect of the system, not of the agent that happened to hit it.

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

### Claims that do not exclude

- E15 — twelve proposals were claimed twice by distinct claim commits:
  sometimes by one identity (two MiniMax instances sharing `minimax-3`, the
  second claim read as the claimer's own), sometimes by two (x00799, x00762,
  q00023 and f00751 by `minimax-3` and `minimax-m3`; x00810 by `minimax-3` and
  `minimaxm3`), between 25 and 215 minutes apart. Thirteen slices were judged
  more than once: f00755 S1 and r00043 S2 four times each. A claim is a
  commit on the claimer's own branch, so another agent learns of it only once
  that branch reaches the forge; there is no shared reservation to lose.

### Units nobody chose, and work swept into them

- E13 — the same two slices (x00569 S1, x00738 S1) were opened four times, by
  `client-claude-code`, `client-visual-studio-code`, `client-delendai-client`
  and `unknown-agent`: identities derived from the MCP client because no agent
  declared one. Their commits read `feat(x00569): commit via slice S1`, the
  message the `commit-policy` plugin writes on a slice event. That plugin runs
  in every MCP server, so every connected client's server reacted to the same
  event and opened its own unit. One such commit (2ae26a8fc) carried the other
  orchestrator's x00860 files (`close-slice-certification.ts` and its specs):
  the commit took what the event listed, not what the slice declares.
- E14 — minimax-3, a reviewer, opened `implement` units on proposals it was
  reviewing (r00043 S2/S4/S5/S6, x00641, x00749, x00761, x00764, f00755) and
  committed verdicts in them, some for another proposal (v00127's approvals in
  `implement/x00761-S1`), plus a `proposal_transition r00043 done`. A unit's
  name said nothing about its contents, and a reviewer wrote where implementers
  write.

### Branches nobody finished or removed

Measured on 2026-10-03 in the owner's clone, after the run:

- 51 local work branches and 42 worktrees. 43 branches were never published;
  15 of them carry no commit beyond develop and the thirty of E7. The rest are
  review packs opened one after another (minimax-3 g1…g8, minimaxm3 g1…g9,
  minimax-m3 g1…g12) and units of E13 and E14.
- On the forge: three publications with no commit of their own
  (`minimax-m3` g4, g5, g6), one review unit whose content is already in
  develop, and a closed review pull request whose branch was kept.
- E16 — while this was measured, the units of E13 and E14 were deleted from
  the clone. Not by the other orchestrator's agent (its reaper is unmerged and
  ran only in scratch repositories), not by this author: most likely a stale
  host-server process or a reviewer's host. A ref deletion leaves no record
  of who made it. The tips are kept under `refs/recovery/swarm-2026-10-03/`.

Reaping delivered, kept and abandoned units is x00850's; what this proposal
adds is that most of these units should never have been opened.

### Agents that left no trace, or the wrong name

- E17 — the three Luna 6 instances left nothing attributable to them: no
  ref, no commit, no verdict, no pull request names Luna. Either they did no
  work, or they signed as something else; with no roster of who joined the
  run, nobody can tell which. An agent that joins and produces nothing is
  invisible, and so is one that works under another name.
- E18 — the two Qwen 3.8 Flash instances signed `qwen3-flash` (no version) and
  `qwen-3.8-max` (the wrong tier). Nothing checks an agent id against the model
  that is actually running.

### Decisions that contradict each other, with no conflict to show it

Verified on 2026-10-03 against develop and the open review packs (several from
a review of the run by another model, ChatGPT "Sol 6", each re-checked here):

- G1 — this repository runs `reviewIndependence: "instance"`, and in that mode
  `isSelfApproval` (`plugins/proposals/src/lib/shared/independent-approval.ts`)
  returns false unconditionally: it proves nothing about instances, so no
  approval is ever a self-approval. In `model` mode it compares names
  lower-cased, so `minimaxm3` approving `minimax-m3`'s work passes as
  independent.
- G2 — v00127 reached `done` with `review-implementer: unrecorded` and
  "independence could not be verified". `UNRECORDED_IMPLEMENTER` exists so
  historical work can be reviewed; it also lets new work close without anyone
  knowing who wrote it.
- G4 — GPT-5.4 sent f00755, q00010 and r00043 back to `in-progress` on develop
  for concrete defects (a stale SHA read before fetch, contradictory closing
  conditions, a gate that does not exist). The open packs #745 (to `done`) and
  #740/#746 (to `review`) still carry older decisions on the same proposals.
  Git sees no conflict in that; merging any of them would overwrite a newer
  decision with an older one.
- G5 — #745's description lists about twenty verdicts and two moves; after
  successive "join existing review pack" merges its diff changes far more
  proposals than it declares. A pack's description stops describing it.
- G3 — the queue's `report-stale-candidates` job fails on GitHub Actions with
  "Committer identity unknown / fatal: empty ident name" in a step reported as
  read-only (`forge:refresh: 0 refreshed (read-only; pass --apply)`): the
  recovery path depends on the runner's global git identity, and a read-only
  run creates commits at all.

### Tools that are behind the code under review

- E1 measured — that dist was built at 17:36Z on 2026-10-01. The held-slice
  refusal merged at 18:11Z (#727), the briefing of published work at 18:38Z
  (#728), the own-publication fix at 21:24Z (#729) and the cross-project
  guard a day later (#730). Every reviewer and every MCP server started from
  dist ran with none of the guards written for exactly this run.
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

### Who produced what, and how much of it landed

- E19 — verdicts merged to develop over the run: GPT-5.4 nine (six approvals
  and three requests for changes, each on a real defect), Qwen 3.8 Flash nine,
  MiniMax M3 fifteen, GLM 5.3 Flash six, Luna 6 none. Not landed: 35 verdicts
  signed `minimax-3`, 19 signed `minimaxm3` and 3 signed `glm-5.3-max`, in
  packs that cannot merge as they are. The model that produced the most lost
  most of it to stale packs.
- E20 — review units were named `…/review/batch-all-gN/work` (the default
  topic), `review-backpack` and `review-all-g8` for the same thing; `work`
  names nothing.
- E21 — carrying the stale packs' verdicts into one settling unit was tried
  by hand and refused by `closed-with-independent-approval`: a unit of one
  agent that adds approvals by another is that agent signing for it. The
  gate held. The 57 verdicts of E19 therefore cannot be transported; they
  are settled where they were made (S14) or the slices are reviewed again.
- E22 — the clone's hooks run `lefthook` out of the `node_modules` of one
  reviewer's worktree (`…/.worktrees/minimax-3-batch-all-g7/…`): an install
  with scripts inside a unit rewrote the shared hook. Removing that unit
  leaves every agent's commit on the hook's slower fallback path.

- E23 — nothing in the product retires a unit that will not land. The 21
  branches of E19 could only be removed with `git push --delete` by hand,
  which loses the work and which an agent's host rightly refuses; the
  repository's own `reclaim:orphans` sees local branches only, calls a live
  unit with no commits yet "safe to delete", and tells the reader to
  `git switch develop && git merge` in the shared checkout. So the branches
  stayed, and every claim in them kept holding its proposal.

- E24 — the cause of E22 is the hook manager's own package: `lefthook`
  ships a postinstall that runs `lefthook install -f` in whatever directory
  dependencies are installed in, and bun trusts it by default. `prepare`
  refuses in a linked worktree and `no_auto_install` is set, and neither
  matters: every `bun install` in a unit, and the queue's own refresh in a
  throwaway worktree, rewrote the clone's hooks. On 2026-10-04 they pointed
  at `/tmp/candidate-refresh-…`, a directory already deleted.
- E25 — after every publication of a proposal still in progress the unit's
  branch is kept, and nothing brings it forward or collects it: nine units
  with no commit of their own sat 15 to 18 commits behind `develop`, each
  with a worktree, looking like work to come.
- E26 — retiring fifteen units needed a hand-run `git checkout` first: each
  had one uncommitted change, a regenerated catalog. And units whose work
  `develop` already held were given a retired ref for nothing.

- E27 — with every branch settled, the owner still saw a repository full of
  lost work: a commit graph shows every ref, and the clone held a hundred
  that were not branches. Forty-nine tips kept by hand under
  `refs/recovery/`, fifty-six local copies of retired units, and a
  remote-tracking ref of a remote that no longer existed. All of it was
  kept elsewhere; nothing listed it, because nothing that lists branches
  sees a ref that is not one.

- E28 — sending four proposals back to review after their changes were
  made found two more refusals that were wrong. A slice that had been
  retired was asked for the commit that delivered it; `retired` was not a
  status the tools read, so it counted as `pending`. And a slice that
  declared its own proposal's document as one of its files (under
  `review/…`) blocked the proposal's move out of `in-progress/`, where the
  document then was. The reviewer of r00043 had also found a declared gate
  that no script provided: the lint behind it was registered as manual and
  ran nowhere.

- E29 — the clone held 5,150 commits no ref reached. Read one by one: 4,127
  had their change in `develop` already, 425 were empty, 83 were kept on the
  forge as retired units, and most of the rest were bookkeeping. Eleven
  were work, three to four weeks old, whose files had never reached
  `develop` under any name: a host bridge, a shell capability registry, a
  compare-and-swap repository, a branch classifier, a stash of untracked
  files. Nothing had ever listed them. They are on the forge now under
  `refs/delendai/retired/rescued-2026-10-04/`, and the rest was pruned.
- E30 — the owner's rule, stated on 2026-10-04: work is committed in its
  unit and the unit is on the forge, always; what is not work disappears,
  always; and the owner can see which is which without asking git for its
  unreachable objects.

- E31 — two units of the other orchestrator sat for 18 and 22 hours with no
  pull request: its subagent had hit a rate limit and its session only woke
  on events. Taking the larger one over with `work claim` created the new
  name and then failed to remove the old one, because a worktree stood on
  it: the claim ended with two names for one unit, and the worktree had to
  be moved by hand.

- E32 — seven proposals merged weeks earlier could not be handed to review
  from a fresh unit: `undelivered-slices`, "no commit on this branch changes
  the slice's declared files, and nothing records which commit delivered
  it". Their deliveries were on `develop`; the merges named the unit they
  came from, which had been opened under another id. The only way forward
  was to write the commit into the document by hand, which the agent's host
  refused.

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

- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/review-verdict-evidence.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/tools/review-verdict-evidence.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-verdict-evidence.spec.ts`
- `approve` writes the commit, the gate's exit code and the test counts it
  was given into the proposal; a commit the integration branch does not
  hold is refused. `request_changes` on delivered work names the commit it
  objects to, or is refused (E3, C1).
- shipped-in: `70f0d67de5cd`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 70f0d67de5cd, validate exit 0, tests 295/295 — Deliver 70f0d67de5cddf9a6ce91f75abf65e9eadbd2e77; feat ancestors verified; declared gate batched green 34 files / 295 tests exit 0.
- review-attribution: claude-opus-5-5 from commit 70f0d67de5cd names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (70f0d67de5cddf9a6ce91f75abf65e9eadbd2e77), opened by minimax-3

### S2 — A verdict is written in the reviewer's own unit, or not at all

- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/review-claim.service.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-claim.spec.ts`, `plugins/proposals/tests/src/lib/tools/review-repo.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-worktree.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/proposal-review-claim.spec.ts`
- `review approve|changes|next` already write in the reviewer's unit. The
  verdict tool called directly was the way around it: in a project with
  work refs, `approve` and `request_changes` outside a review unit are now
  refused, name the unit to enter, and write nothing (E2, E7).
- shipped-in: `6f63a52e168e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 6f63a52e168e, validate exit 0, tests 295/295 — Deliver merge 6f63a52e168e57203553e0858b508c432998ef0e (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 6f63a52e168e names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (6f63a52e168e57203553e0858b508c432998ef0e), opened by minimax-3

### S3 — One model, one identity

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/agent-alias.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/tests/src/lib/work-units/agent-alias.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/agent-alias.service.spec.ts`
- An agent id that differs from an identity already present in the refs only
  by case, hyphens or a numeric suffix (`MiniMax-M3`, `minimaxm3`,
  `minimaxm3-3`) is refused with the existing spelling named. Verdicts are
  signed with the canonical id, never with free text (E4, E11).
- An identity whose refs belong to another orchestrator's session (x00850's
  lease) is refused for review units.
- shipped-in: `b0f8d072ad9d`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at b0f8d072ad9d, validate exit 0, tests 295/295 — Deliver merge b0f8d072ad9d6d9aff05e76c270ccef1b0218283 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit b0f8d072ad9d names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (b0f8d072ad9d6d9aff05e76c270ccef1b0218283), opened by minimax-3

### S4 — A review pack carries only its own verdicts

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/review-pack-scope.service.ts`, `packages/core/src/lib/contracts/interfaces/review-pack.interface.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/tests/src/lib/work-units/review-pack-scope.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/review-pack-scope.spec.ts`
- A review unit starts from the integration branch. Publishing a review pack
  whose commits are already carried by another open review pack, or that
  merges another pack, is refused with that pack named; a pack with no
  commits of its own is not published.
- `work swarm`'s duplicate relation (x00791) covers review packs that carry
  the same verdict.
- shipped-in: `aefe63385650`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at aefe63385650, validate exit 0, tests 295/295 — Deliver merge aefe63385650e029adf6b7618599e1675f13be96 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit aefe63385650 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (aefe63385650e029adf6b7618599e1675f13be96), opened by minimax-3

### S5 — A review pack never deletes a proposal

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/review-pack-deletions.service.ts`, `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/tests/src/lib/work-units/review-pack-deletions.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/review-pack-deletions.service.spec.ts`
- The review-scope check refuses a pack that deletes a proposal file without
  adding it elsewhere in the same pack (a move), naming the file and the
  commit (#744).
- shipped-in: `aefe63385650`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at aefe63385650, validate exit 0, tests 295/295 — Deliver merge aefe63385650e029adf6b7618599e1675f13be96 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit aefe63385650 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (aefe63385650e029adf6b7618599e1675f13be96), opened by minimax-3

### S6 — The CLI an agent runs is not behind the code it judges

- **Status**: done
- **Files**: `packages/cli/src/lib/stale-build.service.ts`, `packages/cli/src/contracts/interfaces/stale-build.interface.ts`, `packages/cli/src/index.ts`, `packages/cli/src/lib/stale-build.service.spec.ts`
- **Gate**: `npx vitest run packages/cli/src/lib/stale-build.service.spec.ts`
- A CLI started from `dist` inside the repository compares its build stamp
  with the sources it was built from and refuses writing commands when the
  sources moved on, naming `bun packages/cli/src/index.ts` as the way to run
  the current rules (E1, E6).
- shipped-in: `aefe63385650`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at aefe63385650, validate exit 0, tests 295/295 — Deliver merge aefe63385650e029adf6b7618599e1675f13be96 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit aefe63385650 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (aefe63385650e029adf6b7618599e1675f13be96), opened by minimax-3

### S7 — A unit starts from the integration branch the forge has

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-unit-shared.service.ts`, `packages/core/tests/src/lib/work-units/integration-base.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/integration-base.spec.ts`
- `integrationBase` uses the remote-tracking integration branch whenever the
  local one carries commits the forge does not: under a pull-request model the
  local branch can only follow, so unpublished commits on it are an accident
  to report, never a base to build on (E12, C6). `work status` and the
  doctor name the divergence and the backup to restore from.
- shipped-in: `aefe63385650`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at aefe63385650, validate exit 0, tests 295/295 — Deliver merge aefe63385650e029adf6b7618599e1675f13be96 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit aefe63385650 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (aefe63385650e029adf6b7618599e1675f13be96), opened by minimax-3

### S8 — A publication that did not land says so loudly

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-unit-publish.service.ts`, `packages/core/tests/src/lib/work-units/work-unit-publish-failure.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/work-unit-publish-failure.spec.ts`
- `work publish` exits non-zero when the publication was not proved on the
  remote, and its first line says why and what to merge (C5).
- shipped-in: `aefe63385650`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at aefe63385650, validate exit 0, tests 295/295 — Deliver merge aefe63385650e029adf6b7618599e1675f13be96 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit aefe63385650 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (aefe63385650e029adf6b7618599e1675f13be96), opened by minimax-3

### S11 — A claim is one shared reservation

- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/review-reservation.service.ts`, `plugins/proposals/src/lib/services/review-claim.service.ts`, `plugins/proposals/src/lib/contracts/constants/review-reservation.constant.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-reservation.interface.ts`, `plugins/proposals/tests/src/lib/tools/review-reservation.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-reservation.spec.ts`
- Claiming a proposal for review first creates
  `refs/delendai/claims/review/<id>` on the forge with a push only one of
  two can win (the mechanism of the id reservation). The commit it points
  at names the holder's unit, so two instances of one model are two
  holders; the loser is told who holds it and commits no claim (E15).
- A reservation is renewed by its holder, given back by it, and may be
  taken over once it has not been renewed for four hours: a reviewer that
  went away keeps nothing. Where there is no forge, nothing is reserved and
  the claim works as before.
- Reserving a slice for implementation the same way is S26.
- shipped-in: `cef6142b3105`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at cef6142b3105, validate exit 0, tests 295/295 — Deliver merge cef6142b3105dc7896c396e953507acd90769795 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit cef6142b3105 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (cef6142b3105dc7896c396e953507acd90769795), opened by minimax-3

### S12 — A run ends with nothing hanging

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/workflow-invariants.service.ts`, `packages/core/tests/src/lib/work-units/workflow-invariants.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/workflow-invariants.service.spec.ts`
- `work doctor` already named a work ref with no worktree, a worktree with
  no ref and a work ref left on the forge. It now also names a publication
  that holds nothing the integration branch lacks, and a local integration
  branch carrying commits the forge lacks, each with its remedy.
- shipped-in: `6f63a52e168e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 6f63a52e168e, validate exit 0, tests 295/295 — Deliver merge 6f63a52e168e57203553e0858b508c432998ef0e (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 6f63a52e168e names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (6f63a52e168e57203553e0858b508c432998ef0e), opened by minimax-3

### S9 — An automatic commit is made once, by an agent, of the slice's files

- **Status**: done
- **Files**: `plugins/commit-policy/src/lib/persistence/wip-persistence.ts`, `plugins/commit-policy/src/lib/persistence/wip-persistence.interface.ts`, `plugins/commit-policy/src/lib/contracts/interfaces/persistence.interface.ts`, `plugins/commit-policy/src/lib/services/work-ref-naming.service.ts`, `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/src/index.ts`, `plugins/commit-policy/tests/src/lib/persistence/work-ref-naming.persistence.spec.ts`
- **Gate**: `npx vitest run plugins/commit-policy/tests/src/lib/persistence/work-ref-naming.persistence.spec.ts`
- A slice event reaches every server connected to the workspace. A server
  whose agent was never declared (its name comes from the program that
  connected, or from nothing) checkpoints nothing and says
  `WIP_NO_AGENT_IDENTITY` with what to declare: no unit is opened under
  `client-…` or `unknown-agent` again (E13).
- What a checkpoint carries stays the claim of the event; narrowing it to
  the files the slice declares is S25.
- shipped-in: `b0f8d072ad9d`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at b0f8d072ad9d, validate exit 0, tests 295/295 — Deliver merge b0f8d072ad9d6d9aff05e76c270ccef1b0218283 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit b0f8d072ad9d names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (b0f8d072ad9d6d9aff05e76c270ccef1b0218283), opened by minimax-3

### S10 — A reviewer does not implement what it reviews

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/reviewed-proposal.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/tests/src/lib/work-units/reviewed-proposal.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/reviewed-proposal.service.spec.ts`
- An agent holding a review claim on a proposal, or that recorded a verdict on
  it, is refused an `implement` unit on that proposal (E14). A review verdict
  committed in a non-review unit is refused at publication.
- shipped-in: `b0f8d072ad9d`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at b0f8d072ad9d, validate exit 0, tests 295/295 — Deliver merge b0f8d072ad9d6d9aff05e76c270ccef1b0218283 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit b0f8d072ad9d names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (b0f8d072ad9d6d9aff05e76c270ccef1b0218283), opened by minimax-3

### S13 — Independence is proved, or the review does not close

- **Status**: done
- **Files**: `plugins/proposals/src/lib/shared/independent-approval.ts`, `plugins/proposals/src/lib/services/review-identity.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/shared/independent-approval.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/shared/independent-approval.spec.ts`
- Models are compared by their letters and digits, so an alias is the same
  model. Another model is another reviewer under either rule.
- Under `instance`, the same model is independent only when both instances
  were seen and differ: the submitting and the approving process, compared
  by the tool, which then marks the approval line `[another instance]`.
  A document shows no instance, so without the mark the same model's
  approval closes nothing. `instance` used to compare nothing at all (G1).
- A slice whose implementer is `unrecorded` does not reach `done`, whoever
  approved it: the delivering commit has to be named first (G2).
- shipped-in: `6f63a52e168e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 6f63a52e168e, validate exit 0, tests 295/295 — Deliver merge 6f63a52e168e57203553e0858b508c432998ef0e (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 6f63a52e168e names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (6f63a52e168e57203553e0858b508c432998ef0e), opened by minimax-3

### S14 — A verdict applies to the revision it was made on

- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/review-verdict-evidence.ts`, `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/tools/review-verdict-evidence.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-verdict-evidence.spec.ts`
- The revision a verdict is about is the delivery it names: the commit, and
  through it the pull request that landed the slice. A verdict on a
  delivery the proposal has since replaced is refused when it is recorded
  (S20), and an approval recorded before the slice was delivered again does
  not close the proposal: the move to `done` is refused as `stale-verdict`,
  naming the slice, the commit that was judged and the newer delivery (G4,
  E3). The document's text is the same before and after; the history is
  what is compared, so nothing is merged as text.
- The proposals database's revision column (r00048) is local to a clone and
  cannot be compared from another one; the delivery commit can.
- A pack that describes itself, and the settlement of packs that went
  stale, are S32.
- shipped-in: `70f0d67de5cd`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 70f0d67de5cd, validate exit 0, tests 295/295 — Deliver merge 70f0d67de5cddf9a6ce91f75abf65e9eadbd2e77 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 70f0d67de5cd names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (70f0d67de5cddf9a6ce91f75abf65e9eadbd2e77), opened by minimax-3

### S15 — Recovery runs need no global git identity, and read-only writes nothing

- **Status**: done
- **Files**: `tools/scripts/git/refresh-candidate-artifacts.script.ts`, `tools/scripts/git/refresh-candidate-artifacts.constant.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`
- **Gate**: `npx vitest run tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`
- The merge and the commits a refresh makes name their committer with
  `-c user.name/-c user.email` when the machine's git names nobody, and
  leave a configured identity alone. A read-only run already made no
  commit (G3).
- The trial merge `forge:refresh` makes to compare trees names a committer
  the same way (`tools/scripts/forge/refresh-candidates.script.ts`,
  `tools/scripts/forge/refresh-candidates.script.spec.ts`): the job still
  printed "empty ident name" after the first fix, from a second script.
- shipped-in: `6839c65ecf19`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 6839c65ecf19, validate exit 0, tests 295/295 — Deliver merge 6839c65ecf19b69cc2cf7511bceb29728e309903 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 6839c65ecf19 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (6839c65ecf19b69cc2cf7511bceb29728e309903), opened by minimax-3

### S16 — The run knows who joined it

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/swarm-roster.service.ts`, `packages/core/src/lib/work-units/work-unit-status.service.ts`, `packages/core/src/lib/contracts/interfaces/swarm-roster.interface.ts`, `packages/core/tests/src/lib/work-units/swarm-roster.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/swarm-roster.service.spec.ts`
- Every agent that enters a unit leaves a lease, whether or not it commits.
  `work swarm` lists the agents of the run from the leases and the refs:
  how many instances of each, its units, its commits and what waits to
  land. One that joined and produced nothing is listed, and says so (E17).
- One model under two names is refused on the way in (S3). Checking that a
  declared id is the model actually running needs the host to state it;
  nothing here can tell `qwen3-flash` from the model it is (E18).
- shipped-in: `b0f8d072ad9d`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at b0f8d072ad9d, validate exit 0, tests 295/295 — Deliver merge b0f8d072ad9d6d9aff05e76c270ccef1b0218283 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit b0f8d072ad9d names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (b0f8d072ad9d6d9aff05e76c270ccef1b0218283), opened by minimax-3

### S17 — A storm can be replayed

- **Status**: done
- **Files**: `packages/core/tests/src/lib/work-units/swarm-storm.e2e.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/swarm-storm.e2e.spec.ts`
- A fixture reproduces this run in a scratch repository: five reviewers of one
  model under aliases, two of another, two implementers, a proposal approved
  at revision N and sent back at N+1 while a third reviewer closes from N, a
  publication with no pull request, an abandoned unit, a candidate sixty
  commits behind, derived files, a server restart and an unattributable
  implementer. Settling every event must reach one final state whatever the
  order the agents finish in, with `work doctor` (S12) reporting nothing.
- Shipped: one repository with a forge, in which a commit lands in the
  shared checkout, a reviewer re-spells its name, a reviewer implements what
  it reviews, a pack is built on another pack, a pack deletes a closed
  document, two agents take one slice, and an agent retires a colleague's
  live unit. Each is refused where it is made; the owners retire what
  cannot land, and `work doctor` ends with nothing broken. The verdict
  mistakes (bare approval, superseded delivery, double claim, same-instance
  approval) are replayed by the proposals plugin's own specs.
- shipped-in: `fa48b1c9f7fd`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at fa48b1c9f7fd, validate exit 0, tests 295/295 — Deliver merge fa48b1c9f7fd69b1f13b4a97c8f70f4f83f33f11 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit fa48b1c9f7fd names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (fa48b1c9f7fd69b1f13b4a97c8f70f4f83f33f11), opened by minimax-3

### S18 — The run reports its own incidents

- **Status**: done
- **Files**: `packages/core/src/lib/contracts/interfaces/workflow-kpis.interface.ts`, `packages/core/src/lib/work-units/workflow-kpis.service.ts`, `packages/core/src/public/index.ts`, `packages/core/tests/src/lib/work-units/workflow-kpis.service.spec.ts`, `plugins/project-kpis/src/lib/contracts/kpi-snapshot.interface.ts`, `plugins/project-kpis/src/lib/contracts/kpi-snapshot.schema.ts`, `plugins/project-kpis/src/lib/services/kpi-aggregation.service.ts`, `plugins/project-kpis/tests/src/kpi-workflow.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/workflow-kpis.service.spec.ts plugins/project-kpis/tests/src/kpi-workflow.spec.ts`
- The KPI snapshot carries an optional `workflow` block read from what core
  already computes, so a supervising agent reads numbers instead of inferring
  the state from branches: `invariants` (`total`, `broken`, `brokenIds` from
  the workflow doctor, checkout scope only so a KPI never waits on the
  network), `units`, `publicationsWaiting`, `agents` and
  `agentsThatProducedNothing` from the swarm view and the roster.
- One composing function, `readWorkflowKpis`, is exported through core's
  public surface; the plugin reimplements no check. Outside a git repository
  the block is omitted, and snapshots without it still parse.
- shipped-in: `f83c85addc9e`
- review-state: done
- review-implementer: claude-sonnet-5-5
- review-reviewer: claude-opus-5-5
- review-log: approved by claude-opus-5-5 — verified at f83c85addc9e, validate exit 0, tests 6/6 — Read #773: readWorkflowKpis composes runWorkflowDoctor (checkout scope), readSwarm and rosterOf without recomputing any check; the plugin's optional workflow block parses with and without it. The declared gate (both specs) passes 6/6.
- review-attribution: claude-sonnet-5-5 from commit f83c85addc9e names refs/heads/delendai/wip/claude-sonnet-5-5/implement/x00835-S18-g1/a-review-swarm-leaves-verdicts-that-can-be (f83c85addc9e1282447e57daaab7ed0d86c0a0a0), opened by claude-opus-5-5

### S19 — A unit's name says what it is

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/unit-topic.service.ts`, `packages/core/src/lib/work-units/reviewed-proposal.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/publication-pull-request.service.ts`, `packages/core/src/lib/contracts/constants/work-topic.constant.ts`, `packages/core/tests/src/lib/work-units/unit-topic.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/unit-topic.service.spec.ts`
- A review pack has one topic, derived by the tools, not chosen per agent; an
  implementation unit's default topic comes from its proposal's title instead
  of `work` (E20).
- A pull request of several deliveries says how many it holds instead of
  taking its oldest commit's subject as if it were the whole.
- shipped-in: `b0f8d072ad9d`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at b0f8d072ad9d, validate exit 0, tests 295/295 — Deliver merge b0f8d072ad9d6d9aff05e76c270ccef1b0218283 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit b0f8d072ad9d names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (b0f8d072ad9d6d9aff05e76c270ccef1b0218283), opened by minimax-3

### S20 — A verdict names the newest commit, and a reviewer that ran nothing records none

- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/review-verdict-evidence.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/tests/src/lib/tools/review-verdict-evidence.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-verdict-evidence.spec.ts`
- An approval names a commit; the pull request that brought that commit in
  is its delivery. When a later delivery of the same proposal changed the
  slice's files, the approval is refused and the newer delivery named: the
  reviewer reads what the slice is now (E3). A later change to those files
  that is no delivery of the proposal does not count, so who implemented
  the slice is still read from the commit the reviewer named.
- A reviewer that ran nothing, and the language of a verdict's text, are
  S27.
- shipped-in: `70f0d67de5cd`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 70f0d67de5cd, validate exit 0, tests 295/295 — Deliver merge 70f0d67de5cddf9a6ce91f75abf65e9eadbd2e77 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 70f0d67de5cd names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (70f0d67de5cddf9a6ce91f75abf65e9eadbd2e77), opened by minimax-3

### S21 — The queue goes red while something hangs on the forge

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/forge-work-refs.service.ts`, `packages/core/src/lib/work-units/workflow-invariants.service.ts`, `tools/scripts/git/check-workflow-invariants.script.ts`, `.github/workflows/keep-the-queue-moving.yml`, `packages/core/tests/src/lib/work-units/workflow-invariants.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/workflow-invariants.service.spec.ts`
- A lease lives in the clone that entered the unit, so a runner has none.
  A work ref on the forge is judged by what it says itself: one that holds
  nothing the integration branch lacks has landed, one whose last commit is
  older than the time a silent unit is given was left, and anything else is
  somebody's backup and is left alone.
- The queue's step no longer ends in `|| true`: it fails while a
  publication holds nothing, is not canonical, or a work ref hangs. A
  candidate still behind is reported and not counted, since bringing it
  forward is what the queue has just started (`--except=`).
- shipped-in: `6f63a52e168e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 6f63a52e168e, validate exit 0, tests 295/295 — Deliver merge 6f63a52e168e57203553e0858b508c432998ef0e (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 6f63a52e168e names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (6f63a52e168e57203553e0858b508c432998ef0e), opened by minimax-3

### S22 — A unit that will not land is retired, with its work kept

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-retire.service.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/core/src/lib/work-units/workflow-invariants.service.ts`, `packages/core/src/lib/contracts/interfaces/work-retire.interface.ts`, `packages/core/src/lib/tools/work-unit.tool.ts`, `packages/core/src/lib/tools/work-unit-roots.helper.ts`, `packages/cli/src/contracts/constants/work-command.constant.ts`, `docs/delendai/TOKEN-BUDGETS.md`, `packages/core/tests/src/lib/work-units/work-retire.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/work-retire.service.spec.ts`
- `work retire --ref=<branch> --reason=<why>` writes the unit's tip to
  `refs/<namespace>/retired/<unit>`, pushes it, and only then closes the
  unit's pull request with the reason and removes its work ref and its
  publication, on the forge and here. A tip that cannot be kept removes
  nothing.
- It refuses a branch that is no unit, a missing reason, uncommitted
  changes, and a unit with a worktree unless `--with-worktree` is passed.
- `work doctor` names it as the remedy for a ref nobody works on.
- With leases (x00850): another agent's live unit is refused whatever the
  caller asserts, its owner retires it freely, and a recent unit with no
  lease needs `--unowned`, the caller's word that it is not somebody's. A
  worktree no longer needs a flag of its own.
- A retired ref is not left in the clone once the forge has it, and
  `work doctor` gains `no-stray-refs`: a ref that is no branch, no tag,
  nothing fetched from a configured remote and not the product's own
  bookkeeping is named, with retiring as the way to keep a tip (E27;
  `packages/core/src/lib/work-units/stray-refs.service.ts`,
  `packages/core/src/lib/work-units/idle-units.service.ts`).
- shipped-in: `6f63a52e168e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 7fa7e95db684, validate exit 0, tests 295/295 — Deliver merge 7fa7e95db68420cfe10ded78ec9144e3e82243f9; the proposal's shipped-in was superseded by this later publication of the same unit (attribution reported 'delivered again by 7fa7e95db684'). Declared gate run batched green: 34 test files / 295 tests, exit 0. Behaviour pinned by named specs.
- review-attribution: claude-opus-5-5 from commit 7fa7e95db684 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-S34-g1/the-queue-offers-no-work-of-the-reviewer-s-own (7fa7e95db68420cfe10ded78ec9144e3e82243f9), opened by minimax-3

### S23 — A kept unit is brought forward or named, and retiring asks nobody to tidy first

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/kept-unit-hydration.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/work-unit-enter-briefing.service.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/src/lib/work-units/workflow-invariants.service.ts`, `packages/core/src/lib/contracts/interfaces/work-briefing.interface.ts`, `packages/core/tests/src/lib/work-units/kept-unit-hydration.service.spec.ts`, `packages/core/tests/src/lib/work-units/work-retire.service.spec.ts`, `packages/core/tests/src/lib/work-units/workflow-invariants.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/kept-unit-hydration.service.spec.ts packages/core/tests/src/lib/work-units/work-retire.service.spec.ts`
- `work enter` on a unit that holds no commit of its own and is behind
  fast-forwards it to the integration base and says `hydrated`; a unit with
  commits or uncommitted changes is left to its agent (E25).
- `work doctor` gains `units-hold-work`: a clean unit with nothing ahead and
  the integration branch gone on is named, with `enter` or `retire` as the
  remedy.
- `work retire` keeps uncommitted changes to tracked files as a second
  retired ref instead of refusing, refuses only files git does not track,
  and keeps nothing for a tip the integration branch already holds (E26).
- The held-slice refusal asks the lease: a unit its owner left, or whose
  work landed, no longer keeps other agents out of its slice.
- `post-merge` in the main checkout runs `work reap --apply`
  (`lefthook.yml`): a unit whose work the merge brought in is collected
  without waiting for a person.
- shipped-in: `6f63a52e168e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 6f63a52e168e, validate exit 0, tests 295/295 — Deliver merge 6f63a52e168e57203553e0858b508c432998ef0e (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 6f63a52e168e names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (6f63a52e168e57203553e0858b508c432998ef0e), opened by minimax-3

### S24 — Only the main checkout installs the clone's hooks

- **Status**: done
- **Files**: `package.json`, `bun.lock`, `tools/scripts/git/refresh-candidate-artifacts.constant.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`, `tools/scripts/git/prepare-clone.script.spec.ts`
- **Gate**: `npx vitest run tools/scripts/git/prepare-clone.script.spec.ts tools/scripts/git/refresh-candidate-artifacts.script.spec.ts`
- `trustedDependencies` names the packages whose install scripts run, and
  the hook manager is not one of them: `prepare`, in the main checkout, is
  the only thing that installs hooks (E24).
- The queue's refresh installs with `--ignore-scripts` and merges with no
  hooks: a throwaway worktree writes nothing into the clone it belongs to.
- shipped-in: `6839c65ecf19`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 6839c65ecf19, validate exit 0, tests 295/295 — Deliver merge 6839c65ecf19b69cc2cf7511bceb29728e309903 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 6839c65ecf19 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-swarm-run-that-can-be-checked (6839c65ecf19b69cc2cf7511bceb29728e309903), opened by minimax-3

### S25 — An automatic commit carries the slice's files, not the event's

- **Status**: retired — 2026-10-05. The slice listener already takes the files a slice declares (`parseSliceFilesField`), not what an event lists. The foreign files of E13 came in because the slice declared a directory and the commit was made in the shared checkout, where another agent had changes: a unit's worktree holds one agent's changes, and since S9 a server with no declared agent commits nothing.
- **Files**: `plugins/commit-policy/src/lib/engine.ts`
- **Gate**: `npx vitest run plugins/commit-policy/tests/src/lib/persistence/engine-policy-routing.spec.ts`
- The commit carries only the files the slice declares that this agent
  changed; anything else the event listed stays in the working tree (E13:
  one automatic commit carried another proposal's files).
- Not done on purpose yet: the persistence layer passes the claim whole so a
  checkpoint never drops a path the ref already made durable. Narrowing it
  needs the producer of the event's file list examined first, so the fix
  lands where the foreign files came in. Since S9 no unit is opened under an
  undeclared identity, which is how that commit came to exist.

### S26 — An implementation unit reserves its slice on the forge

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/slice-reservation.service.ts`, `packages/core/src/lib/work-units/work-unit-enter.service.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/src/lib/contracts/interfaces/slice-reservation.interface.ts`, `packages/core/tests/src/lib/work-units/slice-reservation.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/slice-reservation.service.spec.ts`
- `work enter` for implementation reserves the slice with the same push only
  one of two can win, so two machines entering one slice in the same minute
  are told apart before either writes: today the held-slice refusal reads
  refs each machine has already fetched.
- The reservation is `refs/<namespace>/claims/slice/<proposal>/<slice>`; a
  unit for `all` covers every slice and a slice covers `all`. It holds while
  its unit is on the forge, or for the time a silent unit is given when it
  was never pushed; `work retire` gives it back. `--alongside` skips it, and
  where there is no forge nothing is reserved.
- shipped-in: `6f63a52e168e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 6f63a52e168e, validate exit 0, tests 295/295 — Deliver merge 6f63a52e168e57203553e0858b508c432998ef0e (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 6f63a52e168e names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (6f63a52e168e57203553e0858b508c432998ef0e), opened by minimax-3

### S27 — A reviewer that ran nothing records nothing, in the project's language

- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/review-claim.service.ts`, `plugins/proposals/src/lib/services/review-claims.service.ts`, `plugins/proposals/src/lib/tools/review-claim.tool.ts`, `plugins/proposals/src/lib/contracts/constants/review-claims.constant.ts`, `plugins/proposals/src/lib/contracts/constants/review-claim-schema.constant.ts`, `packages/cli/src/commands/review.command.ts`, `packages/cli/src/contracts/constants/review-command.constant.ts`, `plugins/proposals/tests/src/lib/tools/review-reservation.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/tools/review-reservation.spec.ts`
- A reviewer that could not inspect or run what it claimed gives the claim
  back instead of recording a verdict: `delendai review release <id>
  --note="<why>"` (the claim tool's `release`). It commits a `Releases`
  trailer, which undoes the claim for every reader of the unit, and deletes
  the forge reservation, so the next reviewer takes the proposal at once.
  `review next` tells every reviewer about it beside the two verdicts (E9,
  E10).
- The language of a verdict's text is S30.
- shipped-in: `cef6142b3105`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 17d1fa53353c, validate exit 0, tests 295/295 — Deliver merge 17d1fa53353c7b4de9ad67392f75e198b301c26d; the proposal's shipped-in was superseded by this later publication of the same unit (attribution reported 'delivered again by 17d1fa53353c'). Declared gate run batched green: 34 test files / 295 tests, exit 0. Behaviour pinned by named specs.
- review-attribution: claude-opus-5-5 from commit 17d1fa53353c names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-S36-g1/a-reviewer-can-cite-each-criterion (17d1fa53353c7b4de9ad67392f75e198b301c26d), opened by minimax-3

### S28 — A retired slice owes nothing, and a proposal's own document is never a missing file

- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/proposal-completeness.ts`, `plugins/proposals/src/lib/services/review-entry.service.ts`, `plugins/proposals/tests/src/lib/services/proposal-completeness.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/proposal-completeness.spec.ts`
- `retired` is a slice status the tools read. A retired slice is settled:
  it does not keep its proposal from closing, its files are not owed, and
  no delivering commit is asked of it on the way to review (E28).
- A slice file that is the proposal's own document, in whatever status
  folder, is never reported as missing.
- shipped-in: `70f0d67de5cd`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 70f0d67de5cd, validate exit 0, tests 295/295 — Deliver merge 70f0d67de5cddf9a6ce91f75abf65e9eadbd2e77 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 70f0d67de5cd names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (70f0d67de5cddf9a6ce91f75abf65e9eadbd2e77), opened by minimax-3

### S29 — Work nobody can see is named, and retired work can be read

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/hidden-work.service.ts`, `packages/core/src/lib/work-units/workflow-invariants.service.ts`, `packages/core/src/lib/work-units/forge-work-refs.service.ts`, `packages/core/src/lib/work-units/work-unit-retire.service.ts`, `packages/core/src/lib/work-units/work-unit.service.ts`, `packages/core/src/lib/tools/work-unit.tool.ts`, `packages/cli/src/contracts/constants/work-command.constant.ts`, `packages/core/tests/src/lib/work-units/hidden-work.service.spec.ts`, `packages/core/tests/src/lib/work-units/work-retire.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/hidden-work.service.spec.ts packages/core/tests/src/lib/work-units/work-retire.service.spec.ts`
- `work doctor` gains three invariants: `no-stashed-work`,
  `units-are-on-the-forge` (a unit's commits that stayed on this machine)
  and `units-are-committed` (changes a unit left uncommitted). Each has a
  grace period, read from when the work was last touched, so work in hand
  is not called work left behind (E29, E30).
- `work retired` lists what the forge keeps of units that did not land and
  of work rescued from nowhere, and says how to read one and bring it back.
- shipped-in: `6f63a52e168e`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 6f63a52e168e, validate exit 0, tests 295/295 — Deliver merge 6f63a52e168e57203553e0858b508c432998ef0e (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 6f63a52e168e names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (6f63a52e168e57203553e0858b508c432998ef0e), opened by minimax-3

### S30 — A project declares its documentation language and who counts as another reviewer

- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/documentation-language.service.ts`, `plugins/proposals/src/lib/tools/authoring.tool.ts`, `plugins/proposals/src/lib/tools/authoring-options.ts`, `plugins/proposals/src/index.ts`, `tools/scripts/lint/closed-with-independent-approval.script.ts`, `delendai.config.json`, `plugins/proposals/tests/src/lib/services/documentation-language.service.spec.ts`, `plugins/proposals/tests/src/lib/tools/proposal-review-claim.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/documentation-language.service.spec.ts`
- `documentationLanguage: "en"` (proposals plugin option): a verdict whose
  note is plainly not English is refused and writes nothing. Undeclared,
  nothing is checked. This repository declares `en` (E9).
- `reviewIndependence` defaults to `instance`: another agent of the same
  model may review, so a project with one subscription can review its own
  work, as long as the two instances are seen to differ (S13). A project
  that wants another model sets `model`; this repository does.
- shipped-in: `00b2fc1256b6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 657da3ff9618, validate exit 0, tests 295/295 — Deliver merge 657da3ff96183e12acf10efe5cef4ee54b54273f; the proposal's shipped-in was superseded by this later publication of the same unit (attribution reported 'delivered again by 657da3ff9618'). Declared gate run batched green: 34 test files / 295 tests, exit 0. Behaviour pinned by named specs.
- review-attribution: claude-opus-5-5 from commit 657da3ff9618 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (657da3ff96183e12acf10efe5cef4ee54b54273f), opened by minimax-3

### S31 — A claim takes the worktree with it

- **Status**: done
- **Files**: `packages/core/src/lib/work-units/work-claim.service.ts`, `packages/core/tests/src/lib/work-units/work-claim.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/work-claim.service.spec.ts`
- `work claim` on a unit that has a worktree points that worktree at the
  new name before the old one is removed, so a stalled unit changes hands
  in one step and is left under one name (E31).
- shipped-in: `27b60933038a`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 27b60933038a, validate exit 0, tests 295/295 — Deliver merge 27b60933038a5913ccecf4856cecc24e02b33a4e (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 27b60933038a names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (27b60933038a5913ccecf4856cecc24e02b33a4e), opened by minimax-3

### S32 — A review pack changes only the proposals it claimed

- **Status**: done
- **Files**: `tools/scripts/lint/closed-with-independent-approval.script.ts`, `tools/scripts/lint/closed-with-independent-approval.script.spec.ts`, `packages/core/src/lib/work-units/work-unit-generation.service.ts`
- **Gate**: `npx vitest run tools/scripts/lint/closed-with-independent-approval.script.spec.ts`
- CI refuses a review pack whose diff changes a proposal none of its
  commits claims: its pull request then says, by construction, which
  verdicts are its author's (G5).
- A pack that went stale is settled the way this run was, with the tools
  that exist now: `work retire` keeps it on the forge and frees its claims,
  the verdicts that name a commit and a gate are carried by a `reconcile`
  unit the owner labels, and the rest are reviewed again. No command does
  the three in one step; nothing in a second run has asked for one yet.
- Entering your own unit from another directory is refused as "another
  session"; the refusal now says how to get back in.
- shipped-in: `00b2fc1256b6`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 345f73884420, validate exit 0, tests 295/295 — Deliver merge 345f73884420995774374681a50ff8ea6d827777; the proposal's shipped-in was superseded by this later publication of the same unit (attribution reported 'delivered again by 345f73884420'). Declared gate run batched green: 34 test files / 295 tests, exit 0. Behaviour pinned by named specs.
- review-attribution: claude-opus-5-5 from commit 345f73884420 names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-S37-g1/a-session-re-enters-its-own-unit (345f73884420995774374681a50ff8ea6d827777), opened by minimax-3

### S33 — A slice delivered from a unit of another name is still found

- **Status**: done
- **Files**: `plugins/proposals/src/lib/services/review-entry.service.ts`, `plugins/proposals/tests/src/lib/services/review-entry.service.spec.ts`
- **Gate**: `npx vitest run plugins/proposals/tests/src/lib/services/review-entry.service.spec.ts`
- Handing a proposal to review records each slice's delivery. When no merge
  names the slice's unit, the delivery is the newest merge that changed the
  slice's files and in which the commit that cites the proposal is one that
  changed them, or that created the proposal's own document beside the
  work. A merge of another unit that does neither is not taken (E32). The
  seven proposals of E32 resolve to the pull requests that delivered them.
- `work publish` reports a unit kept on purpose as `keep-work-ref`, a step
  that succeeded, not as a failed `remove-work-ref`
  (`packages/core/src/lib/work-units/work-publish.service.ts`,
  `packages/core/src/lib/work-units/work-unit-land.service.ts`).
- shipped-in: `70f0d67de5cd`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — verified at 70f0d67de5cd, validate exit 0, tests 295/295 — Deliver merge 70f0d67de5cddf9a6ce91f75abf65e9eadbd2e77 (proposal shipped-in); its feat commits are ancestors of the merge and every declared file exists on develop. Declared gate run batched green: 34 test files / 295 tests, exit 0 (core work-units 183, proposals+commit-policy+kpis+storm 72, cli review.command 11, proposals-root swarm 29). Behaviour pinned by named specs, not by the slice file list alone.
- review-attribution: claude-opus-5-5 from commit 70f0d67de5cd names refs/heads/delendai/wip/claude-opus-5-5/implement/x00835-all-g1/a-review-swarm-leaves-verdicts-that-can-be (70f0d67de5cddf9a6ce91f75abf65e9eadbd2e77), opened by minimax-3

## dependency graph

- S3 reads x00850's lease to recognise another orchestrator's identity.
- S13, S14 and S16 read x00850's lease for the instance; S14 uses r00048's
  revision CAS.
- S21 reads x00850's lease to tell a live unit from an abandoned one.
- S17 needs S12 and S14 to have a single final state to assert.
- E7's root cause (the guard recognising only Claude's markers) is fixed by
  the other orchestrator's guard work; this proposal does not repeat it.
- The others are independent.

### S34 — The queue offers a reviewer no work its own model delivered
- **Status**: review
- **Files**: `plugins/proposals/src/lib/services/review-queue-reviewer.service.ts`, `plugins/proposals/src/lib/tools/review-queue.tool.ts`, `plugins/proposals/src/lib/contracts/interfaces/review-queue.interface.ts`, `plugins/proposals/src/lib/contracts/constants/review-queue-schema.constant.ts`, `plugins/proposals/tests/src/lib/services/review-queue-reviewer.service.spec.ts`
- **Gate**: `bunx vitest run --root plugins/proposals tests/src/lib/services/review-queue-reviewer.service.spec.ts`
- Found 2026-10-05: `review next --agent=claude-opus-5-5` claimed `r00040`, every slice of which that same model had delivered, in a project whose `reviewIndependence` is `model`. The approval would have been refused as a self-approval after the reading was done, and the claim kept other reviewers out meanwhile.
- `review_queue` now answers for the agent that asks. Under model independence, a slice waiting for a verdict that the asker's model delivered is `needs-another-reviewer`, with a sentence that says so, and it is not counted in `needsVerdict`. `review next` reads the same field, so it skips those proposals with no change of its own. Where another instance of the model may review, or the delivery is unrecorded, nothing changes: the approval decides.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S35 — A reviewer's queue is read from its own unit
- **Status**: review
- **Files**: `plugins/proposals/src/lib/services/review-unit-tree.service.ts`, `plugins/proposals/src/lib/tools/review-queue.tool.ts`, `plugins/proposals/tests/src/lib/tools/review-queue-swarm.tool.spec.ts`
- **Gate**: `bunx vitest run --root plugins/proposals tests/src/lib/tools/review-queue-swarm.tool.spec.ts`
- Found 2026-10-05: after `review approve x00835 S18` the very next `review next` offered S18 again. The verdict was a commit in the reviewer's unit; the queue read the shared checkout, where the slice still waited for one. A reviewer that trusted the queue would review the same slice for ever.
- When the caller names its unit (`review next` always does), `review_queue` reads the proposals from that unit's worktree. A unit not checked out on this machine, or a proposals folder outside the workspace, reads as before.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S38 — A retired slice waits for no verdict
- **Status**: review
- **Files**: `plugins/proposals/src/lib/services/review-queue.service.ts`, `plugins/proposals/src/lib/services/review-queue-slice.service.ts`, `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
- **Gate**: `bunx vitest run --root plugins/proposals tests/src/lib/tools/review-queue.tool.spec.ts`
- Found 2026-10-05: `review next` offered this proposal's S25, retired that morning, as a slice needing a verdict, attributed to `claude-sonnet-5-5` from Git. A retired slice has no review round, so the queue asked Git who delivered its files and sent a reviewer to approve work that was given up on purpose. A slice whose status is `retired` is now settled in the queue, with a sentence that says why. What one slice needs from a reviewer moved to `review-queue-slice.service.ts`, which keeps the queue's service under 400 lines.

### S39 — The queue cites the delivery an approval is accepted with
- **Status**: review
- **Files**: `plugins/proposals/src/lib/services/review-queue.service.ts`, `plugins/proposals/tests/src/lib/tools/review-queue.tool.spec.ts`
- **Gate**: `bunx vitest run --root plugins/proposals tests/src/lib/tools/review-queue.tool.spec.ts`
- Found 2026-10-05 reviewing `x00770`: the approve call `review next` handed out cited each slice's recorded `shipped-in`, and every approval came back "is not the slice as it stands: x00770 was delivered again by aa99eb781d2f". The approval checks for a later delivery of the same files and the queue did not, so a reviewer who followed the call to the letter was refused five times.
- The queue now asks the same question (`supersedingDelivery`) of the first candidate and, when a later delivery superseded it, cites that one first. The spec reproduces the case (a slice recording its first delivery, delivered again) and fails without the change.
=======
- review-state: in_review
- review-implementer: claude-opus-5-5

### S37 — A session goes back to its own unit, whatever generation it is
- **Status**: review
- **Files**: `packages/core/src/lib/work-units/work-unit-generation.service.ts`, `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- **Gate**: `npx vitest run packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
- Found 2026-10-05: I retired my stale review unit `batch-all-g1` and kept working in `batch-all-g2`. The next `review next --session=<g2's session>` entered a new `batch-all-g1` and claimed `x00870` there, and the approval of `x00870` with the same session went to `g2`, which had claimed nothing, and was refused. `chooseGeneration` took the first generation no other session held, so a generation freed by a retirement came before the one the session was in.
- A session that holds a unit of that agent, proposal and slice now goes back to it, whichever generation; only a session that holds none takes the first free one. The spec fails without the change.
### S36 — A reviewer can give the evidence each criterion asks for
- **Status**: review
- **Files**: `packages/cli/src/commands/groups/proposals.ts`, `packages/cli/src/commands/review.command.ts`, `packages/cli/src/lib/review/review-brief.service.ts`, `packages/cli/src/contracts/constants/review-command.constant.ts`, `packages/cli/src/contracts/interfaces/review-queue-view.interface.ts`, `packages/cli/src/commands/review.command.spec.ts`
- **Gate**: `npx vitest run --project @delendai/cli packages/cli/src/commands/review.command.spec.ts`
- Found 2026-10-05 approving `x00870` S1: "approve requires empirical evidence: evidence.acceptanceCriteria must cover every declared criterion". The tool asks for one piece of evidence per declared criterion, and neither `delendai review approve` nor `delendai proposals review` could pass any. From a shell, no slice that declares acceptance criteria could be approved at all, whatever the reviewer had verified.
- Both commands take `--criterion="<criterion> => <evidence>"`, once per criterion; the first ` => ` separates them, since evidence is free text. The call `review next` hands a reviewer now carries one `--criterion` per declared criterion, with the criterion already written, so a reviewer of any model fills in evidence instead of guessing a format. The brief moved to `lib/review/review-brief.service.ts` and the queue's shapes to `contracts/interfaces/`, which brings `review.command.ts` from 404 to 349 lines.

## acceptance

- After a swarm run, `work doctor` reports nothing hanging, and the clone
  and the forge both agree with it.

- Re-running the 2026-10-03 swarm's mistakes against the tools: a bare
  `approve`, a `request_changes` without a commit, a verdict from the shared
  checkout, `MiniMax-M3` beside `minimax-m3`, a pack merging another pack, a
  pack deleting `done/…/x00785`, and a stale dist CLI are each refused with
  what to do instead.
- A verdict shaped like P1 goes through unchanged.
