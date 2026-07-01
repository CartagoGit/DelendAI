---
id: f00071
status: done
type: proposal
track: plugins/status-marker+configuration+i18n+agent-contract
date: 2026-06-26
closed: 2026-07-01
kind: feat
title: status-marker user-configurable marker set — add / disable / override from host config
shipped-in:
    - 73ba00f1 # S1-S6 feat(status-marker): user-configurable marker set
    - 9c8cf1cd # S7 feat(status-marker,tools): README example + user-markers CI lint
recan: []
related:
    - f00070 # sibling proposal (bilingual rendering, additive)
    - f00059 # sibling i18n thread across web/extension surface
    - r00005 # locale-aware date/time formatting
ownership:
    - { agent: proposal_guardian,    task: 'S1: design `IUserMarkerDefinition` Zod schema + merge semantics (built-in ⊕ user-set ⊕ overrides)' }
    - { agent: implementation_runner, task: 'S2: extend plugin `OptionsSchema` to accept `markers.add`, `markers.disable`, `markers.override` from `mcp-vertex.config.json`' }
    - { agent: implementation_runner, task: 'S3: `mergeMarkerTable(builtIn, userCfg)` returns the effective `MARKERS`; sort by declared order; emoji-uniqueness check' }
    - { agent: implementation_runner, task: 'S4: thread the merged table through `formatCloseMarker` and `validateCloseMarker`; keep protocol state names unique or alias them' }
    - { agent: implementation_runner, task: 'S5: extend `MARKERS_BY_LOCALE` so user-defined states can supply their own per-locale bracket text; default locale text falls back to the state name' }
    - { agent: implementation_runner, task: 'S6: extend `<prefix>_close` input schema to accept the merged enum; regenerate `tool-outputs.ts`; add spec coverage' }
    - { agent: implementation_runner, task: 'S7: `mcp-vertex.config.json` example in README; CI lint that the declared markers collide-cleanly with the built-ins' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,                                              expect: exit0 }
    - { command: bun run --cwd plugins/status-marker test,                      expect: exit0 }
    - { command: bun run --cwd plugins/status-marker typecheck,                  expect: exit0 }
    - { command: bun run types:generate,                                        expect: exit0 }
    - { command: bun run validate,                                               expect: exit0 }
---

# f00071 — status-marker user-configurable marker set

## goal

Let a host extend the canonical close-marker set **without forking** the
[`@mcp-vertex/status-marker`](../../plugins/status-marker ) plugin. Today the
8 states (`HECHO` / `CAP` / `RE-PIVOT` / `CHECKPOINT-REQUIRED` /
`REPAIR-NEEDED` / `BLOQUEADO` / `SIN PROPUESTAS LIBRES` / `SIN PROPUESTA DE
NINGUN TIPO`) are hard-coded in
[`plugins/status-marker/src/lib/markers.ts`](../../plugins/status-marker/src/lib/markers.ts ).
Hosts that want to teach their own agents a new closure (e.g. `REVIEW` for a
code-review flow, or `DEFERRED` for a postponed task) either fork the plugin
or hand-format lines that the validator then rejects.

This proposal adds a **declarative** layer: the host config gains a
`markers` block under `plugins.status-marker.options`, with three
disjoint fields:

```jsonc
// mcp-vertex.config.json
{
  "plugins": {
    "status-marker": {
      "options": {
        "markers": {
          "add": [
            {
              "id": "REVIEW",
              "emoji": "🟪",
              "requiresReason": true,
              "locales": { "es": "REVISIÓN", "en": "REVIEW" },
              "instruction": "Close after a successful code review pass."
            },
            {
              "id": "DEFERRED",
              "emoji": "⏸️",
              "requiresReason": true,
              "instruction": "Use when the slice is parked for a later slice."
            }
          ],
          "disable": ["SIN PROPUESTA DE NINGUN TIPO"],
          "override": {
            "BLOQUEADO": { "instruction": "Use when an external dependency (CI, registry, vault) blocks the slice." }
          }
        }
      }
    }
  }
}
```

The plugin merges that block with the built-in table at boot time and
the rest of the system sees one unified `MARKERS`. The wire-format enum
(`state`) grows additively — adding a marker is **non-breaking** for
existing consumers; removing a built-in via `disable` is breaking and
must be opted into explicitly.

## why

Hosts onboard agents with domain-specific closures all the time:

- A code-review host adds `REVIEW` to mark an LLM that just inspected a
  PR and is ready for human eyes.
- A multi-step planner adds `DEFERRED` so the orchestrator knows not to
  re-pick the slice next cascade.
- A long-running migration adds `MIGRATING` so an agent can flag it is
  in the middle of a multi-turn change and the next response should
  continue, not close.

Today each of these hosts either writes its own plugin (which the core
ecosystem does not discover, so skills and metrics fragment) or hand-
formats a marker line that the validator rejects as `bad-format`. The
first path explodes the plugin count; the second path breaks the agent
contract silently.

The user's instinct is the right one: **let the configuration declare
the closure, not the source code**. f00070 already opened that door for
`locale`; this proposal widens it to the marker identity itself.

## why this design

### Schema (Zod, additive on top of `IFormatCloseMarkerOptions`)

```ts
export const UserMarkerSchema = z.object({
  /** Uppercase ASCII identifier; used as the protocol `state` token. */
  id: z.string().regex(/^[A-Z][A-Z0-9_-]*$/, 'id must be UPPER_SNAKE_CASE'),
  /** Single emoji or short symbol that prefixes the bracket. Must be unique
   *  across the merged table. */
  emoji: z.string().min(1).max(8),
  /** Whether `<prefix>_close` will demand a reason for this state. */
  requiresReason: z.boolean(),
  /** Per-locale bracket text. Keys MUST be valid `CloseMarkerLocale`s.
   *  Missing locales fall back to the state name. */
  locales: z.record(z.string(), z.string().min(1)).optional(),
  /** Free-form guidance surfaced via `<prefix>_ping` and the
   *  `mcp-vertex-status-marker-and-closure` skill so the agent knows
   *  when to emit the state. */
  instruction: z.string().min(1).max(280).optional(),
});

export const UserMarkerConfigSchema = z.object({
  add: z.array(UserMarkerSchema).optional(),
  disable: z.array(z.string()).optional(),
  override: z.record(
    z.string(),
    z.object({
      instruction: z.string().min(1).max(280).optional(),
      locales: z.record(z.string(), z.string()).optional(),
      requiresReason: z.boolean().optional(),
    }),
  ).optional(),
});
```

### Merge semantics (S3)

| Operation | Effect on the effective `MARKERS` |
|---|---|
| `add[i]` | Insert `i` at the end of the iteration order. `id`, `emoji` must be unique across the merge — collision with a built-in is rejected at boot with a structured `ok: false` envelope. |
| `disable[i]` | Remove the built-in state `i`. Errors if `i` is not a known built-in id, or if disabling would leave the table empty (`HECHO` is **not** disablable — it's the floor). |
| `override[i].*` | Patch the matching built-in's `instruction`, `locales`, or `requiresReason` flag. The `emoji` is **not** overridable (would break consumers parsing by emoji). |

Iteration order matters because `CLOSE_MARKER_STATES` is declared as
`Object.keys(MARKERS)`; user-added markers therefore appear at the end
of the skill table, after the 8 built-ins.

### Wire format (S4, S6)

The Zod enum for `state` in `<prefix>_close`'s input schema is **regenerated
at boot** to the merged set:

```ts
const CloseInputSchema = z.object({
  state: z.enum(mergedStates as readonly [CloseMarker, ...CloseMarker[]]),
  reason: z.string().max(160).optional(),
  locale: z.enum(['es', 'en']).optional(),
});
```

`tool-outputs.ts` regeneration (via `bun run types:generate`) is gated by
the drift-guard test: if a host adds `REVIEW` to its config but forgets to
regenerate the SDK, the test fails. This keeps the typed envelope in
lock-step with the runtime.

### Locale fallback (S5)

User-added states can declare `locales: { es: 'REVISIÓN', en: 'REVIEW' }`.
Locales that the state does not list fall back to the state name itself
(matching the built-in behaviour). This means a host that only declares
ES renderings still gets a sensible EN fallback.

### Validator impact

`validateCloseMarker` already looks up the state by emoji (the
`EMOJI_TO_STATE` reverse map) and is therefore already tolerant of new
markers: any registered emoji + bracketed state is accepted. The merge
function must rebuild `EMOJI_TO_STATE` from the merged table — that is
the only place validation needs to know about user state.

### Skill / instruction surface

The `mcp-vertex-status-marker-and-closure` skill currently lists 8
states. With this proposal it adds a 9th section:

> **9. User-defined markers**: any host may extend this table via
> `mcp-vertex.config.json`. See [the proposal](#f00071) for the merge
> rules. When `<prefix>_ping` returns `markers.userDefined`, the agent
> sees them in its in-context skill.

`instruction` is included so the LLM knows when to emit each marker.
Without it, an LLM given a new state would not know the semantic.

## non-goals

- **Do not auto-discover markers from disk**. The plugin does not walk
  the workspace looking for `.marker.md` files (or anything similar).
  The host declares them in `mcp-vertex.config.json`, period.
- **Do not let `emoji` be overridden**. It is part of the wire contract
  with consumers that match by emoji.
- **Do not let `disable` remove `HECHO`**. It is the floor marker for
  any agent that ever produces output.
- **Do not ship a UI for editing the marker table.** A CLI helper
  (`bun tools/scripts/scaffolds/add-marker.script.ts`) is nice-to-have
  but not in scope; the JSON config is enough.
- **Do not break the wire format.** Existing consumers of the
  `<prefix>_close` enum continue to work; new states are additive.

## architecture

| Slice | File(s) | Risk |
|---|---|---|
| S1 — schema | new file in `plugins/status-marker/src/lib/markers-config.ts` | none (additive) |
| S2 — plugin options | [plugins/status-marker/src/index.ts](../../plugins/status-marker/src/index.ts ) | low |
| S3 — merge logic | [plugins/status-marker/src/lib/markers.ts](../../plugins/status-marker/src/lib/markers.ts ), new `mergeMarkerTable` | low (pure) |
| S4 — runtime wiring | [close-tools.ts](../../plugins/status-marker/src/lib/tools/close-tools.ts ), [validate.ts](../../plugins/status-marker/src/lib/validate.ts ) | low |
| S5 — locale fallback | `markers.ts` (extend `MARKERS_BY_LOCALE` reader) | low |
| S6 — types regen + spec | generated `tool-outputs.ts`, `tests/markers.spec.ts`, `tests/close-tools.spec.ts` | low |
| S7 — README + CI lint | [plugins/status-marker/README.md](../../plugins/status-marker/README.md ), new `tools/scripts/lint/user-markers.script.ts` | low |

## Slices

- global_gate: validate

### S1 — schema
- **Status**: done
- **Files**: plugins/status-marker/src/lib/markers-config.ts
- **Gate**: validate

Design `IUserMarkerDefinition` Zod schema + merge semantics.

### S2 — plugin options
- **Status**: done
- **Files**: plugins/status-marker/src/index.ts
- **Gate**: validate

Extend plugin `OptionsSchema` to accept `markers.add`, `markers.disable`, `markers.override`.

### S3 — merge logic
- **Status**: done
- **Files**: plugins/status-marker/src/lib/markers.ts
- **Gate**: validate

`mergeMarkerTable(builtIn, userCfg)` returns the effective `MARKERS`.

### S4 — runtime wiring
- **Status**: done
- **Files**: plugins/status-marker/src/lib/tools/close-tools.ts, plugins/status-marker/src/lib/validate.ts
- **Gate**: validate

Thread the merged table through `formatCloseMarker` and `validateCloseMarker`.

### S5 — locale fallback
- **Status**: done
- **Files**: plugins/status-marker/src/lib/markers.ts
- **Gate**: validate

Extend `MARKERS_BY_LOCALE` reader.

### S6 — types regen + spec
- **Status**: done
- **Files**: plugins/status-marker/tests/markers.spec.ts, plugins/status-marker/tests/close-tools.spec.ts
- **Gate**: validate

Generated `tool-outputs.ts` and test specs.

### S7 — README + CI lint
- **Status**: done
- **Files**: plugins/status-marker/README.md, tools/scripts/lint/user-markers.script.ts
- **Gate**: validate

README examples + user-markers script.

## dependency graph

```
S1 ──┐
S2 ──┼─ S3 ── S4 ── S5 ── S6 ── S7
```

## acceptance

All slices close when:

- `bun run --cwd plugins/status-marker typecheck` exits 0.
- `bun run test --cwd plugins/status-marker markers.spec.ts` exits 0.
- `bun run validate` exits 0.
- A host that adds a custom marker via `plugins.issues.options.markers.*`
  has it rendered on `<prefix>_close` calls without rebuilding the host.

## risks and mitigations

| Risk | Mitigation |
|---|---|
| User config violates JSON schema | OptionsSchema validation handles this on boot |

## notes

1. Land S1–S6 as a single `feat:` commit. The plugin's `OptionsSchema`
   gains `markers.*`; no consumer is forced to use it.
2. Land S7 (README example + CI lint) as a follow-up `feat:` commit.
3. Add a `f00071`-style acceptance block in the next audit to catch
   silent regressions (`audit_consolidate` reports any host that adds
   markers but does not regenerate the typed SDK).

### alternative considered

**Hot-load markers from a directory of `*.marker.json` files.** Rejected
because it pulls the source of truth out of the host's config schema and
makes drift invisible. A single JSON block in `mcp-vertex.config.json` is
easier to lint, regenerate, and review.
