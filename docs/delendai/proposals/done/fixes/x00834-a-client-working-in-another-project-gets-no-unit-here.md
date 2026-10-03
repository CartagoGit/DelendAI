---
id: x00834
title: "A client working in another project gets no unit here"
kind: fix
status: done
type: proposal
track: trust
date: 2026-10-03
priority: P1
related: [x00736, x00850]
last-transition-id: 6cbd2a76-6b12-41ab-b80c-91bffa6b559e
last-correlation-id: 6cbd2a76-6b12-41ab-b80c-91bffa6b559e
last-transition-from: review
shipped-in:
  - "ba221ff68d9f"
---

# x00834 — A client working in another project gets no unit here

## goal

The MCP `work` tool refuses to create, claim, checkpoint or publish a unit
for a client whose declared roots have nothing to do with the repository the
server serves, and names both.

## why

On 2026-10-03 this repository held a unit named
`delendai/wip/logistics-orchestrator/implement/q00034-s1-g1/work`, created on
2026-10-01 from a delendai commit. Neither the agent nor proposal `q00034`
exists here, nor in the logistics projects that agent belongs to. The `work`
tool runs in the server's workspace root and takes no project argument, so a
client working in another project that reaches a server serving this one gets
its unit here, and its commits would land in the wrong repository without a
word.

## why this design

- MCP lets a server ask its client which roots it works in. Only that answer
  is used: it is the client's own statement, not a guess from process
  directories.
- A root is this project when it is the workspace, holds it, lies inside it,
  or is a worktree of the same repository (same git common directory).
- Only writing actions are refused; `status`, `swarm` and `doctor` stay open.
- A client that declares no roots, or does not answer within two seconds, is
  not judged, so hosts without roots support behave exactly as before.
- The test kit's fake server gains a `clientRoots` override and a low-level
  server that, by default, offers no roots.

## non-goals

- Recording the owning session's project in the unit's lease: the lease
  (x00850) will record it, and this guard can then read the same fact.

## Slices

- global_gate: none

### S1 — The work tool refuses a client whose roots are elsewhere

- **Status**: done
- **Gate**: `npx vitest run packages/core/tests/src/lib/tools/work-unit-roots.helper.spec.ts packages/core/tests/src/lib/tools/work-unit.tool.spec.ts`
- **Files**:
  - `packages/core/src/lib/tools/work-unit-roots.helper.ts`
  - `packages/core/src/lib/tools/work-unit.tool.ts`
  - `packages/core/tests/src/lib/tools/work-unit-roots.helper.spec.ts`
  - `packages/core/tests/src/lib/tools/work-unit.tool.spec.ts`
  - `packages/test-kit/src/lib/fake-tool-server.helper.ts`
  - `packages/test-kit/src/contracts/interfaces/fake-tool-server.interface.ts`
- shipped-in: `ba221ff68d9f`
- review-state: done
- review-implementer: claude-opus-5-5
- review-reviewer: qwen3-flash
- review-log: approved by qwen3-flash — AC 1 — work-unit-roots.helper.ts decides a client root belongs (workspace/ancestor/inside/same-git-common-dir) and work-unit.tool.ts refuses the writing actions; test 'refuses a client that declares only a directory elsewhere, and names both' asserts nothing created. AC 2 — 'gives two servers of one model entering the same unit their own' + 'still reads the swarm, and still enters from this project' confirm read actions stay open and the repository client enters as before.
- review-attribution: claude-opus-5-5 from Merge pull request #730 from CartagoGit/delendai/pr/claude-opus-5-5/implement/x00834-all-g1/a-client-elsewhere-gets-no-unit-here (refs/heads/delendai/wip/claude-opus-5-5/implement/x00834-all-g1/a-client-elsewhere-gets-no-unit-here) (ba221ff68d9f823fcc878f5c2e54651b18d662c0), opened by qwen3-flash

## dependency graph

None.

## acceptance

- A client declaring only a directory outside the repository is refused
  `enter`, nothing is created, and the error names both directories.
- The same client can still read the swarm; a client in the repository
  enters as before.
