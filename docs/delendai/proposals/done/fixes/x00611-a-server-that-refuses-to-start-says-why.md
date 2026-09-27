---
id: x00611
title: "A server that refuses to start says why"
kind: fix
status: review
type: proposal
track: trust
date: 2026-09-23
shipped-in: ["2fdd43da1"]
---

# x00611 — A server that refuses to start says why

## goal

In a project that is not shaped like this one, every delendai command
answered:

```
Failed to connect to MCP server: McpError: MCP error -32000: Connection closed
```

Eight words, no cause, no remedy. The cause existed, was captured, and was
thrown away. It must reach the person.

## why

Driven against a throwaway consumer project — branch `trunk`, release
`stable`, profile `worktree-pr`, which is the profile this project
*recommends for a swarm* — with the **built** CLI, not the sources.

`delendai work status` is a local git question. It answered `Connection
closed` and exited 5.

What the server had actually said, recovered by running it by hand:

```
delendai.config.json declares a development policy that cannot be honoured:
  - [enforced-governance-needs-checks] integration.requiredChecks:
    Governance is enforced and a pull request is required, but no check is
    required — the gate would pass anything.
    List at least one required check context in
    `development.integration.requiredChecks`.
```

That is a **good** message with a concrete remedy, and nobody could ever
see it. Three layers between the sentence and the reader:

1. **The client discarded it.** `McpStdioClient.connect` pipes the child's
   stderr and exposes an `onStderr` hook — and the CLI passes
   `stderr: 'pipe'` with no hook, so the stream was read by nobody. Every
   cause of a failed start — a missing module, a bad path, a policy — came
   out as the same eight words.
2. **The server crashed rather than refusing.** `void serve(...)` is
   fire-and-forget, so `assemble`'s refusal became an unhandled rejection:
   a stack trace with the runtime's source listing wrapped around the one
   sentence a person can act on.
3. **Nothing said which file was spawned.** "The server refused" and "we
   spawned the wrong path" are opposite problems with opposite fixes, and
   they were indistinguishable.

The empty `requiredChecks` is **not** the defect and is not changed here.
The profile's own comment explains it: a profile cannot know what a
project's CI calls its checks, and inventing a plausible name silently
locks the branch — this repository has lived through exactly that. Firing
a validation rule with a concrete remedy is the right behaviour. The
defect is that the remedy never arrived.

## why this design

**The explanation belongs to whoever knows it.** The client cannot know
why a server refused to start; only the server knows. So the client
quotes it rather than guessing — one source for that answer, and no second
one to drift. The client adds only what the server *cannot* know, because
it never ran: which entrypoint was spawned, and in which workspace.

**Piped by default.** stderr was `inherit` unless a hook was passed, which
means a failure could only be explained by a caller who had already
thought to ask. A caller that wants the child's log on its own terminal
can still say `stderr: 'inherit'`, and it costs that caller the
explanation — an explicit trade rather than a silent one.

**Bounded, and the last words.** A server that dies mid-flood must not
have its whole log re-reported, and the last lines are the ones that
explain it.

## non-goals

- Changing `requiredChecks`, the profiles, or the validation rule. They
  are right; they were simply inaudible.
- Making `work status` run without a server. It is a fair question and a
  separate one; this proposal is about every command, not one.

## Slices

### S1 — The caller hears the server's own words

- **Status**: done — `withServerWords` quotes the child's last 4KB,
  indented, and says "the server exited without saying why" when it was
  silent, so a caller can tell an explanation from a vanishing. stderr is
  piped by default now; `inherit` stays available and costs that caller
  the explanation.
- **Gate**: `npx vitest run packages/client/tests/transport/mcp-stdio-client.spec.ts`
- **Files**: `packages/client/src/lib/transport/mcp-stdio-client.ts`,
  `packages/client/tests/transport/mcp-stdio-client.spec.ts`
- A failed connect carries the server's last words, bounded and quoted; a
  server that said nothing is reported as silent rather than as
  unexplained; a multi-line context puts the transport's own summary on
  its own line instead of gluing it to the last sentence.

### S2 — A refusal is a refusal, not a stack trace

- **Status**: done — the serve call keeps its fire-and-forget shape (it
  never returns) and gains a `.catch` that reports one line and sets a
  non-zero exit code; the spawn failure names the entrypoint and the
  workspace, which the server cannot report because it never ran.
- **Gate**: `npx vitest run packages/cli/src/index.spec.ts`
- **Files**: `packages/cli/src/index.ts`, `packages/cli/src/index.spec.ts`,
  `packages/cli/src/lib/stdio-context.factory.ts`
- A server that rejects on start is reported in one line and sets a
  non-zero exit code, without awaiting a call that never returns; the
  spawn failure names the entrypoint and the workspace.

## acceptance

Against a consumer project on `trunk` with `worktree-pr` and no
`requiredChecks`, using the built CLI:

- the failure names the rule, its remedy, the entrypoint and the
  workspace, with no stack trace;
- following the printed remedy makes the command succeed, and it then
  reports *that* project's branch and profile — `trunk`, `worktree-pr` —
  not ours.
