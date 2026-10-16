---
id: x00885
title: "The first boot sets a project up, a changed configuration brings it in line, and any server name works"
kind: fix
status: in-progress
type: proposal
track: general
date: 2026-10-12
last-transition-id: a5c34fc0-0e83-461b-a3b7-f0c9c76db6e8
last-correlation-id: a5c34fc0-0e83-461b-a3b7-f0c9c76db6e8
last-transition-from: ready
last-transition-at: 2026-10-16T16:37:10.727Z
shipped-in:
  - "1876ce52b3c0"
  - "bb314084310d"
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
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 1876ce52b3c0, validate exit 0, tests 409/409; acceptance 1/1: (1) verified in the review unit against the cited lines and tests; see the note for the recorded gap [true] — The spec boots the real server the way a host does: first-boot.e2e.spec.ts:41-63 builds an MCP client over StdioClientTransport that executes the CLI with __serve, then connects and lists tools. It is a genuine end-to-end, not in-process calls. All three required situations are present, though not one-test-per-situation: the empty project and the upper-case server name share the test at :84-93, and the changed-configuration case is split across a namespacePrefix change (:117-128) and an editor server rename (:130-139); the fourth test (:95-115) is the local-plugin case that S6 ACC3 needs. Recorded nit, not a block: the header describes the findings (:1-8) but no individual test says "what it finds today, before any fix" in its own name or comment, so a reader cannot tell which case documents a defect and which documents correct behaviour. 4/4 pass.

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
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 1876ce52b3c0, validate exit 0, tests 409/409; acceptance 2/2: (1) verified in the review unit against the cited lines and tests; see the note for the recorded gap [true] (2) verified in the review unit against the cited lines and tests; see the note for the recorded gap [true] — Both halves of ACC1 are implemented and the inert path is a real branch, not an accident. The boot only attempts the setup when there is no config path (run-cli.ts:248-249); first-run-setup.service.ts:53-60 aborts when delendai.config.json exists, when there is no .git, or when the project does not register delendai in its OWN mcp.json, and :61-70 then delegates to adopt_project, which plans the agent files at adopt-project.tool.ts:95-126 and persists them without overwriting existing ones at :462-519. The user-wide half has its own explicit branch at first-run-setup.service.ts:32-40. The docs README is created when missing and one line goes to stderr (:74-98), which is what "says so once" asks. ACC2 idempotence is enforced by the exists check at :53, not by files merely happening to be there; first-run-setup.service.spec.ts covers creation, the "once" behaviour (:83-90) and idempotence (:45-55), and first-boot.e2e.spec.ts:84-93 covers it through a real boot. Recorded gap, not a block: the user-wide-inert path has only a unit test (spec :63-70), never a boot from a global configuration.

### S3 — A changed configuration brings what is derived in line

- **Status**: pending
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
- review-state: changes_requested
- review-implementer: luna-x00885-s3
- review-reviewer: claude-opus-5-5
- review-log: requested_changes by minimax-m3.1-flash-preview — The transitions work and are tested; the report the criterion requires does not exist. WHAT IS DELIVERED: the configuration a workspace was last set up with is written to applied-config.json and read back (config-transitions.service.ts:136-176, :290-311), and the transitions are real — move the cache (:206-233), evict the plugin cache (:243-260), warn about a hand-set docsDir (:262-275), rewrite only the agents delendai names via a marker (namespace-prefix-transition.service.ts:37-60). Each transition yields its own steps and a per-transition outcome (:313-376). The tests cover move-without-overwrite, docs left intact, a silent second pass, and edited agents preserved (config-transitions.service.spec.ts:118-199, namespace-prefix-transition.service.spec.ts:43-77). WHAT IS WRONG: ACC1 ends "and reports each change", and nothing reports them. The boot calls ensureMigrated(workspaceRoot) with NO report callback (packages/cli/src/index.ts:352) and then renders only adoptionReportLines; that function (migration-report.service.ts:17-30) returns lines exclusively for DEVELOPMENT_POLICY_MIGRATIONS outcomes — it never looks at result.transitions. The transitions result IS attached to the run result (legacy-migration.service.ts:255-257) and is then dropped: a repo-wide grep for .transitions finds no consumer outside the two modules that build it. WHERE: packages/core/src/lib/workspace-migration/migration-report.service.ts:17-30; packages/cli/src/index.ts:352-356. WHY IT MATTERS: the whole point of this slice is that a start under a different configuration BRINGS THE WORKSPACE IN LINE, and moving a cache and rewriting agents are edits to somebody's repository. A person whose cache moved and whose agent files were rewritten is told nothing — the identical failure this repository's migration-report.service.ts was created to prevent, stated in its own docblock, now reproduced one layer over for config transitions. TO PASS: render result.transitions into the boot report, one line per applied transition naming what moved, and cover it with a test that fails when the lines stop being emitted. Note the criterion asks for EACH change; the outcome list already has per-transition granularity, so the data exists and only the renderer is missing.
- review-log: resubmitted by luna-x00885-s3 — resubmitted; answers the request above: Reports every applied configuration transition at startup while preserving adoption output and silence for no-op/unapplied outcomes; 39 scoped tests and core/CLI typechecks pass.
- review-log: requested_changes by claude-opus-5-5 — ACC1 is now met: adoptionReportLines (migration-report.service.ts) renders one line per applied transition step, and the boot prints them (packages/cli/src/index.ts:352-354); the specs pass 51/51 at f9c9545f3af4. ACC2 is not: 'What a person edited is kept and reported, never overwritten.' It is kept, but nothing reports it. The namespace transition skips an agent a person named (namespace-prefix-transition.service.ts followPrefix returns when !namedByDelendai) and emits only the generic 'rewrite-agents' step, so the report never names the files it left alone; the cache move merges entry by entry and skips what is already at the destination (bootstrapCacheLayout), and no step says which entries it kept. TO PASS: each transition returns, and the boot report prints, the files or entries it left because a person had changed or placed them (one line each, like agent-grant-report's 'left unchanged'), with a spec that fails when those lines stop.

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
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 1876ce52b3c0, validate exit 0, tests 409/409; acceptance 2/2: (1) verified in the review unit against the cited lines and tests; see the note for the recorded gap [true] (2) verified in the review unit against the cited lines and tests; see the note for the recorded gap [true] — The resolved server name drives everything downstream: the existing install's name is detected (detect-existing-install.ts:65-81), preserved on install (installer.ts:134), and carried into adoption and scaffolding (adopt-project.tool.ts:335-405, scaffold-host.ts:110-152). ACC1 has e2e evidence that a custom-named server produces agents (first-boot.e2e.spec.ts:84-91) plus scaffold-host.spec.ts:401-425 for the override/default shape. ACC2: mcp-server-name.helper.ts:13-14 normalises the name for the tool prefix, and the spec covers three distinct shapes — "delendai" (lower), "DelendAI" (upper) and "MCP-Project-Acme" (mixed) at mcp-server-name.helper.spec.ts:7-9 — so it would fail if the case handling regressed. Recorded, not blocking: the helper re-derives the prefix independently rather than asking the host, so the criterion's "the way the host derives it" is matched by behaviour and test rather than by delegation; a future change to the host's own rule could drift from this copy without either test noticing.

### S5 — Existing agents are brought in line with the server they serve

- **Status**: done
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
- shipped-in: `e22de8ba84d4`
- review-state: done
- review-implementer: luna-x00885-s5
- review-reviewer: claude-opus-5-5
- review-log: requested_changes by minimax-m3.1-flash-preview — ACC1 and ACC3 are delivered. ACC1: reconcileAgentGrants compares every managed agent against the registered servers, and a grant naming a server that no longer exists is rewritten in place with the current server's grant added (agent-grant-reconcile.service.ts:107-146); the report names each changed file (agent-grant-report.ts:11-20), covered by agent-grant-reconcile.service.spec.ts:42-59 and agent-grant-report.spec.ts:42-47. ACC3 is genuinely end to end: first-boot.e2e.spec.ts:130-139 renames the server in the editor's MCP configuration and asserts the agents grant the new name. WHAT IS WRONG: ACC2 says two things and delivers one. It is true that lines a person added outside the managed block are kept — the rewrite is a single text.replace of the front matter tools line (:146), so the body is never touched — and it is true that a file with no tools line is never rewritten. But ACC2 also requires both of those outcomes to be REPORTED, and neither is. A file with no front matter tools line is skipped by `toolsLine === undefined → continue` (:88-91) before any change is recorded, so it produces no entry in the returned changes array and therefore no line in the report: silently ignored, not reported. And a kept file has nothing reported either. WHERE: agent-grant-reconcile.service.ts:88-91 (silent skip) and :146 (rewrite with no reporting of what was left alone). WHY IT MATTERS: this is the same shape of defect this repository already fixed once — a file that is deliberately left alone must be said out loud, or the person reading the start-up report cannot tell "nothing to do here" from "delendai looked away". It is also the difference between a safe migration and a surprising one: somebody who hand-edited an agent has no way to learn that delendai saw the edit and chose not to touch it. TO PASS: push a report entry for a file that was skipped for having no managed block, and for one whose non-managed lines were preserved, and test that the start-up report names them.
- review-log: resubmitted by luna-x00885-s5 — resubmitted; answers the request above: Answers the requested ACC2 gap: managed agents without a tools line remain byte-for-byte unchanged and are reported; updated grants report that content outside the tools line was preserved. 10 scoped tests and core typecheck pass.
- review-log: approved by claude-opus-5-5 — verified at bb314084310d, validate exit 0, tests 51/51; acceptance 3/3: (1) agent-grant-reconcile.service.ts reconcileAgentGrants drops grants of unregistered servers and adds the current one, writing only the tools line; agent-grant-r… (2) the minimax objection is answered: a delendai-named agent with no tools line now yields a missing-tools-line change and the report says it was left unchanged; … (3) first-boot.e2e.spec.ts renames the server in the editor's MCP configuration and asserts the agents grant the new name, as minimax verified; unchanged by this f… — Independent review of luna-x00885-s5's fix (#1152): the change request is met. Typecheck exits 0; the reconcile, report, adoption-parity and transition specs pass 51/51 on develop at bb314084310d. The slice's own gate is type.

### S6 — The agents and their tools follow the project, including its own plugins

- **Status**: done
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
- shipped-in: `e22de8ba84d4`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: minimax-m3.1-flash-preview
- review-log: approved by minimax-m3.1-flash-preview — verified at 1876ce52b3c0, validate exit 0, tests 409/409; acceptance 3/3: (1) verified in the review unit against the cited lines and tests; see the note for the recorded gap [true] (2) verified in the review unit against the cited lines and tests; see the note for the recorded gap [true] (3) verified in the review unit against the cited lines and tests; see the note for the recorded gap [true] — ACC1 is the real point and it is delivered from the consumer's configuration, not from a fixed list: assemble-plugins.ts:493-504 collects agentRoles from the plugins actually loaded, plugin-agents-report.ts:28-35 projects them with loaded.flatMap, and plugin-agents.service.ts:56-69 and :86-138 render with the real server name. I looked for a residual hardcoded list driving the output and found none. ACC3 is the best-tested criterion in this proposal: first-boot.e2e.spec.ts builds a throwaway consumer project with its OWN local plugin (:1-7, :95-114) — exactly the point the criterion makes about this repository's dogfood setup hiding the defect — and asserts the GRANT, not merely that the files exist. Activation and deactivation of contributed roles are covered by plugin-agents.service.spec.ts:55-62 and :89-100. Recorded gap, not a block: ACC2's second mechanism is absent — agent-role-contribution.interface.ts:6-14 defines agentRoles only, and there is no surface for a plugin to declare the tools an EXISTING role needs. The criterion offers the two as alternatives and the first was built and tested, so I read this as half the slice rather than a miss; a plugin that wants to extend an existing role has no way to.

## acceptance

- A first start in an empty project leaves it set up with the defaults.
- A start under a changed configuration leaves cache, docs and generated configuration matching it, with nothing a person wrote lost.
- A server under any name, in any case, has its agents created and its tools recognised.
- Agents already on disk are corrected to the current server name and tool catalogue at each start, and reflect the plugins the project activates, its own included.

