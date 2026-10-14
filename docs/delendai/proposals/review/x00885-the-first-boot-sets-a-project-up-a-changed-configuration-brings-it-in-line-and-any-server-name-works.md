---
id: x00885
title: "The first boot sets a project up, a changed configuration brings it in line, and any server name works"
kind: fix
status: review
type: proposal
track: general
date: 2026-10-12
last-transition-id: 2edde023-7b55-41f9-aa09-1736b4fd71e5
last-correlation-id: 2edde023-7b55-41f9-aa09-1736b4fd71e5
last-transition-from: in-progress
last-transition-at: 2026-10-13T04:08:20.808Z
shipped-in:
  - "1876ce52b3c04c121d945f9318bffb0b00af1aa4"
---

# x00885 — The first boot sets a project up, a changed configuration brings it in line, and any server name works

## goal

A project is never left half set up by the way its server was started:

- a first start in a project without delendai creates what it needs, with
  the defaults;
- a start whose configuration differs from the one the project was last
  set up with brings the cache, the docs and the generated configuration
  in line with the new one;
- a server started under a custom name — upper case included — gets its
  agents created and its tools recognised, like one started under the
  default name.

## why

Reported by the owner on 2026-10-13, from using delendai in other projects:

1. **First start.** Someone who has never installed delendai enables the
   MCP server and starts it. What the server needs and does not find
   (configuration, cache layout, docs directory, agent files) is not
   created; the project stays half set up until somebody runs the right
   command by hand.
2. **Changed configuration.** When the configuration is not the one the
   project was set up with — another profile, another docs directory,
   other plugins — the cache, the docs and the generated configuration
   keep the old shape. Nothing reconciles them at start.
3. **Custom server name.** Started under a specific MCP server name, the
   agents are not created; and when the name has upper case letters, the
   agent that works through the tools does not recognise the server's
   tools — the name is compared without normalising its case where the
   host normalises it.

### Found on 2026-10-13, reading the code

- **Four defaults for one name.** `init` registers the server as
  `DelendAI` (`init-answers.schema.ts`); the agent renderer of `init`
  falls back to the namespace prefix, `delendai`
  (`init-render.service.ts`); `adopt` falls back to `delendai`
  (`adopt-project.tool.ts`); the host scaffold falls back to
  `mcp-project-<prefix>` (`scaffold-host.ts`). Whichever path wrote a
  project's agents decides what their `tools:` grant names, and only one
  of them matches the key the server was registered under. One constant,
  and the name read from the project's own MCP configuration
  (`findDelendaiServerName`), must be the only answers.
- **The start creates no agent.** Agent files are written by `init` and
  by the scaffold tools only; `assembleCliConfig` never looks for them,
  so a project whose server was registered by hand (or under another
  name) never gets them.
- **The grant keeps the name's case.** `tools: [..., <serverName>/*]` is
  written as registered; a host that normalises the server name to lower
  case finds no tool behind `DelendAI/*`. S4 checks what each host
  expects and emits that.

## non-goals

- **No silent overwrite of what a person wrote.** Reconciling to a new
  configuration moves, regenerates or creates what delendai derives;
  anything a person edited is reported, and kept, before it is touched.
- **No second installer.** The first start uses the same scaffolding as
  `delendai init`, with its defaults; it does not grow its own copy.

## slices

- global_gate: type

### S1 — Reproduce each of the three in a throwaway consumer project

- **Status**: done
- **Files**:
  - `packages/core/tests/src/lib/e2e/first-boot.e2e.spec.ts`
- **Gate**: type
- acceptance:
  - An end-to-end spec boots the real server (as a host starts it, over stdio) in an empty project, in a project set up with one configuration and started with another, and under a server name with upper case letters; each case states what it finds today, before any fix.
- shipped-in: `e8d9249d3634`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: qwen3-flash
- review-log: approved by qwen3-flash — verified at 1876ce52b3c0, validate exit 0, tests 4/4 — S1 first-boot e2e spec delivers all three reproduced scenarios (4 tests, 4 passed). Verified file byte-identity between shipped-in and the authoritative merge commit per the supersede guard, then ran the spec.

### S2 — A first start creates what is missing, with the defaults

- **Status**: done
- **Files**:
  - `packages/core/src/lib/adopt/first-run-setup.service.ts`
  - `packages/core/src/lib/adopt/adopt-project.tool.ts`
  - `packages/core/src/lib/contracts/interfaces/adopt-project.interface.ts`
  - `packages/core/src/lib/cli/run-cli.ts`
  - `packages/core/tests/src/lib/adopt/first-run-setup.service.spec.ts`
- **Gate**: type
- acceptance:
  - Starting the server in a project with no delendai, whose own MCP configuration registers delendai, creates the configuration, the docs root and the agent files `adopt_project` writes with its defaults, and says so once on stderr. A server started by a user-wide configuration in a project that does not register delendai writes nothing.
  - A second start creates nothing and says nothing.
- shipped-in: `bc07007153dc`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: qwen3-flash
- review-log: approved by qwen3-flash — verified at 1876ce52b3c0, validate exit 0, tests 5/5 — S2: first-run-setup exists, wires into run-cli.ts line 249 reportFirstRunSetup, only for a project whose own MCP config registers delendai, and is idempotent. 5/5 unit tests pass; e2e covers the user-wide opt-out too.

### S3 — A changed configuration brings what is derived in line

- **Status**: done
- **Files**:
  - `packages/core/src/lib/workspace-migration/namespace-prefix-transition.service.ts`
  - `packages/core/src/lib/workspace-migration/config-transitions.service.ts`
  - `packages/core/src/lib/contracts/interfaces/config-transition.interface.ts`
  - `packages/core/src/lib/plugins/config-file-schema.ts`
  - `packages/core/schema/delendai.config.schema.json`
  - `packages/core/tests/src/lib/workspace-migration/namespace-prefix-transition.service.spec.ts`
  - `packages/core/tests/src/lib/workspace-migration/config-transitions.service.spec.ts`
- **Gate**: type
- acceptance:
  - The configuration a project was last set up with is recorded; a start under a different one moves, regenerates or creates the cache, docs and generated configuration it implies, and reports each change.
  - What a person edited is kept and reported, never overwritten.
- shipped-in: `bc07007153dc`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: qwen3-flash
- review-log: approved by qwen3-flash — verified at 1876ce52b3c0, validate exit 0, tests 22/22 — S3: namespace-prefix transition + config-transitions, 22/22. Verified shipped-in vs HEAD for the service file.

### S4 — Any server name, in any case, gets its agents and its tools

- **Status**: done
- **Files**:
  - `packages/core/src/lib/contracts/constants/mcp-server-name.constant.ts`
  - `packages/core/src/lib/scaffold/mcp-server-name.helper.ts`
  - `packages/core/src/lib/scaffold/scaffold-host.ts`
  - `packages/core/src/lib/scaffold/detect-existing-install.ts`
  - `packages/core/src/lib/adopt/adopt-project.tool.ts`
  - `packages/core/src/lib/install/installer.ts`
  - `packages/core/src/cli.ts`
  - `packages/cli/src/lib/init/init-render.service.ts`
  - `packages/cli/src/lib/init/init-answers.schema.ts`
  - `packages/cli/src/lib/init/init-render.service.spec.ts`
  - `packages/core/tests/src/lib/scaffold/mcp-server-name.helper.spec.ts`
  - `packages/core/tests/src/lib/scaffold/detect-existing-install.spec.ts`
  - `packages/core/tests/src/lib/install/installer.spec.ts`
- **Gate**: type
- acceptance:
  - A server started under a custom name creates the same agents as one under the default name.
  - The tool prefix an agent matches is derived from the server name the way the host derives it (case included), so a name with upper case letters is recognised; a spec covers lower, upper and mixed case.
- shipped-in: `6b9f76b08247`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: qwen3-flash
- review-log: approved by qwen3-flash — verified at 1876ce52b3c0, validate exit 0, tests 68/68 — S4: single default name constant (DEFAULT_DELENDAI_SERVER_NAME) + hostToolSetReference normalization wired into scaffold/install/init. 68/68 covering specs, e2e upper-case-name case green.

### S5 — Existing agents are brought in line with the server they serve

- **Status**: review
- **Files**:
  - `packages/core/src/lib/scaffold/agent-grant-reconcile.service.ts`
  - `packages/core/src/lib/scaffold/agent-grant-report.ts`
  - `packages/core/src/lib/contracts/interfaces/agent-grant-reconcile.interface.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/tests/src/lib/scaffold/agent-grant-reconcile.service.spec.ts`
  - `packages/core/tests/src/lib/scaffold/agent-grant-report.spec.ts`
- **Gate**: type
- acceptance:
  - At start, every agent file delendai manages is compared with what the resolved server name and tool catalogue imply. A grant naming another server, a missing tool group, or one the server no longer serves is rewritten in the managed block, and the start-up report names each file changed.
  - Lines a person added outside the managed block are kept and reported. An agent file with no managed block is never rewritten, only reported.
  - Renaming the server in the host's MCP configuration and restarting leaves every agent granting the new name's tools, and none granting the old.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `e22de8ba84d4`

### S6 — The agents and their tools follow the project, including its own plugins

- **Status**: review
- **Files**:
  - `packages/core/src/lib/scaffold/plugin-agents.service.ts`
  - `packages/core/src/lib/scaffold/plugin-agents-report.ts`
  - `packages/core/src/lib/contracts/interfaces/agent-role-contribution.interface.ts`
  - `packages/core/src/lib/plugins/plugin-contract.ts`
  - `packages/core/src/lib/cli/assemble.ts`
  - `packages/core/tests/src/lib/scaffold/plugin-agents.service.spec.ts`
- **Gate**: type
- acceptance:
  - The agents created and the tools each is granted come from the consuming project's resolved configuration: the plugins it activates, including plugins the project ships itself and delendai does not. They no longer come from a fixed list written for this repository.
  - A plugin may declare the agent roles it contributes, or the tools an existing role needs. Activating it adds those roles or grants at the next start; deactivating it removes them.
  - The end-to-end spec runs in a throwaway consumer project with a local plugin (not this repository, whose dogfood setup hides the defect). It shows the plugin's tools granted to the agents that use them.
- review-state: in_review
- review-implementer: claude-opus-5-5
- shipped-in: `e22de8ba84d4`

## acceptance

- A first start in an empty project leaves it set up with the defaults.
- A start under a changed configuration leaves cache, docs and generated configuration matching it, with nothing a person wrote lost.
- A server under any name, in any case, has its agents created and its tools recognised.
- Agents already on disk are corrected to the current server name and tool catalogue at each start, and reflect the plugins the project activates, its own included.

