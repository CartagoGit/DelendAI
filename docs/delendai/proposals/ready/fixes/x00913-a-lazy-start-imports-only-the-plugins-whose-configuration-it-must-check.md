---
id: x00913
title: "A lazy start imports only the plugins whose configuration it must check"
kind: fix
status: ready
type: proposal
track: general
date: 2026-10-18
---

# x00913 — A lazy start imports only the plugins whose configuration it must check

## goal

The lazy plugin route defers loading, and its start-up check of the configuration imports only the plugins that check needs: those the user configured and those whose options cannot be empty. Configuration errors still surface at start-up, as now; a server on the default surface stops importing every plugin before it serves.

## why

`validateManagedLazyConfiguration` (`packages/core/src/lib/plugins/managed-lazy-runtime.ts`) imports every plugin in the catalogue to normalise its options before assembling, so the lazy route defers `register()` but not `import()`. q00011 measured it on 2026-09-02 (1463 ms, 54 activators) and left it as input, because moving validation to activation would move when a configuration error appears. Measured again 2026-10-18: importing the 55 catalogued plugins costs ~550 ms cold, on every server start and every CLI command that assembles.

Only two plugins declare `validateConfiguration` (commit-policy, proposals), and both read only options the user wrote (proposals' is a no-op; commit-policy's reads its own `push` block). A plugin with no user options whose schema accepts `{}` cannot fail normalisation, so importing it at start-up checks nothing.

## non-goals

- Changing when a configuration error appears: every plugin with user options, or with options that cannot be empty, is still imported and checked at start-up.
- The eager route.

## slices

- global_gate: type

### S1 — Import what the check needs

- **Status**: pending
- **Files**: `packages/core/src/lib/plugins/managed-lazy-runtime.ts`
- **Gate**: type
- acceptance:
  - "The managed-lazy catalogue records, per plugin, whether its options schema rejects `{}` (generated, never hand-written) and whether it declares `validateConfiguration`; the start-up check imports a plugin only when the user configured it, its options cannot be empty, or it checks the configuration. A spec holds that an unconfigured plugin is not imported and that a configured plugin with invalid options still fails at start-up. The assembly time of the default surface is measured before and after."

## acceptance

- A lazy start checks every configuration it checked before, and imports nothing else.
