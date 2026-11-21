---
id: x00616
title: "The CLI reached past the surface that decides what is reachable"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-23
shipped-in:
  - "6f0d3f094"
  - "0e0fbedf7aa262852d1904da68ce7f5a0efcfca6"
last-transition-id: 431ec3c5-f01b-4e7a-90e5-ca7d521943b9
last-correlation-id: 431ec3c5-f01b-4e7a-90e5-ca7d521943b9
last-transition-from: review
---

# x00616 — The CLI reached past the surface that decides what is reachable

## goal

`delendai search`, `delendai metrics`, `delendai scaffold`,
`delendai docs list`, `delendai docs read` and the validation-matrix
command all failed with `MCP tool "…" returned an error` and no cause —
in a consumer project and in this repository alike. Six of the eight tools
the CLI calls are not exposed to `tools/call`; the CLI called them anyway.

## why

Measured against the live server, listing what the surface exposes and
asking for each tool the CLI calls:

```
HIDDEN  delendai_docs_docs_list
HIDDEN  delendai_docs_docs_read
HIDDEN  delendai_get_validation_matrix
HIDDEN  delendai_metrics
visible delendai_overview
HIDDEN  delendai_scaffold
HIDDEN  delendai_search_search
visible delendai_status
```

The managed surface keeps plugin tools hidden until something activates
them — that is the point of the router, and of the ~4 KB/preset it saves.
`delendai_overview` and `delendai_status` are router tools, so they
worked; everything else did not, and the two that happen to work are why
nobody noticed.

The failure said nothing. `MCP tool "…" returned an error`, while the
cause sat in the result the error already carried:

```
MCP error -32602: Tool delendai_search_search not found
```

Two spellings, both measured: `not found` for a tool the surface hides,
`disabled` for one it has switched off on this surface. The resolver runs
all of them, so the distinction is about the surface, not the tool.

Asked through the router instead, the same call succeeds: in this
repository it scans 5,544 files; in a consumer project laid out nothing
like ours — `src/app`, `documentation/`, a `docsDir` of its own — it scans
their six files and finds the token in `.ts`, `.html` and `.md` alike.
That last part is the regression `a00063` was written about, and it now
passes for real.

## why this design

**The CLI asks for a capability; the router decides how to reach it.**
There is one seam — `request` in `cli-command.helper.ts`, which every CLI
command already uses — so the fix lands once for six command families
rather than six times.

**The direct call stays first.** A visible tool costs one round trip, and
a surface that exposes a tool is telling you to call it. Only the
surface's own refusal — *this one is not exposed here* — turns into a
second attempt through the resolver, which is precisely what the resolver
exists for.

**A bad argument is not a hidden tool.** `-32602` covers both, and
retrying an invalid-params failure through the resolver would hide a
caller's mistake behind a second one. The predicate excludes it.

**The resolver is derived, not hardcoded.** Both the tool and the router
carry the project's configured namespace prefix, so a project that
renamed its namespace gets its own resolver rather than ours.

## non-goals

- Changing which tools the surface exposes. The managed surface is a
  deliberate token trade and stays as it is.

## Slices

### S1 — A hidden tool is reached through the router

- **Status**: done
  hits here (5,544 files scanned) and in a consumer project (3 hits across
  their 6 files, in `.ts`, `.html` and `.md`), and `metrics` answers where
  it used to fail. The second spelling cost a round of measurement:
  `metrics` and `scaffold` answer `disabled` where `search` answers `not
  found`, and treating only the first as retryable left four command
  families broken.
- **Gate**: `npx vitest run packages/cli/src/lib/helpers/tool-request.service.spec.ts`
- **Files**: `packages/cli/src/lib/helpers/tool-request.service.ts`,
  `packages/cli/src/lib/helpers/tool-request.service.spec.ts`,
  `packages/cli/src/contracts/interfaces/tool-request.interface.ts`,
  `packages/cli/src/lib/helpers/cli-command.helper.ts`
- `request` retries through `<prefix>_resolve_capability` when, and only
  when, the surface says the tool is not exposed here; a visible tool
  still costs one round trip.
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 0e0fbedf7 (x00616 S1, merge PR #357). fix(cli): reach a tool the way the surface says to. tool-request.service.ts: `request` reintenta vía `<prefix>_resolve_capability` solo cuando la superficie dice 'not exposed here' (no en -32602 de invalid-params — eso sería esconder un caller mistake). tool-request.service.spec.ts 190 líneas (verifies 'search' hits en este repo + consumer project con layout foráneo). claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5 from commit 0e0fbedf7aa2 names refs/heads/delendai/wip/claude-opus-5/x00616-S1-g1/the-cli-reaches-a-hidden-tool (0e0fbedf7aa262852d1904da68ce7f5a0efcfca6), opened by minimax-m3

### S2 — A tool error carries the tool's own words

- **Status**: done
  server said:` followed by the tool's own text, using the same helper a
  dying server's last words go through.
- **Gate**: `npx vitest run packages/client`
- **Files**: `packages/client/src/lib/transport/mcp-stdio-client.ts`
- The thrown message quotes `result.content`, which the error already
  carried and nobody read.
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: minimax-m3
- review-log: approved by minimax-m3 — Revisé 0e0fbedf7 (x00616 S2). fix(client): a tool error carries the tool's own words. mcp-stdio-client.ts: el thrown message ahora lee '... returned an error. The server said:' seguido del texto del tool, vía el mismo helper que usa withServerWords. 249/249 verde en packages/client (32 specs). claude-opus-5-5 != minimax-m3 → veredicto independiente.
- review-attribution: claude-opus-5 from commit 0e0fbedf7aa2 names refs/heads/delendai/wip/claude-opus-5/x00616-S1-g1/the-cli-reaches-a-hidden-tool (0e0fbedf7aa262852d1904da68ce7f5a0efcfca6), opened by minimax-m3

## acceptance

- `delendai search <token>` returns hits in this repository and in a
  consumer project with a foreign layout.
- `delendai metrics` and `delendai status` both answer.
- A tool error names what the tool said.
- A visible tool is not asked for twice.
