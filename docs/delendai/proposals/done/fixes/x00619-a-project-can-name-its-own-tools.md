---
id: x00619
title: "A project can name its own tools"
kind: fix
status: done
type: proposal
track: trust
date: 2026-09-23
shipped-in:
  - "0e0fbedf7"
  - "84352346b3f9145547b451927dc2a88f4e37971f"
last-transition-id: 0d39c970-457a-4355-9bee-5f422540e036
last-correlation-id: 0d39c970-457a-4355-9bee-5f422540e036
last-transition-from: review
---

# x00619 — A project can name its own tools

## goal

The host config declares:

> *Prefix for host tool names, e.g. `acme` → `acme_*`. delendai never
> invents tool names outside a declared namespace.*

Nothing could set it. No flag, no config key — `corePrefix` read
`args.namespacePrefix ?? 'delendai'` and no shipped entry point ever
supplied that argument, so every project got `delendai_*` and the promise
could not be exercised by anybody.

## why

Two halves, and fixing either alone makes things worse.

**The knob was unreachable.** `delendai.config.json` has no such key;
`--namespace` does not exist as a flag. The field, its type and its
documentation described behaviour no consumer could reach.

**And the CLI could not have coped.** It names tools in **80 places** as
literal `delendai_*` strings, against exactly one place that derives the
prefix from the server's own report — and that one carries a comment about
a previous bug where a prefix assumption made `plugin inspect` return an
empty list every time. Wiring the knob without that would have handed a
project a server whose tools its own CLI cannot name.

## why this design

**The surface knows, so ask the surface.** The router's tools are always
exposed, and one of them ends in `_resolve_capability`. Reading the prefix
off that replaces eighty statements of the same fact with one question to
the only thing that can answer it — one `tools/list` per context, cached.

**A canonical name is a logical name.** The 80 call sites keep saying
`delendai_search_search`; the leading segment is a namespace the server
chooses, and the helper respells it. No call site had to change, and none
can drift, because none of them is the source any more.

**The project declares it where a project declares things.** In
`delendai.config.json`, beside everything else it decides — not behind a
flag that only a host could pass.

## non-goals

- Changing the default. A project that says nothing still gets
  `delendai_*`.
- Renaming the 80 call sites. They are correct as logical names; making
  them derive would be a second mechanism for a thing that now has one.

## Slices

### S1 — The namespace comes from the server, and the project can set it

- **Status**: done
  declaring `acme`: the surface exposes `acme_overview`,
  `acme_resolve_capability`, …, and `delendai search findMeHere` returns
  its hit through a CLI that still spells every tool `delendai_*`. The
  default is unchanged, checked in this repository.
- **Gate**: `npx vitest run packages/cli/src/lib/helpers/tool-request.service.spec.ts`
- **Files**: `packages/cli/src/lib/helpers/tool-request.service.ts`,
  `packages/cli/src/lib/helpers/tool-request.service.spec.ts`,
  `packages/cli/src/lib/helpers/cli-command.helper.ts`,
  `packages/core/src/lib/plugins/load-config-file.ts`,
  `packages/core/src/lib/cli/assemble.ts`
- `serverPrefix` reads the namespace off the exposed router tool and
  caches it per context; `requalify` respells a canonical tool name for
  that namespace; `assemble` honours `namespacePrefix` from the config
  file.
- review-state: done
- review-implementer: claude-opus-5
- review-reviewer: minimax-3
- review-log: approved by minimax-3 — Independiente: implementer claude-opus-5, reviewer minimax-3. Verifiqué 84352346b3. PR MERGED. The namespace comes from the server, and the project can set it
- review-attribution: claude-opus-5 from commit 84352346b3f9 names refs/heads/delendai/wip/claude-opus-5/x00619-S1-g1/the-server-owns-its-namespace (84352346b3f9145547b451927dc2a88f4e37971f), opened by minimax-3
## acceptance

A project declaring `"namespacePrefix": "acme"`:

- has a server whose tools are `acme_*`;
- has a working CLI — `delendai search <token>` returns its hits —
  without one call site changing;
- and a project that declares nothing still gets `delendai_*`.
