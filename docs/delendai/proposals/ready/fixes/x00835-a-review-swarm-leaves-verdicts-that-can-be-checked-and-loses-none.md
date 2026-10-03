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

### S11 — A claim is one shared reservation

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/review-claim.tool.ts`
- Claiming a proposal slice, for review or implementation, creates one
  reservation ref on the forge atomically (the same mechanism as #724's id
  reservation); a second claimer is refused with the holder named. The
  reservation carries the owning session (x00850's lease), so two instances
  of one model are two holders, not one (E15).

### S12 — A run ends with nothing hanging

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/workflow-invariants.service.ts`
- `work doctor` places every work ref, publication, worktree and local
  integration branch in exactly one state: merged and removed, waiting in an
  open pull request, or live with a lease that answers. Anything else is a
  broken invariant listed with its remedy: a unit never published, a
  publication with no pull request or no commits, a kept unit whose next
  slice went elsewhere, a worktree with no ref, a local integration branch
  carrying commits the forge lacks.
- The queue runs it after every merge and goes red while anything hangs, so a
  run that leaves work behind cannot look finished.

### S9 — An automatic commit is made once, by an agent, of the slice's files

- **Status**: pending
- **Files**: `plugins/commit-policy/src/lib/engine.ts`, `plugins/commit-policy/src/lib/services/commit-driver.ts`
- A slice event is committed by one server only (the one whose agent holds
  the slice), never by every server that heard it (E13).
- The commit carries only the files the slice declares that this agent
  changed; anything else in the working tree stays where it is.
- No automatic commit without a declared agent identity: a `client-…` or
  `unknown-agent` identity skips the commit and says why. The detection reuses
  the other orchestrator's agent-identification helper when it lands.

### S10 — A reviewer does not implement what it reviews

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/work-unit-enter.service.ts`
- An agent holding a review claim on a proposal, or that recorded a verdict on
  it, is refused an `implement` unit on that proposal (E14). A review verdict
  committed in a non-review unit is refused at publication.

### S13 — Independence is proved, or the review does not close

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/shared/independent-approval.ts`
- An actor is a canonical model id plus an instance (the session x00850's
  lease records). `model` independence compares canonical model ids, so an
  alias is the same model; `instance` independence compares instances, and
  an instance that cannot be proved is `unknown`, which closes nothing (G1).
- `unrecorded` implementers are accepted only for proposals that predate unit
  attribution; new work whose author cannot be named cannot reach `done` (G2).

### S14 — A verdict applies to the revision it was made on

- **Status**: pending
- **Files**: `plugins/proposals/src/lib/tools/review-verdict-lifecycle.ts`
- A verdict carries the proposal revision and delivery SHA it judged. Applying
  it to a proposal whose revision moved on is refused as a stale verdict, to
  be re-checked, never merged as text (G4, E3). The proposals SQLite
  projection's revision CAS (r00048) is the place to compare.
- A review pack's publication describes itself from its own verdict events
  (proposal, slice, revision, verdict), and the publish gate refuses a pack
  whose diff changes a proposal the description does not name (G5).
- Packs that went stale are settled by extracting their verdicts and
  re-applying the ones still valid on the current revision; the rest are
  recorded as superseded. No pack is rebased or merged to catch up.

### S15 — Recovery runs need no global git identity, and read-only writes nothing

- **Status**: pending
- **Files**: `tools/scripts/forge/keep-the-queue-moving.script.ts`, `tools/scripts/git/refresh-candidate-artifacts.script.ts`
- Every internal commit passes its identity explicitly (`-c user.name/email`
  or `GIT_AUTHOR_*`/`GIT_COMMITTER_*`), and a run reported as read-only
  creates no commit at all (G3).

### S16 — The run knows who joined it

- **Status**: pending
- **Files**: `packages/core/src/lib/tools/work-unit.tool.ts`
- An agent registers its canonical model id and instance when it first calls
  delendai in a session; the id must match the running model's declared id
  (family, version and tier), not free text (E17, E18). `work swarm` lists
  every registered agent with what it produced, so an agent that joined and
  produced nothing, or worked under another name, shows.

### S17 — A storm can be replayed

- **Status**: pending
- **Files**: `packages/core/tests/src/lib/work-units/swarm-storm.e2e.spec.ts`
- A fixture reproduces this run in a scratch repository: five reviewers of one
  model under aliases, two of another, two implementers, a proposal approved
  at revision N and sent back at N+1 while a third reviewer closes from N, a
  publication with no pull request, an abandoned unit, a candidate sixty
  commits behind, derived files, a server restart and an unattributable
  implementer. Settling every event must reach one final state whatever the
  order the agents finish in, with `work doctor` (S12) reporting nothing.

### S18 — The run reports its own incidents

- **Status**: pending
- **Files**: `plugins/project-kpis/src/index.ts`
- `project-kpis` counts what this run showed by hand: stale and superseded
  verdicts, actor alias collisions, unverifiable attributions, units never
  published, publications without a pull request, candidate lag, manual
  recoveries, and the time from the end of a run until `work doctor` is green
  again. A supervising agent reads these instead of inferring the state from
  branches.

### S19 — A unit's name says what it is

- **Status**: pending
- **Files**: `packages/core/src/lib/work-units/command-args.helper.ts`
- A review pack has one topic, derived by the tools, not chosen per agent; an
  implementation unit's default topic comes from its proposal's title instead
  of `work` (E20).

## dependency graph

- S3 reads x00850's lease to recognise another orchestrator's identity.
- S13, S14 and S16 read x00850's lease for the instance; S14 uses r00048's
  revision CAS.
- S17 needs S12 and S14 to have a single final state to assert.
- E7's root cause (the guard recognising only Claude's markers) is fixed by
  the other orchestrator's guard work; this proposal does not repeat it.
- The others are independent.

## acceptance

- After a swarm run, `work doctor` reports nothing hanging, and the clone
  and the forge both agree with it.

- Re-running the 2026-10-03 swarm's mistakes against the tools: a bare
  `approve`, a `request_changes` without a commit, a verdict from the shared
  checkout, `MiniMax-M3` beside `minimax-m3`, a pack merging another pack, a
  pack deleting `done/…/x00785`, and a stale dist CLI are each refused with
  what to do instead.
- A verdict shaped like P1 goes through unchanged.
