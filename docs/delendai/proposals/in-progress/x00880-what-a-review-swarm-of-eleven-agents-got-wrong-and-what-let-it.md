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
4. **A claim taken and dropped.** `gpt-5.4` claimed r00040 at 04:20:14 and released it at 04:22:15 with no verdict and no reason recorded, then claimed f00643. A release says nothing of why. → S4.
5. **Units named by whoever opened them.** The slice of a review unit is `batch-all` for most and `batch-review` for one; the topic is `verdicts`, `review-pack`, `review-pack-g1` or `packs-1011`. The name of a unit is what every listing sorts and matches by. → S5.
6. **The swarm view calls every review pack a duplicate.** `delendai work swarm` reports "duplicate batch-all is live 16 times; keep one" and lists all of them under "to sort out". Many review packs at once is how a review swarm works; the one real finding a person needs from that view is buried under a false one. → S6.
7. **Claims recorded in a unit with no reservation on the forge.** Units of `minimax-m31` carry commits `claim x00877`, `claim x00875` and `claim q00018`; `refs/delendai/claims/review/` held no ref for those three when listed at 04:27. Either the reservation was never pushed or it was released without a commit saying so. To be confirmed before it is given a slice.
8. **Reservations that outlived their unit.** `refs/delendai/claims/slice/x00554/s2`, `…/q00010/s3` and `…/f00757/all` belong to units whose pull requests merged hours before. These are the orchestrator's own, not the swarm's; they are here because the same listing shows them. To be confirmed against the reservation reaper.

### S2 — An agent has one name, and it is not the model's to choose

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/work-units/agent-alias.service.ts`
  - `packages/core/src/lib/work-identity/resolve-work-agent.service.ts`
  - `packages/core/src/lib/work-units/work-unit-enter.service.ts`
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

### S3 — Asking the review queue again does not open another unit

- **Status**: pending
- **Files**:
  - `packages/cli/src/commands/review.command.ts`
- **Gate**: unit
- acceptance:
  - `review next` without a session, from an agent that already holds a review unit with no verdict in it, resumes that unit instead of opening a new one.
  - A unit that was opened and never used ends when its session does; it is not left on the forge.

### S4 — A reviewer holds what it is reviewing, and says why it lets go

- **Status**: pending
- **Files**:
  - `plugins/proposals/src/lib/services/review-claims.service.ts`
- **Gate**: unit
- acceptance:
  - A session holds at most one proposal with no verdict; a second claim is refused, naming the one it holds.
  - Releasing a claim records a reason, which the queue shows to the next reviewer.

### S5 — A review unit is named by the product

- **Status**: pending
- **Files**:
  - `packages/cli/src/commands/review.command.ts`
- **Gate**: unit
- acceptance:
  - The slice and the topic of a review unit are not arguments: every review unit of every agent is named the same way, differing only by agent and generation.

### S6 — The swarm view does not report review packs as duplicates

- **Status**: pending
- **Files**:
  - `packages/core/src/lib/work-units/work-swarm-relations.service.ts`
- **Gate**: unit
- acceptance:
  - Review units of different agents, or of different sessions of one model, are not listed as duplicates of one another.
  - Two units implementing the same slice still are.

## acceptance

- Every observation in S1 either has a slice that closes it or is recorded as not a defect, with the reason.
- A second swarm of the same eleven agents leaves five agent names, one unit per session, no proposal held without a verdict in progress, and a swarm view whose "to sort out" is empty when nothing is wrong.

## notes

- The MCP server log the owner pasted on 2026-10-11 shows one more thing, of the host and not of the swarm: the server restarted six times in three hours, once per batch of merges that changed code it runs, and each start re-announced its whole summary. It is recorded in x00878 S42, which halved what a start costs.
