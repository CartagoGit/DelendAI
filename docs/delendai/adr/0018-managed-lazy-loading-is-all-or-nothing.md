# ADR 0018 — Managed-lazy loading is all-or-nothing, and every preset member must be indexed

> Status: **Accepted**.
> Date: 2026-09-02.

## Context

Under the managed surface (ADR 0017) the host does not import plugin
modules at boot. `tryAssembleManagedLazy` builds the tool surface from
`managed-lazy-catalog.generated.ts` — a compact index of which plugin
owns which tool — and imports a plugin only when one of its tools is
actually called.

That routing is why the mechanism is all-or-nothing. A plugin absent
from the index would own tools the runtime cannot activate, so the
assembler refuses the lazy route entirely when **any** effective plugin
is unindexed, and falls back to eager loading.

The fallback is the correct degradation: every tool keeps working. What
made it dangerous is that it was **silent**, and its blast radius is not
the offending plugin — it is the whole surface, for every adopter of
every preset that ships it. Boot imports all 54 plugin modules and
registers the entire tool surface up front. Symptomatically that reads
as "the server got slower", with nothing pointing at the cause.

Five plugins (`audit-orchestrator`, `browser`, `cache`, `external-mcps`,
`observability`) sat outside every preset for weeks precisely because
adding them looked expensive. Under lazy loading it is not: a preset
member costs a catalog entry until one of its tools is called.

## Decision

1. Every `PRESET_CATALOG` member MUST have an entry in
   `managed-lazy-catalog.generated.ts`.
2. `tools/scripts/lint/preset-drift.script.ts` enforces this
   (`preset-member-not-lazy-indexed`) and runs in `validate`. **Do not
   relax or skip this check** — regenerate the catalog instead:
   `bun tools/scripts/generate/managed-lazy-catalog.script.ts`.
3. When the assembler does decline the lazy route because of unindexed
   plugins, it says so on stderr, names them, states the cost, and gives
   that command (`packages/core/src/lib/plugins/managed-lazy-demotion.ts`).
4. The generator derives the index from `--preset=full` plus the root
   config, so adding a plugin to `full` and regenerating is sufficient.

## Consequences

- A plugin can be added to a preset without imposing a startup cost on
  adopters who never call it.
- The eager fallback stays available and correct; it is now diagnosable.
- Two invariants are load-bearing and must not be "simplified" away: the
  lint gate in `preset-drift`, and the stderr notice in the assembler.
  Both exist because the failure they cover is silent and global.

## Verification

- `preset-drift` reports the violation for an unindexed member and 0
  findings once regenerated.
- A real assembly with an unindexed specifier prints the demotion notice
  and still starts (`packages/core/tests/src/lib/plugins/managed-lazy-demotion.spec.ts`).
- A real `--preset=full` assembly yields 54 lazy plugin activators and
  212 lazy tool activators, including all five newly indexed plugins.
