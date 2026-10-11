---
id: x00880
title: "What a review swarm of eleven agents got wrong, and what let it"
kind: fix
status: in-progress
type: proposal
track: swarm
date: 2026-10-11
---

# x00880 — What a review swarm of eleven agents got wrong, and what let it

## goal

Every departure from the workflow that the review swarm of 2026-10-11 shows is written down here with its evidence while the swarm runs, and each one is closed at the place in the product that allowed it, so the next swarm cannot repeat it whatever its models are.

## why

On 2026-10-11 the owner launched eleven agents on five models to review the proposals waiting in `review/`: three MiniMax M3.1, two GPT Luna 6.0, two GLM Flash 5.3, two ChatGPT 5.4 and two Qwen Flash 3.8. Within ten minutes the forge showed things no agent was told to do and nothing stopped. An agent is not at fault for what the product accepts: each entry below names what was observed and what in delendai let it happen.

## non-goals

- Judging the verdicts themselves. A verdict is its reviewer's; what is recorded here is how the work was carried, not whether an approval was right.
- Rules that only hold for one model or one host.

## slices

### S1 — The evidence, as it is observed

- **Status**: in-progress
- **Files**:
  - `docs/delendai/proposals/in-progress/x00880-what-a-review-swarm-of-eleven-agents-got-wrong-and-what-let-it.md`
- **Gate**: none
- acceptance:
  - Each observation names when it was seen, the refs or commits that show it, and the slice that closes it.

Observed on the forge at 04:25–04:30 local time (refs under `delendai/wip/` and `refs/delendai/claims/`, and `delendai work swarm`):

1. **One model, several names.** Five models were launched; eight agent names are on the forge. `minimax-3.1` and `minimax-m31` are the same model. `qwen-3.8-flash` and `qwen3-flash` are the same model, and the second dropped its version. `glm-5.3-flash` and `glm-5.3-max`: both GLM agents are Flash, and one calls itself Max. No ref names GPT Luna 6.0 at all, though two were launched; `gpt-5.4` may be carrying them. The product takes whatever string `--agent` is given. Independence of review is decided by this name, so a model that names itself two ways can review its own work, and a count of agents by name is wrong. → S2.
2. **Nineteen units for eleven agents.** `minimax-m31` holds five review units (`batch-all-g1`, `g3`, `g4`, `g5`, `g6`), `glm-5.3-flash` three, `qwen` three under two names. Six units hold no commit at all (`glm-5.3-flash/…g5`, `minimax-3.1/…batch-all-g1`, `qwen-3.8-flash/…g1`, `qwen3-flash/…g3`, …). Asking the review queue again without the session it printed opens another unit each time. → S3.
3. **Five proposals reserved in 28 seconds by one agent.** `minimax-3.1` claimed f00267, f00271, f00275, f00509 and f00511 between 04:18:06 and 04:18:34, then took six minutes to record its first verdict. Four proposals were held from every other reviewer while it read the first. → S4.
4. **A claim taken and dropped.** `gpt-5.4` claimed r00040 at 04:20:14 and released it at 04:22:15 with no verdict, then claimed f00643. → S4. (Corrected at 07:20: the release does carry its reason, in the body of its commit — see 23.)
5. **Units named by whoever opened them.** The slice of a review unit is `batch-all` for most and `batch-review` for one; the topic is `verdicts`, `review-pack`, `review-pack-g1` or `packs-1011`. The name of a unit is what every listing sorts and matches by. → S5.
6. **The swarm view calls every review pack a duplicate.** `delendai work swarm` reports "duplicate batch-all is live 16 times; keep one" and lists all of them under "to sort out". Many review packs at once is how a review swarm works; the one real finding a person needs from that view is buried under a false one. → S6.
7. **Claims recorded in a unit with no reservation on the forge.** Units of `minimax-m31` carry commits `claim x00877`, `claim x00875` and `claim q00018`; `refs/delendai/claims/review/` held no ref for those three when listed at 04:27. Either the reservation was never pushed or it was released without a commit saying so. To be confirmed before it is given a slice.
8. **Reservations that outlived their unit.** `refs/delendai/claims/slice/x00554/s2`, `…/q00010/s3` and `…/f00757/all` belong to units whose pull requests merged hours before. These are the orchestrator's own, not the swarm's; they are here because the same listing shows them. To be confirmed against the reservation reaper.

Observed between 04:30 and 04:50:

9. **A change requested that the document already carried.** `qwen3-flash` requested changes on q00010 S3 at 04:27:45: "Approve requires either (a) a real independent reviewer round … or (b) S3's acceptance text rewritten to enumerate c00156 as a named documented exception. Recommend (b)". Its unit is based on `f894a0987`, and the document at that commit already reads "`done` sin peer review y nombrada aquí como excepción con su motivo (`c00156`)" in the acceptance and "1 (`c00156`) `done` without one" in the status. The criterion it quotes as unmet is the wording of the round before, which survives in the previous reviewer's `review-log` line of the same section. A verdict was reached from the log of an earlier verdict rather than from the text under review. → S7.
10. **Five more proposals reserved by one agent.** `glm-5.3-max` claimed q00014, x00539, r00048, f00536 and x00835 between 04:24:59 and 04:27:28 and had recorded no verdict on any of them fourteen minutes later; it released q00014 at 04:39. → S4.
11. **One proposal passed from hand to hand.** r00040 was claimed and released by `gpt-5.4` (04:20–04:22) and by `minimax-m31` (04:25–04:27), then claimed by `qwen3-flash` (04:29). `minimax-m31` did the same with x00877, x00875 and q00018, one unit each, five minutes each. Each release says why in the body of its commit, where no later reviewer is shown it, so each finds out for itself what the one before found. → S4.
12. **Every reviewer runs the whole validation, for the same commit.** At 04:50 the machine's load was 35. `bun run validate` and `bun run test` (the whole repository's suite, about half an hour each) were running in the units of `minimax-3.1`, `glm-5.3-max` and `gpt-5.4` at once, queued behind one another on the compute lock, one of them for 32 minutes. The verdict tool asks each approval for a validation exit code and a test count, and gives no way to answer with the run that already certified that commit on the forge, so eleven reviewers each prove on one machine what one CI run proved once. → S8.
13. **Tests run from the shared checkout.** A `vitest run` over specs of f00512 was running with the shared checkout as its working directory, not from a unit. Reading is allowed there; a test run writes caches and reports into the tree every other agent starts from. → S8.
14. **A pull request titled "review batch".** #991, from `qwen-3.8-flash`, carries two approvals of x00875 under that title and a body that lists commit subjects. The title is what the queue and a person see. → S5.
15. **A review pack fails on text its reviewer did not write.** By 04:55 four of the seven review packs opened were red on `lint-governance` or `lint-presets`, each for something in the proposal it closed, not in the verdict: x00875 named three unreferenced objects by hash (#991); f00538 quotes a tree, "produced tree `1a19f55e9`", which the cited-commits lint took for an orphan commit (#992); r00040 has a slice retired weeks ago, which the completeness lint counts as pending once the proposal is in `done/` (#996); and one pack left the agent catalog stale (#996). Every one of these rules only looks at `done/`, so a proposal carries the fault through `review/` unseen and the reviewer who approves it is the one stopped. A reviewer may not change the product, so it cannot fix what stops it. → S9.

Observed at 05:15:

16. **A third name for one model, and a version nobody launched.** Two units belong to `glm-4.6-flash` (`batch-all-g1`, `batch-all-g2`). The GLM agents are Flash 5.3: on the forge and in the worktrees they are now `glm-5.3-flash`, `glm-5.3-max` and `glm-4.6-flash`. Nine names for five models. → S2.
17. **A pack of approvals titled as a release.** #993 is titled "chore(review): release r00040" and carries an approval of f00643; #998 is "chore(review): release f00271" and carries five claims and the verdicts on f00267. `work publish` titles a pull request from a commit of the unit, and for a review pack that is whichever bookkeeping commit it meets. → S5.

18. **"validate exit 0" on approvals that ran a focused gate.** Every approval records `validate exit 0` beside a count such as `tests 28/28` or `tests 6/6`, and its note says which focused specs were run. The field is named for the repository's whole validation; what fills it is the exit code of whatever the reviewer ran. The record says more than was checked. → S8.

Observed at 07:00:

19. **A reviewer edits the proposal it is approving.** `minimax-m31` approved the five slices of f00538, saw its pack (#992) fail on the quoted tree of observation 15, and committed `fix(f00538): the cited hash is a tree, not a commit` to the reviewed document in a second review unit, `review/f00538-review-g1/the-cited-tree-is-not-a-commit` (#1008). The pack it replaced was left open, so one set of verdicts is in two pull requests. The reviewer was right about the fault and had no legal way to act on it: the rule that stopped it was wrong (fixed in S9), and nothing lets a reviewer hand a finding about the document back to its implementer short of refusing the slice. → S9, S3.
20. **The orchestrator did the same from the other side.** The implementer session (`claude-opus-5-5`) rewrote x00875's three citations in its own unit (#1002) while `qwen-3.8-flash` held x00875 in pack #991; the pack then conflicted with develop and waited to be brought forward. The rule against editing a proposal under review exists and is written down for agents, not enforced: a unit may commit to a proposal another agent has claimed for review. → S4.
21. **The tool takes an approval the closing gate refuses.** f00538 S2 and S3 were delivered by a commit that names no work ref and no author the product can read; the review tool recorded `review-implementer: unrecorded … independence could not be verified`, accepted the approval and closed the proposal, and `closed-with-independent-approval` then refused the pack (#1008) for exactly that. Two rules answer one question differently, and the reviewer learns it after five approvals. Leaving such a close to the owner is the intended outcome; offering it to a reviewer as ordinary work is not. → S9.
22. **More claims than reviews in hand.** At 07:00 seventeen proposals carry a review claim on the forge while six review units are alive and eight packs wait in pull requests; which claim belongs to which of them is not something the swarm view shows. → S4.

23. **Most releases were the product's doing, and observations 4, 10 and 11 misread them.** Read in full at 07:20, the release commits of the swarm give their reasons, and the reasons are refusals the reviewer met after claiming: "this agent already reviewed the prior round" (`gpt-5.4`, r00040); "S1 is changes_requested and only the implementer can resubmit it … nothing here can receive a verdict"; "proposal_review refuses this slice with missing-submit-identity"; "the guard requires the fix-verifier to differ from glm-5.3-flash". The queue offered work the verdict would refuse, and the claim tool took a proposal with nothing in it to judge. What was recorded here as agents dropping work for no reason was written from commit subjects alone. → S4.

Observed at 08:30:

24. **A verdict costs the whole matrix, seven times.** The pack #1001 (`gpt-5.4`) changes one proposal document and the generated agent catalog. Between 05:13 and 07:28 it ran the full CI seven times, and so did #992 and #996; #991 ran it five times before landing. The queue's log says why on every pass: "#1001 is brought forward first — it and #995, which lands first, both touch the apps, plugins, proposals, tools zone(s)", and of a pack of verdicts alone, "#1007 … both touch the proposals zone(s)". Two causes. The checked-in catalog listed every open proposal with its state, so any verdict that closed a proposal rewrote a generated file that the specs of three zones read; that copy is removed in q00022 S11 (#1011). And every pack changes files under the proposals folder, which one zone reads whole, so no two packs are ever independent and each one's checks are thrown away when another lands. With eleven reviewers the second is quadratic. → S10.

### S2 — An agent has one name, and it is not the model's to choose

- **Status**: in-progress
- **Files**:
  - `packages/core/src/lib/work-units/agent-alias.service.ts`
  - `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`
  - `packages/core/src/lib/development-policy/resolve.ts`
  - `packages/core/src/lib/development-policy/resolve.interface.ts`
  - `packages/core/src/lib/plugins/development-config-schema.constant.ts`
  - `packages/core/tests/src/lib/work-units/agent-alias.service.spec.ts`
- **Gate**: unit
- acceptance:
  - A project can declare the roster of a swarm (the agent names allowed to work in it). With a roster declared, entering a unit, claiming a review or recording a verdict under a name that is not on it is refused, listing the roster and the nearest name on it.
  - When the launcher names the agent (`DELENDAI_AGENT_ID`), an `--agent` that differs from it is refused, naming both: what the host declared is what reaches a ref, a claim or a verdict.
  - With neither, the spelling check that exists goes on applying; this slice does not make it guess harder.
  - A swarm of five models, launched against a roster of five names, leaves five names on the forge.

The check that exists (`agent-alias.service.ts`, written after the swarm
of x00878 signed one model six ways) refuses a name made of the same
letters and digits as one already at work. It let all three of today's
through, and it could not have done otherwise: `minimax-3.1` and
`minimax-m31` differ by a letter, `qwen3-flash` lost two digits, and no
reading of `glm-5.3-max` says its model is Flash. Its own header says
where the answer is: "caught by what the agent declares it is running,
not by guessing here". A model's account of itself is not a declaration.
The person who launches the swarm knows what was launched, so the names
are theirs to give, once, and the product's to hold everyone to.

Delivered 2026-10-11, the roster: `development.coordination.roster` in
the project's configuration names who may work in it, and `work enter`,
which every unit of every kind goes through, refuses any other name and
says which roster name the entrant probably is. Tried in a throwaway
project with the names of this swarm: `minimax-3.1` and `glm-5.3-max`
are refused and pointed at `minimax-m3.1` and `glm-5.3-flash`;
`glm-5.3-flash` enters. Still to do: refusing an `--agent` that
contradicts what the launcher declared in `DELENDAI_AGENT_ID`, and
saying in the launch instructions that a swarm is given its roster.

### S3 — Asking the review queue again does not open another unit

- **Status**: pending
- **Files**:
  - `packages/cli/src/commands/review.command.ts`
- **Gate**: unit
- acceptance:
  - `review next` without a session, from an agent that already holds a review unit with no verdict in it, resumes that unit instead of opening a new one.
  - A unit that was opened and never used ends when its session does; it is not left on the forge.

### S4 — A reviewer holds what it is reviewing, and is offered only what it can judge

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/services/review-claim.service.ts`
  - `plugins/proposals/src/lib/tools/review-claim.tool.ts`
  - `plugins/proposals/src/lib/contracts/interfaces/review-claim-outcome.interface.ts`
  - `plugins/proposals/src/lib/services/review-queue-slice.service.ts`
  - `plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts`
  - `plugins/proposals/tests/src/lib/tools/review-queue-candidates.spec.ts`
- **Gate**: unit
- shipped-in: `7a2ecb5a0d1f`
- acceptance:
  - A review unit that holds a proposal in review and has written nothing about it is refused another claim, naming the one it holds and the two ways on: a verdict, or giving it back.
  - A verdict on another proposal is refused the same way, since a verdict claims what it judges.
  - The queue does not offer a reviewer the fix of a round it reviewed: the slice waits for another reviewer, as the verdict would have said.

Delivered 2026-10-11. A release already records why, in its commit; showing that to the next reviewer was dropped from this slice, because with the queue no longer offering what will be refused the reasons left are particular to one reviewer. A unit committing to a proposal another agent holds for review (observation 20) is not closed here: it is the orchestrator's rule to keep, and S9's hand-over check is what removes the reason to break it.

### S5 — A review unit is named by the product

- **Status**: pending
- **Files**:
  - `packages/cli/src/commands/review.command.ts`
- **Gate**: unit
- acceptance:
  - The slice and the topic of a review unit are not arguments: every review unit of every agent is named the same way, differing only by agent and generation.

### S6 — The swarm view does not report review packs as duplicates

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/work-swarm-relations.service.ts`
  - `packages/core/tests/src/lib/work-units/work-swarm-relations.spec.ts`
- **Gate**: unit
- shipped-in: `b93e9014bf16`
- acceptance:
  - Review units of different agents, or of different sessions of one model, are not listed as duplicates of one another.
  - Two units implementing the same slice still are.

Delivered 2026-10-11: a unit whose kind reads work rather than does it is left out of the duplicate relation. Run against the live swarm, "to sort out" went from every pack of every reviewer to the one real overlap, the two units of observation 19.

### S7 — A reviewer judges the text under review, and the tool shows it which that is

- **Status**: pending
- **Files**:
  - `packages/cli/src/lib/review/review-brief.service.ts`
  - `packages/cli/src/lib/review/slice-sections.service.ts`
- **Gate**: unit
- acceptance:
  - The section a reviewer is handed for a slice separates what is under review (status, files, acceptance, the implementer's notes) from the record of earlier rounds, and names the earlier rounds as history.
  - When a slice comes back from "changes requested", the brief shows what changed in its section since that verdict.

### S8 — An approval can rest on the run that already certified the commit

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/tools/proposal-review.tool.ts`
  - `packages/cli/src/commands/review.command.ts`
- **Gate**: unit
- acceptance:
  - An approval may name the certifying run of the commit it verified (the forge's required check on that SHA) as its validation evidence; the tool reads the run's conclusion and refuses one that is not green or is of another commit.
  - A reviewer is told, in the brief, that the commit it reviews is already certified and which focused gate the slice declares, so that the whole suite is run by the forge once and not by each reviewer.
  - Review units run their commands from their own worktree; the brief gives the path, and the shared checkout is not offered as a place to run a gate.

### S9 — What would stop a proposal from closing is found before a reviewer meets it

- **Status**: in-progress
- **Files**:
  - `tools/scripts/lint/proposal-slice-completeness.script.ts`
  - `tools/scripts/lint/proposal-slice-completeness.script.spec.ts`
  - `tools/scripts/lint/proposal-cited-commits.script.ts`
  - `tools/scripts/lint/proposal-cited-commits.script.spec.ts`
- **Gate**: unit
- acceptance:
  - A retired slice of a closed proposal is finished: the completeness lint does not report it as pending.
  - A quoted tree or blob is not read as a citation of a commit.
  - Still to do, and what makes this slice whole: the two rules run on a proposal when it is handed to review, as they will when it closes, so the implementer is the one told.
  - A slice whose implementer the product cannot name is not offered to the review queue as ordinary work: the queue says the close is the owner's, as the closing gate will.

Delivered 2026-10-11, the two rules that were wrong: `retired` joins `done` as a status a slice of a closed proposal may be in, and a hash that names a tree or a blob is skipped by the cited-commits lint. x00875's three citations of unreferenced objects were rewritten in its own unit. Not yet delivered: running both rules at the hand-over to review.

### S10 — Two packs of verdicts on different proposals do not wait on each other

- **Status**: pending
- **Files**:
  - `tools/scripts/forge/independent-candidates.ts`
  - `tools/scripts/forge/candidate-footprint.ts`
- **Gate**: unit
- acceptance:
  - Measured first, after q00022 S11 has landed: how many CI runs a pack of verdicts takes from publication to merge, and which jobs they run.
  - If it is still more than one run per pack: two candidates whose only common ground is a zone that reads their files as data, and that change no file in common, land without being brought forward; the integration branch's own run after each merge is what checks them together.
  - A candidate that changes the code of a zone is brought forward as it is today.

Not started on purpose. The rule decides what lands unchecked against what, and it is worth changing on a measurement, not on the first cause found; S11 of q00022 may be most of it.

## acceptance

- Every observation in S1 either has a slice that closes it or is recorded as not a defect, with the reason.
- A second swarm of the same eleven agents leaves five agent names, one unit per session, no proposal held without a verdict in progress, and a swarm view whose "to sort out" is empty when nothing is wrong.

## notes

- The MCP server log the owner pasted on 2026-10-11 shows one more thing, of the host and not of the swarm: the server restarted six times in three hours, once per batch of merges that changed code it runs, and each start re-announced its whole summary. It is recorded in x00878 S42, which halved what a start costs.
