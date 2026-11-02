---
id: f00543
title: "Docker plugin as a tool (autodetected, low-risk)"
kind: feat
status: done
type: proposal
track: general
date: 2026-09-15
last-transition-id: 28d6f666-487a-44e2-95dd-eeafa9c619ea
last-correlation-id: 28d6f666-487a-44e2-95dd-eeafa9c619ea
last-transition-from: review
last-transition-at: 2026-10-14T15:39:13.400Z
shipped-in:
  - "5b6b9e1e2"
---

# f00543 — Docker plugin as a tool (autodetected, low-risk)

## Goal

Give the agent tools to **control Docker** (build, run, exec, compose up/down/logs/ps, network, volume) from inside an existing environment. The plugin is only active when the repository signals Docker usage (Dockerfile, compose file, .devcontainer/); when absent, tools stay passive and only docker_inspect_repo is available. Defaults are fail-safe: network=none, pullPolicy=if-not-present, cleanupOnExit=always, no socket or privileged containers without explicit user confirmation.

## why

P4 lets the agent **run inside** Docker; P5 lets the agent **use** Docker as a tool (even locally). Dogfooding a repo with compose needs docker_compose_up and friends; today those calls would be raw shell. A first-class plugin gives the agent clean abstractions, autodetection, and a strong safety floor.

## non-goals

- Not enabling privileged containers or socket mounts by default.
- Not supporting Podman, Buildah, or containerd CLI.
- Not implementing registry push/pull to private registries.
- Not auto-executing docker system prune or any host-wide destructive op.

## Slices

- global_gate: type

The owner decided (2026-10-09) that these tools extend `plugins/container`, which already inspects, lints and builds, instead of creating `plugins/docker`. The slices below are written for that home.

### S1 — Autodetection, and a passive plugin without it

- **Status**: done
- **Files**:
  - `plugins/container/src/lib/detect/docker-signals.service.ts`
  - `plugins/container/src/lib/contracts/constants/docker-signals.constant.ts`
  - `plugins/container/src/index.ts`
  - `plugins/container/src/lib/detect/docker-signals.service.spec.ts`
  - `plugins/container/src/index.spec.ts`
- **Gate**: type
- acceptance:
  - The Docker tools are always registered, so what the plugin offers (and the generated catalog) never depends on the folder the server starts in. Without a root `Dockerfile`, compose file or `.devcontainer/`, every change they would make is refused with the reason, and reading stays free.
  - The CLI is the only adapter. A socket adapter is out of scope.
- shipped-in: `79da5118f701`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5b6b9e1e2, validate exit 0, tests 52/53; acceptance 2/2: (1) Pinned by a test named for the whole guarantee: 'offers the docker tools everywhere, and refuses their changes in a repository without Docker' — plus 'names th… (2) Verified by absence over the delivered source: every adapter goes through the docker CLI service (docker-command.service.ts), with the CLI-resolved runner and … — Delivered by 79da5118f ("feat(container): Docker as a tool where the repository uses it, under one set …"), which carries 4 of the 5 declared files; the merge 5b6b9e1e2 (PR #1050) carries all 5. Gate `type`. Evidence: `bunx vitest run --root plugins/container` → 19 files, 52 pass / 1 skipped (the 52/53 above); the skip is the daemon-gated e2e, and S5's own criterion says it is skipped without a daemon — but it DID run here (see S5). ACC0 is a claim about registration being unconditional, which is exactly the kind of thing that can pass a review by accident, so I looked for the test that states both halves: 'offers the docker tools everywhere, and refuses their changes in a repository without Docker'. That single test is the criterion — always offered, and mutating refused with the reason when the repository shows no Docker — and it is joined by 'names the root entries that say the project uses Docker; without them the tools only read' for the detection side and 'exposes two tool registrations under the namespace prefix' / 'registers pull, run, exec, compose, network and volume' for the registration itself. Reading staying free is the same guarantee's other half, not a separate flag. ACC1 is a non-goal, so absence is the right instrument: every adapter in plugins/container/src goes through the docker CLI service, and the consent model is the CLI's argv — which is exactly why S2 can preview an argv in dryRun and why a socket adapter would have needed a different consent story. No socket path exists in the delivered source.

### S2 — Pull, run and exec under one set of consent rules

- **Status**: done
- **Files**:
  - `plugins/container/src/lib/run/docker-command.service.ts`
  - `plugins/container/src/lib/run/docker-risk.helper.ts`
  - `plugins/container/src/lib/contracts/interfaces/docker-command.interface.ts`
  - `plugins/container/src/lib/contracts/constants/docker-tool-input.constant.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.spec.ts`
  - `plugins/container/package.json`
- **Gate**: type
- acceptance:
  - Each tool runs the docker CLI and returns structured stdout, stderr and exit code. A missing CLI is a typed `install-missing` answer.
  - A change needs `confirm: true`, and `dryRun: true` returns the command without running it.
  - A privileged container, a docker socket mount, or the host's network, pid or ipc namespace also needs `confirmRisk: true`, which `confirm` never implies.
  - `container_pull` with `policy: "if-not-present"` (the default) pulls only a missing image.
- shipped-in: `79da5118f701`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5b6b9e1e2, validate exit 0, tests 52/53; acceptance 4/4: (1) Pinned by 'container_build returns install-missing when docker is absent' — a missing CLI is a typed answer rather than a thrown error or a silent empty result… (2) Both halves have their own passing tests: 'container_build refuses without confirm' and 'container_build dryRun previews the argv without exec' (with the same … (3) Implemented as an independent gate in docker-command.service.ts:64 — `if (command.risks.length > 0 && consent.confirmRisk !== true)` — whose refusal text says … (4) Pinned by 'pulls only a missing image under the default policy'. — Delivered by 79da5118f (6 of 7 declared files); the merge 5b6b9e1e2 (PR #1050) carries all 7. Gate `type`. This is the plugin's safety slice, so I looked for the independence property rather than the presence of a flag. ACC2 is the one that matters and it is enforced structurally, not documented: docker-command.service.ts:64 reads `if (command.risks.length > 0 && consent.confirmRisk !== true)` — a check on the command's OWN risk list, gated on a DIFFERENT consent field — so `confirm: true` cannot satisfy it, and the refusal text says so in as many words ("`confirm` alone never allows it"). It is pinned by a test named for the guarantee: 'a container that reaches the host needs confirmRisk, which confirm never implies'. docker-risk.helper.ts:7 documents the same rule at the point the risks are computed. If that check had been written as `confirm || confirmRisk`, every test above would still have passed, which is why I read the line instead of trusting the green suite. ACC0: a missing CLI is a typed answer, pinned by 'container_build returns install-missing when docker is absent' — worth checking on its own because an exec failure here would otherwise surface as a thrown error or a silent empty stdout. ACC1: both halves have their own tests — 'container_build refuses without confirm' and 'container_build dryRun previews the argv without exec' — and the same pair exists for k8s_apply and the network/volume tools, so the consent model is uniform rather than per-tool. ACC3: 'pulls only a missing image under the default policy'. Evidence 52/53 is the plugin suite; the one skip is the daemon-gated e2e that S5 covers.

### S3 — Compose: the services, and up, down, logs, ps, exec

- **Status**: done
- **Files**:
  - `plugins/container/src/lib/compose/compose-parser.service.ts`
  - `plugins/container/src/lib/compose/compose-parser.service.spec.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.spec.ts`
- **Gate**: type
- acceptance:
  - The parser lists services with their image or build context, ports, environment variable names (never values) and mounts.
  - `container_compose` covers `services`, `ps`, `logs`, `up`, `down` and `exec`. `up` starts one named service unless `all: true`, refuses a service the file does not declare, and checks every service it would start for host-reaching risks.
- shipped-in: `79da5118f701`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5b6b9e1e2, validate exit 0, tests 52/53; acceptance 2/2: (1) Pinned by 'reads both long and short forms, and never an environment value' (compose-parser.service.spec.ts:6 states the guarantee in its own name). The names-… (2) The subcommand set is pinned by 'refuses compose without a compose file, and runs logs, down and exec on it', and the up-semantics by 'reads the compose file, … — Approved at 5b6b9e1e2 (the merge the supersede guard names; the slice's own commit carries 3 of 4 declared files). Gate `type`. ACC0's dangerous half is the parenthetical, so I checked it specifically rather than trusting the parser's general shape: the compose spec's own title is 'reads both long and short forms, and never an environment value' (compose-parser.service.spec.ts:6). A compose file routinely carries secrets in `environment`, and an agent tool that echoes them back is a leak into the model's context and the journal — so names-only is a security property, and it is asserted in the test's name rather than buried in an assertion. The neighbouring 'has no services when the file declares none' fixes the empty case, so the parser reports nothing rather than fabricating a service. ACC1's three subclauses map to two tests: 'refuses compose without a compose file, and runs logs, down and exec on it' covers the refusal and the ps/logs/down/exec surface, and 'reads the compose file, starts one service unless told all, and refuses an unknown one' covers the up-semantics — one named service by default, `all: true` as the opt-in for the rest, and a service the file does not declare refused instead of forwarded to the daemon. The host-reaching risk check on each service it would start reuses S2's independent `confirmRisk` gate, so a compose `up` cannot smuggle a privileged service past the consent model that slice established. Evidence 52/53 is the plugin suite.

### S4 — Networks and volumes

- **Status**: done
- **Files**:
  - `plugins/container/src/lib/tools/container-docker.tool.ts`
  - `plugins/container/src/lib/tools/container-docker.tool.spec.ts`
- **Gate**: type
- acceptance:
  - `container_network` and `container_volume` list and inspect freely. `create` and `rm` need `confirm` and a name.
- shipped-in: `79da5118f701`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5b6b9e1e2, validate exit 0, tests 52/53; acceptance 1/1: (1) Pinned by 'creates and removes networks and volumes only with confirm' for the mutation half. The read half is the whole-plugin registration test 'registers pu… — Approved at 5b6b9e1e2 (merge the supersede guard names). Gate `type`. Short slice, one criterion, and the consent clause is the part worth pinning down: 'creates and removes networks and volumes only with confirm' covers both mutations, and the same tests exercise the list/inspect paths that stay free — the plugin's registration test names network and volume among the registered tools, so reading is served by the same surface that refuses the write. That matters because the criterion's shape (reads free, writes consented) is trivially satisfiable by refusing everything, and it would be just as trivially violated by gating the reads too; the delivered surface does neither. The daemon-backed counterpart to this contract is covered in S5 and ran here. Evidence 52/53 is the plugin suite.

### S5 — Against the real daemon, in a sandbox of its own

- **Status**: done
- **Files**:
  - `plugins/container/src/lib/tools/container-docker.integration.spec.ts`
- **Gate**: type
- acceptance:
  - Where a daemon answers, the spec creates, lists and removes a network and a volume under a unique name. It removes them however the spec ends. It runs a throwaway container only from an image already present, never pulling, and checks that nothing is left behind. Without a daemon it is skipped.
- shipped-in: `79da5118f701`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5b6b9e1e2, validate exit 0, tests 52/53; acceptance 1/1: (1) A daemon WAS available (`docker info` succeeds here), and the spec ran for real rather than skipping: container-docker.integration.spec.ts > 'creates, lists an… — This is the only slice in the proposal that talks to something outside the repository, so I checked whether it actually ran rather than accepting a skip as evidence. `docker info` succeeds in this environment — the daemon is UP — and the spec executed for real: container-docker.integration.spec.ts > 'creates, lists and removes its own network and volume' passed in 3635ms against the live daemon, not against a stub. Every clause of ACC0 is then visible in the source and satisfied: one unique `sandbox` name under which both the network and the volume are created; list asserting the name is present and, after rm, a second list asserting `.not.toContain(sandbox)` — that is the criterion's 'checks that nothing is left behind' asserted rather than assumed; and cleanup that happens however the spec ends via `afterAll(() => { docker('network','rm',sandbox); docker('volume','rm','-f',sandbox); })`. The container half is gated by `it.skipIf(!alpine)`, so it runs only from an image ALREADY PRESENT and never pulls — and in this environment that test is the single skip in the suite (52 passed | 1 skipped of 53), which is precisely the behaviour the criterion describes rather than a gap in coverage. I checked that skip deliberately instead of waving it through: a test that pulled its image would be a test that mutates shared machine state and needs network, and this one refuses to. The daemon-absent case is the same guard's other half.

### S6 — Documentation and the safety guide

- **Status**: done
- **Files**:
  - `plugins/container/README.md`
- **Gate**: type
- acceptance:
  - The README lists each tool and the consent it needs. A safety section explains why reaching the host needs its own consent, why environment values are never returned, and what stays out of scope.
- shipped-in: `79da5118f701`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 5b6b9e1e2, validate exit 0, tests 52/53; acceptance 1/1: (1) Both halves present. The tools table (:126-131) gives one row per tool with its consent in a column — e.g. `container_run` → "`confirm`; `confirmRisk` when it … — Approved at 5b6b9e1e2 (merge the supersede guard names). Gate `none`. A documentation slice is judged by whether it says the thing and WHY, so I read the safety section rather than checking that a README exists. ACC0's first half: the tools table at plugins/container/README.md:126-131 gives one row per tool with its consent in its own column — `<prefix>_container_run` → "`confirm`; `confirmRisk` when it reaches the host", `container_network` and `container_volume` → "`confirm` for `create` and `rm`", `container_compose` → "`confirm` for `up`, `down` and `exec`" — so the consent a call needs is readable without reading the code, which is the point of listing it. The three explanations the criterion demands are all in `## Safety` (:135) and each carries its reason rather than its rule: "Reaching the host needs its own consent" spells out privileged containers, a mounted docker socket and the host's network/process/IPC namespaces, states that "`confirm` never implies it, so a script that confirms every call still cannot start one by accident", and notes that a compose `up` checks the same risks for every service it would start — which is precisely why S2's gate had to be structural. "Environment values are never returned" gives the reason in the same sentence as the rule: "`services` lists variable names only. A compose file keeps its secrets in those values." And "What is out of scope" names all four exclusions the criterion implies — no `system prune`, no registry push, no socket adapter, no Podman — which is also where S1's 'a socket adapter is out of scope' becomes a published non-goal rather than an unstated one. Evidence 52/53 is the plugin suite.

## acceptance

- Without a root `Dockerfile`, compose file or `.devcontainer/`, the Docker tools only read: every change is refused with the reason. They are registered everywhere, so the catalog does not depend on where it is generated.
- Every Docker tool runs the CLI, returns structured stdout, stderr and exit code, and answers a missing CLI with `install-missing`.
- A change needs `confirm: true`. A container that reaches the host (privileged, the docker socket, the host's network, pid or ipc namespace) also needs `confirmRisk: true`, which `confirm` never implies, from any caller.
- `container_pull` pulls only a missing image under the default `if-not-present` policy.
- The compose parser lists services, ports, environment variable names (never values) and mounts. `container_compose up` starts one service unless `all: true`.
- Networks and volumes are listed and inspected freely, and created or removed only with `confirm`.
- The integration spec uses names of its own, removes everything it created, never pulls, and is skipped without a daemon.
- The README documents each tool's consent and the safety rationale.

Cut at hand-over, and why: network `connect`/`disconnect` and scope-tagged volume pruning (no consumer asked; `rm` covers the spec's clean-up); the three example stacks in the docs (left for when a consumer brings one); a socket adapter (the CLI is the only adapter).
