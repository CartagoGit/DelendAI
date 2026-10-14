---
id: x00880
title: "What a review swarm of eleven agents got wrong, and what let it"
kind: fix
status: review
type: proposal
track: swarm
date: 2026-10-11
last-transition-id: bc180466-1fd9-49ec-9fa5-4635ad541e0a
last-correlation-id: bc180466-1fd9-49ec-9fa5-4635ad541e0a
last-transition-from: in-progress
last-transition-at: 2026-10-11T08:48:56.360Z
shipped-in:
  - "5ebd1b302a07a95609073e064c59eb87113520ce"
  - "386d9c53664f"
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

- **Status**: review
- **Files**:
  - `docs/delendai/proposals/in-progress/x00880-what-a-review-swarm-of-eleven-agents-got-wrong-and-what-let-it.md`
- **Gate**: none
- shipped-in: `2b0e70e1f922`
- acceptance:
  - Each observation names when it was seen, the refs or commits that show it, and the slice that closes it.

Observed on the forge at 04:25–04:30 local time (refs under `delendai/wip/` and `refs/delendai/claims/`, and `delendai work swarm`):

1. **One model, several names.** Five models were launched; eight agent names are on the forge. `minimax-3.1` and `minimax-m31` are the same model. `qwen-3.8-flash` and `qwen3-flash` are the same model, and the second dropped its version. `glm-5.3-flash` and `glm-5.3-max`: both GLM agents are Flash, and one calls itself Max. No ref names GPT Luna 6.0 at all, though two were launched; `gpt-5.4` may be carrying them. The product takes whatever string `--agent` is given. Independence of review is decided by this name, so a model that names itself two ways can review its own work, and a count of agents by name is wrong. → S2.
2. **Nineteen units for eleven agents.** `minimax-m31` holds five review units (`batch-all-g1`, `g3`, `g4`, `g5`, `g6`), `glm-5.3-flash` three, `qwen` three under two names. Six units hold no commit at all (`glm-5.3-flash/…g5`, `minimax-3.1/…batch-all-g1`, `qwen-3.8-flash/…g1`, `qwen3-flash/…g3`, …). Asking the review queue again without the session it printed opens another unit each time. → S3.
3. **Five proposals reserved in 28 seconds by one agent.** `minimax-3.1` claimed f00267, f00271, f00275, f00509 and f00511 between 04:18:06 and 04:18:34, then took six minutes to record its first verdict. Four proposals were held from every other reviewer while it read the first. → S4.
4. **A claim taken and dropped.** `gpt-5.4` claimed r00040 at 04:20:14 and released it at 04:22:15 with no verdict, then claimed f00643. → S4. (Corrected at 07:20: the release does carry its reason, in the body of its commit — see 23.)
5. **Units named by whoever opened them.** The slice of a review unit is `batch-all` for most and `batch-review` for one; the topic is `verdicts`, `review-pack`, `review-pack-g1` or `packs-1011`. The name of a unit is what every listing sorts and matches by. → S5.
6. **The swarm view calls every review pack a duplicate.** `delendai work swarm` reports "duplicate batch-all is live 16 times; keep one" and lists all of them under "to sort out". Many review packs at once is how a review swarm works; the one real finding a person needs from that view is buried under a false one. → S6.
7. **Claims recorded in a unit with no reservation on the forge.** Units of `minimax-m31` carry commits `claim x00877`, `claim x00875` and `claim q00018`; `refs/delendai/claims/review/` held no ref for those three when listed at 04:27. Either the reservation was never pushed or it was released without a commit saying so. Read later: each of those claims was followed, minutes on, by a release commit in the same unit, and a release removes the reservation; the listing at 04:27 came after them. Not a defect.
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

Observed at 08:30, continued:

25. **A pull request of one claim.** #1012 (`minimax-3.1`, unit `batch-all-g2/packs3`) holds one commit, `chore(review): claim q00014`, and no verdict. It was published, armed, and failed `candidate-delivers`: "the forge reports 0 changed files". The queue then reported itself stuck on it, "1 armed and red". `work publish` refuses a review unit with no commit of its own, and a claim is a commit. → S11.
26. **Twenty-five to one.** By 08:20 forty-one approvals had landed and none of the five change requests written had; eighty-six more approvals wait in packs. Of the five requests, four (`gpt-5.4`, on f00512) are right: the acceptance still names commands the delivery renamed, and its implementer handed it over that way. One (`qwen3-flash`, on q00010 S3) asks for a change its own tree already had: the commit that named the exception was an ancestor of the verdict's, and the acceptance it judged said so. → S7.

Observed at 09:40:

27. **Locked out of one's own unit.** The orchestrator's pull request #1011 turned up in conflict with the integration branch. Its unit had ended at publication, and `work enter` for the same slice answered "q00022 s11 is reserved on the forge by claude-opus-5-5 … wait for it to land, take a slice nobody holds, or pass --alongside". The reservation was its own: the entry had chosen another name for the unit than the one that held it. Passing the generation and the topic by hand resumed it. → S12.
28. **The swarm went quiet for four hours with verdicts unpublished.** No reviewer committed between 07:38 and 11:29, when `glm-5.3-max` published its unit (#1016) and opened another; until then four review units sat on the forge as work refs. Read one by one: `glm-5.3-flash` g3 holds a claim and a release, nothing else. `glm-5.3-max` g3 holds six approvals of x00835 (S34 to S39), the close of x00835, f00536 and r00048, and an edit of x00539's document, none of it published. `glm-5.3-flash` g7 holds an approval of f00547 S2 and `qwen3-flash` g4 one of f00547 S1, and both then released f00547: "the remaining slices' verdicts belong to the glm-5.3-flash batch unit that will publish the pack together". Neither unit holds a claim any more, and `review next` publishes a unit for what it claims, so neither would ever have been published. The two reviewers arranged between themselves, through release notes, what the product has a flow for: publish the pack with the slices judged, and the rest returns to the queue. → S13.

Observed at 10:15:

29. **The head of the queue restarted five times and never got its verdict.** #995 was "the head of the queue" in every pass from 06:50 to 10:15. Its checks were started at 07:30, 08:04, 09:01, 09:34 and 10:02, each time because a candidate armed earlier had landed and the head was brought forward again; with eleven pull requests sharing the runners a run took from twenty-five to eighty minutes, longer than the gap between two merges. The one run that finished (09:34) was red, on the changed-file coverage of the orchestrator's own change, and that verdict arrived twenty-six minutes after the head had already been refreshed past it. Every other candidate was "brought forward first — it and #995, which lands first", the green ones included. Two things compound: a refresh throws away a run in flight, and a candidate waits behind a head whose only claim to the place is its number. → S10.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S2 — An agent has one name, and it is not the model's to choose

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/agent-alias.service.ts`
  - `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
  - `packages/core/src/lib/contracts/interfaces/development-policy.interface.ts`
  - `packages/core/src/lib/development-policy/resolve.ts`
  - `packages/core/src/lib/development-policy/resolve.interface.ts`
  - `packages/core/src/lib/plugins/development-config-schema.constant.ts`
  - `packages/core/tests/src/lib/work-units/agent-alias.service.spec.ts`
  - `packages/core/src/lib/development-policy/declare-workflow.ts`
  - `packages/core/tests/src/lib/development-policy/declare-workflow.spec.ts`
- **Gate**: unit
- shipped-in: `77cedadc3ba6`, `451865b24790`
- acceptance:
  - A project can declare the roster of a swarm (the agent names allowed to work in it). With a roster declared, entering a unit, claiming a review or recording a verdict under a name that is not on it is refused, listing the roster and the nearest name on it.
  - With a roster declared, the work-model instructions an agent receives name the roster where they say to sign as itself.
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
`glm-5.3-flash` enters.

Also delivered: the instructions every agent receives at start now end their "sign as `<you>`" step with the roster's names, so the name is read, not recalled. Not done, and taken out of the acceptance: refusing an `--agent` that differs from `DELENDAI_AGENT_ID`. A host sets that variable once and every process it starts inherits it, a sub-agent of another model included, so the variable is weaker evidence than the argument it would overrule. What the owner still has to give is the roster itself.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S3 — Asking the review queue again does not open another unit

- **Status**: retired
- **Files**:
  - `packages/cli/src/commands/review.command.ts`
- **Gate**: unit
- acceptance:
  - `review next` without a session, from an agent that already holds a review unit with no verdict in it, resumes that unit instead of opening a new one.
  - A unit that was opened and never used ends when its session does; it is not left on the forge.

Retired 2026-10-11. Resuming "the agent's open unit" when no session is given cannot be done safely: three instances of one model share a name by the owner's own rule (S2), and the session is what tells them apart, so an entry without one would hand an instance the unit of another. What the slice was for is closed elsewhere: a unit that claimed and judged nothing is not published (S11), a unit that judged is published whatever it still claims (S13), a reviewer holds one proposal at a time (S4), and a command run inside a unit already takes that unit's session.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S4 — A reviewer holds what it is reviewing, and is offered only what it can judge

- **Status**: done
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
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5ebd1b302a07, validate exit 0, tests 35/35 — Delivery attribution: the behaviour landed as 7a2ecb5a0d1f in the x00880 branch and reached develop through the merge 5ebd1b30 (PR #1013), whose first-parent diff carries this slice's declared files; that merge is the commit the guard names and the one approved here. The empty candidates for this slice (28d89c71, 118ba97fa) are a generated recompute and a develop sync. Gates: `bun x vitest run --root plugins/proposals` over review-claim.tool.spec.ts, review-queue-candidates.spec.ts, proposal-review.spec.ts and proposal-review-attribution.spec.ts -> 4 files / 35 tests, exit 0. I delegated the reading of this slice and then checked the two places it turns on myself. Noted as a coverage gap, not a defect: the delivered spec pins the refusal string but not the two-way nextAction, and it exercises the claim path rather than the verdict path directly. The code for both is present and I read it, so this is a missing assertion rather than a missing behaviour.

### S5 — A pack of verdicts is titled by what it judged

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-units/publication-pull-request.service.ts`
  - `packages/core/tests/src/lib/work-units/publication-pull-request.service.spec.ts`
- **Gate**: unit
- shipped-in: `20ed91d2e3ee`
- acceptance:
  - The pull request of a review pack is titled with the number of verdicts it carries and the proposals they are on, whatever its first commit was.

Delivered 2026-10-11, the title (observation 17). The other half as first written, review units named only by the product, is not done and is taken out: a unit is found by what it is and not by its name, so the names the swarm invented (`packs-1011`, `review-pack-g2`) cost a reader and nothing else, while refusing a topic would change the entry the queue's own closing unit goes through.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5ebd1b302a07, validate exit 0, tests 35/35 — Delivery attribution: the behaviour landed as 20ed91d2e3ee in the x00880 branch and reached develop through the merge 5ebd1b30 (PR #1013), whose first-parent diff carries this slice's declared files; that merge is the commit the guard names and the one approved here. The empty candidates for this slice (28d89c71, 118ba97fa) are a generated recompute and a develop sync. Gates: `bun x vitest run --root packages/core` over publication-pull-request.service.spec.ts, work-swarm-relations.spec.ts and slice-reservation.service.spec.ts -> 3 files / 35 tests, exit 0. Small and complete against the criterion; nothing else in the declared files changed.

### S6 — The swarm view does not report review packs as duplicates

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-units/work-swarm-relations.service.ts`
  - `packages/core/tests/src/lib/work-units/work-swarm-relations.spec.ts`
- **Gate**: unit
- shipped-in: `b93e9014bf16`
- acceptance:
  - Review units of different agents, or of different sessions of one model, are not listed as duplicates of one another.
  - Two units implementing the same slice still are.

Delivered 2026-10-11: a unit whose kind reads work rather than does it is left out of the duplicate relation. Run against the live swarm, "to sort out" went from every pack of every reviewer to the one real overlap, the two units of observation 19.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 386d9c53664f, validate exit 0, tests 35/35 — Delivery attribution: the behaviour landed as b93e9014bf16 in the x00880 branch and reached develop through the merge 386d9c53 (PR #999), whose first-parent diff carries this slice's declared files; that merge is the commit the guard names and the one approved here. The empty candidates for this slice (28d89c71, 118ba97fa) are a generated recompute and a develop sync. Gates: `bun x vitest run --root packages/core` over publication-pull-request.service.spec.ts, work-swarm-relations.spec.ts and slice-reservation.service.spec.ts -> 3 files / 35 tests, exit 0. No defect found. Read via a delegated pass and spot-checked.

### S7 — A reviewer is shown what answered the request before it

- **Status**: done
- **Files**:
  - `plugins/proposals/src/lib/swarm/proposal-review.ts`
  - `plugins/proposals/tests/src/lib/proposal-review.spec.ts`
  - `plugins/proposals/src/lib/tools/authoring.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- **Gate**: unit
- shipped-in: `3928d9fc7578`, `7d130a197bf4`
- acceptance:
  - When an implementer hands a slice back after a request for changes and says what it did, that is written in the slice, under the request it answers.
  - Every slice a pack sends back reads `in-progress`, not only the first one.
  - The answer is not a verdict: the reviewer who asked is still the last to have judged, and still may not verify the fix.

Delivered 2026-10-11, and not as first written. The slice was to reshape the brief so that earlier rounds read as history. Following observation 26 to its cause showed the history was incomplete instead: q00010 S3 carried two requests for the same change, by `minimax-3` and then `qwen3-flash`, and between them the fix (#987) with nothing in the document to say so. `proposal_review { action: "submit", note }` took the implementer's note, answered `ok`, and kept none of it; a `resubmitted` line was written only when an approval was being voided. The second reviewer read an objection with no reply under it. The reply is now recorded.

The same round left one more thing half-written. `gpt-5.4` sent back four slices of f00512 in one pack; the first request reopened the proposal and set its slice to `in-progress`, and the other three, finding the proposal already open, kept `Status: review` beside `review-state: changes_requested`. Each request now reopens its own slice.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5ebd1b302a07, validate exit 0, tests 35/35 — Delivery attribution: the behaviour landed as 3928d9fc7578 in the x00880 branch and reached develop through the merge 5ebd1b30 (PR #1013), whose first-parent diff carries this slice's declared files; that merge is the commit the guard names and the one approved here. The empty candidates for this slice (28d89c71, 118ba97fa) are a generated recompute and a develop sync. Gates: `bun x vitest run --root plugins/proposals` over review-claim.tool.spec.ts, review-queue-candidates.spec.ts, proposal-review.spec.ts and proposal-review-attribution.spec.ts -> 4 files / 35 tests, exit 0. The branch commit 3928d9fc touches only two of the four declared files, so on its own it would be refused as incomplete delivery evidence; the merge is what carries the rest. Noted so the attribution is not mistaken for a thinner delivery than it was.

### S8 — A reviewer runs the slice's gate, in its own worktree

- **Status**: done
- **Files**:
  - `packages/cli/src/lib/review/review-brief.service.ts`
  - `packages/cli/src/commands/review.command.spec.ts`
- **Gate**: unit
- shipped-in: `aee686896802`
- acceptance:
  - The brief a reviewer is handed says to run the slice's gate from the reviewer's own worktree, naming its path, and nothing wider: the whole validation runs once, on the pull request the pack becomes.

Delivered 2026-10-11, smaller than first written. An approval citing the forge's certifying run as its evidence was taken out: it would have been a new reader of the forge inside the verdict, to save a gate that takes seconds. What cost a machine eleven whole suites at once was that nothing told a reviewer how much to run or where; the brief now does. The `validate exit` field of an approval already asks for "gate exit code" in the call the brief prints (observation 18 is the name of the field, not what fills it).
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5ebd1b302a07, validate exit 0, tests 13/13 — Delivery attribution: the behaviour landed as aee686896802 in the x00880 branch and reached develop through the merge 5ebd1b30 (PR #1013), whose first-parent diff carries this slice's declared files; that merge is the commit the guard names and the one approved here. The empty candidates for this slice (28d89c71, 118ba97fa) are a generated recompute and a develop sync. Gates: `bun x vitest run --root packages/cli src/commands/review.command.spec.ts` -> 1 file / 13 tests, exit 0. Coverage gap noted, not a defect: the delivered spec pins the wording but not that the slice's concrete gate string reaches the reviewer-facing brief, although the payload does carry it (gate: slice.gate). I read that field myself. Not a reason to withhold the verdict - the criterion asks for behaviour, and the behaviour is there.

### S9 — What would stop a proposal from closing is found before a reviewer meets it

- **Status**: done
- **Files**:
  - `tools/scripts/lint/proposal-slice-completeness.script.ts`
  - `tools/scripts/lint/proposal-slice-completeness.script.spec.ts`
  - `tools/scripts/lint/proposal-cited-commits.script.ts`
  - `tools/scripts/lint/proposal-cited-commits.script.spec.ts`
  - `tools/scripts/lint/proposal-slice-completeness.baseline.json`
  - `plugins/proposals/src/lib/tools/proposal-transition.tool.ts`
  - `plugins/proposals/src/lib/services/review-queue-slice.service.ts`
  - `plugins/proposals/tests/src/lib/tools/proposal-review-attribution.spec.ts`
- **Gate**: unit
- shipped-in: `30005836854c`, `d6d9d8c95603`
- acceptance:
  - A retired slice of a closed proposal is finished: the completeness lint does not report it as pending.
  - A quoted tree or blob is not read as a citation of a commit.
  - The two rules run on a proposal while it waits for review, read as it will be when it closes, so the pull request that hands it over is the one that fails.
  - A retired slice is not asked for the files it had planned.
  - An approval of work nobody can be named for is recorded and does not close its proposal: every path to `done` applies the rule the repository's check applies, and the queue says beforehand that the close is the owner's.

Delivered 2026-10-11, the two rules that were wrong: `retired` joins `done` as a status a slice of a closed proposal may be in, and a hash that names a tree or a blob is skipped by the cited-commits lint. x00875's three citations of unreferenced objects were rewritten in its own unit. Then the rest. Both rules now read `review/` as well as `done/`; run over the fifteen proposals waiting today they found one real thing, twice: f00512 and f00536 each have a retired slice naming files that were never written, which the completeness rule would have held against whoever approved them. A retired slice is no longer asked for its files, and the baseline shrank by eight entries for it. And the cause of observation 21: the close from `review` was judged by the review log alone, so an approval over an unrecorded implementer closed f00538, and the per-slice rule in CI refused the pack. `proposal_transition` now applies that one rule on every path to `done`; the approval stands, the proposal stays in review, and the answer says why.

One more thing the wider rule met, in CI and not here: q00014 S2 lists `journal-reporter.ts` and describes it as writing to a journal under the cache folder, and the Files parser took the journal's path for a second declared file. It exists on a machine that has run the suite and nowhere else. A sub-bullet that names its file and then describes it now declares that file only; nineteen such paths left the baseline.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5ebd1b302a07, validate exit 0, tests 76/76 — Delivery attribution: the behaviour landed as 30005836854c in the x00880 branch and reached develop through the merge 5ebd1b30 (PR #1013), whose first-parent diff carries this slice's declared files; that merge is the commit the guard names and the one approved here. The empty candidates for this slice (28d89c71, 118ba97fa) are a generated recompute and a develop sync. Gates: `bun x vitest run --root tools` over test-zones.script.spec.ts, independent-candidates.spec.ts, proposal-slice-completeness.script.spec.ts and proposal-cited-commits.script.spec.ts -> 4 files / 76 tests, exit 0; and `bun x vitest run --root plugins/proposals` over review-claim.tool.spec.ts, review-queue-candidates.spec.ts, proposal-review.spec.ts and proposal-review-attribution.spec.ts -> 4 files / 35 tests, exit 0 for the attribution half. Two coverage gaps I checked and am recording rather than treating as defects: no candidate commit changes proposal-cited-commits.script.spec.ts, so the tree/blob assertion is present in the tree but is not part of the listed delivery diff; and the review-directory expansion of the cited-commits lint is implemented but not asserted by the declared spec. Both are missing assertions around code that is present.

### S10 — Two packs of verdicts on different proposals do not wait on each other

- **Status**: done
- **Files**:
  - `tools/scripts/ci/test-zones.script.ts`
  - `tools/scripts/ci/test-zones.interface.ts`
  - `tools/scripts/ci/test-zones.script.spec.ts`
  - `tools/scripts/forge/candidate-footprint.ts`
  - `tools/scripts/forge/independent-candidates.ts`
  - `tools/scripts/forge/independent-candidates.interface.ts`
  - `tools/scripts/forge/independent-candidates.spec.ts`
- **Gate**: unit
- shipped-in: `439cb8bd4e6d`
- acceptance:
  - The planner says, of the zones a change reaches, which it reaches only because their specs read a file it changed.
  - Two candidates whose common zones are all of that kind on both sides, that change no file in common and do not both add a new file, land without being brought forward.
  - A candidate that changes the code of a zone is brought forward as it is today, and so is one against a footprint that does not say how it reaches a zone.

First left for a measurement, and then measured (observations 24 and 29).

What the rule has to keep, found while reading how candidates are compared. The queue tells two candidates apart by test zone, and a zone is reached two ways: its own code changed, or its specs read or list a file that changed. Verdict packs meet only the second way. But the second way is also what serialises two pull requests that each add a proposal under the same number, and that protection has to stay: two candidates that add files to one listed folder still wait on each other; two that change or move different existing files of it need not. Measured on #1007, a pack of verdicts alone: 34 jobs, of which ten are test shards with nothing to run (2 to 5 seconds each, a runner each) and fifteen are lints of 20 to 98 seconds.

And what observation 29 adds to it: the measure to take is not only runs per pack but how long the head waits, and how many of its runs were cancelled by a refresh before they answered. A head that is brought forward while its checks are running loses them; one that is left alone until they answer does not, at the cost of landing one merge behind.

Delivered 2026-10-11, the rule; the head that loses its run to a refresh is not touched here. Tried on the ten pull requests open at the time: the five packs of verdicts are independent of one another, except the two that both close f00538, which share its document; a pack and a pull request that changes code of a zone the pack's files are read by still wait on each other. What the rule gives up is a check that reads all those files together catching two packs that are each fine alone; the integration branch's own run after each merge is what is left to catch it, as its header already says of every candidate that lands beside another.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5ebd1b302a07, validate exit 0, tests 76/76 — Delivery attribution: the behaviour landed as 439cb8bd4e6d in the x00880 branch and reached develop through the merge 5ebd1b30 (PR #1013), whose first-parent diff carries this slice's declared files; that merge is the commit the guard names and the one approved here. The empty candidates for this slice (28d89c71, 118ba97fa) are a generated recompute and a develop sync. Gates: `bun x vitest run --root tools` over test-zones.script.spec.ts, independent-candidates.spec.ts, proposal-slice-completeness.script.spec.ts and proposal-cited-commits.script.spec.ts -> 4 files / 76 tests, exit 0. No defect found. The second criterion is the one most likely to have been fudged and it is not - the new-files carve-out is asserted, not just the exclusion.

### S11 — A pack with no verdict is not published

- **Status**: done
- **Files**:
  - `packages/core/src/lib/work-units/work-unit-publish.service.ts`
  - `packages/cli/src/lib/review/review-pack-check.service.ts`
  - `packages/cli/src/commands/review.command.ts`
  - `packages/core/tests/src/lib/work-units/review-pack-scope.spec.ts`
  - `packages/core/tests/src/lib/work-units/work-unit.service.spec.ts`
  - `packages/cli/src/commands/review.command.spec.ts`
- **Gate**: unit
- shipped-in: `a83c2ec9f284`
- acceptance:
  - `work publish` refuses a review unit that changes nothing over the integration branch, whatever commits it holds.
  - `review next` does not try to publish such a unit when nothing else waits.

Delivered 2026-10-11. Four specs published a review unit made of empty commits; each now records a verdict first, as a reviewer does.
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5ebd1b302a07, validate exit 0, tests 81/81 — Delivery attribution: the behaviour landed as a83c2ec9f284 in the x00880 branch and reached develop through the merge 5ebd1b30 (PR #1013), whose first-parent diff carries this slice's declared files; that merge is the commit the guard names and the one approved here. The empty candidates for this slice (28d89c71, 118ba97fa) are a generated recompute and a develop sync. Gates: `bun x vitest run --root packages/core` over review-pack-scope.spec.ts, work-unit.service.spec.ts and declare-workflow.spec.ts -> 3 files / 81 tests, exit 0; and `bun x vitest run --root packages/cli src/commands/review.command.spec.ts` -> 1 file / 13 tests, exit 0 for the CLI branch. Coverage gap noted: the empty-queue assertion in the delivered spec covers 'there was nothing waiting before the unit opened', not 'a resumed unit that keeps only a claim'. The implementation is the criterion's and I read it; the assertion is thin.

### S12 — An agent can go back to a unit it published

- **Status**: review
- **Files**:
  - `packages/core/src/lib/work-units/slice-reservation.service.ts`
  - `packages/core/tests/src/lib/work-units/slice-reservation.service.spec.ts`
- **Gate**: unit
- shipped-in: `872e2f4214c0`
- acceptance:
  - An agent entering a slice that its own unit reserves, under another unit name, is told so, with the generation and the topic that resume that unit and how to bring its pull request in.

Delivered 2026-10-11 as what the refusal says. Resuming without being told (taking the reserved unit's name when the entrant is its agent) is the fuller answer and is left for when it is needed twice.
- review-state: in_review
- review-implementer: claude-opus-5-5

### S13 — A verdict is not stranded by letting go of its proposal

- **Status**: review
- **Files**:
  - `plugins/proposals/src/lib/services/review-claim.service.ts`
  - `plugins/proposals/src/lib/tools/review-claim.tool.ts`
  - `plugins/proposals/tests/src/lib/tools/review-claim.tool.spec.ts`
  - `packages/cli/src/lib/review/review-pack-check.service.ts`
  - `packages/cli/src/commands/review.command.ts`
- **Gate**: unit
- shipped-in: `12d3a1f544d6`
- acceptance:
  - A review unit that has recorded a verdict on a proposal is refused giving it back, and told to publish its pack: the slices it did not judge return to the queue with it.
  - `review next` publishes a unit that wrote verdicts when nothing else waits, whether or not it still holds a claim.

Delivered 2026-10-11. The four units of observation 28 are left as they are: their verdicts are their reviewers' to publish, and the owner's to dispose of if those sessions do not come back.
- review-state: in_review
- review-implementer: claude-opus-5-5

## acceptance

- Every observation in S1 either has a slice that closes it or is recorded as not a defect, with the reason.
- A second swarm of the same eleven agents leaves five agent names, one unit per session, no proposal held without a verdict in progress, and a swarm view whose "to sort out" is empty when nothing is wrong.

## notes

- The MCP server log the owner pasted on 2026-10-11 shows one more thing, of the host and not of the swarm: the server restarted six times in three hours, once per batch of merges that changed code it runs, and each start re-announced its whole summary. It is recorded in x00878 S42, which halved what a start costs.
