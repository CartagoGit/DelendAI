---
id: f00062
status: ready
type: proposal
track: types+solid+extension-ux
date: 2026-06-25
kind: feat
title: Settings types unification + globalState migration (H4/H13)
shipped-in: []
recan: []
related:
    - a00040 # audit that surfaced these findings (H4/H13)
    - f00058 # sibling (webview-hardening, has the globalState half of H4)
ownership:
    - { agent: proposal_guardian,    task: 'S1: define `IExtensionSettings` Zod schema in `packages/ui-extension/src/settings/settings-schema.ts`; replace 4 ad-hoc settings shapes (H13)' }
    - { agent: implementation_runner, task: 'S2: `renderSettings` posts JSON-typed values; `openSettings` parses with the Zod schema and rejects malformed (H13 + DI)' }
    - { agent: implementation_runner, task: 'S3: settings payload goes through `IExtensionSettings.parse(payload)` at the extension boundary (H4 H13 closure)' }
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run test,      expect: exit0 }
    - { command: bun run validate,  expect: exit0 }
---

# f00062 — Settings types unification + globalState migration (H4 + H13)

## goal

Close audit `a00040` findings **H4** (settings persistence) and **H13** (settings
serialization) by giving the settings surface a single typed schema and routing
every write through `globalState` with Zod parsing.

The 3 slices are dependency-ordered. **H4's persistence half is shared with f00058 S3**
(`openSettings` → `globalState`). This proposal owns the **schema half** of H4 (the
typed parse on the boundary) and the full H13.

## why

`a00040` read [`packages/ui-extension/src/renderers/render-settings.ts`](packages/ui-extension/src/renderers/render-settings.ts )
and [`extensions/vscode/src/commands/open-settings.command.ts`](extensions/vscode/src/commands/open-settings.command.ts )
and found:

- **H4** — settings live in module-scope `let` variables; reload drops them. The
  extension host has `context.globalState` for exactly this; we don't use it.
- **H13** — `renderSettings` posts form values as strings (`'true'` / `'false'` /
  `''`). The receiving command stringifies them back to booleans via
  `value === 'true'`, which is fragile (an empty string is falsy, so `false` works
  by accident — but a future `'1'` / `'0'` change would silently break).

The fixes: a **typed schema** + **persist on the host boundary**.

## why this design

**Zod schema is the single source of truth.** The webview posts JSON; the command
parses with [`IExtensionSettings.parse(payload)`](packages/ui-extension/src/settings/settings-schema.ts ).
Malformed input is rejected with a typed error before it touches `globalState`.

**`globalState` is the documented VS Code persistence API.** It's a JSON-encoded
key/value store scoped to the extension, survives reload, has a 5 MB quota. The
schema parse keeps the quota safe (we reject inputs larger than the schema before
write).

## non-goals

- Migrating settings to a settings UI library (we keep the form renderer).
- Cross-host settings (Cursor/Windsurf don't have `globalState`; for now we use an
  in-memory shim and document it).

## architecture

```
packages/ui-extension/src/settings/
  settings-schema.ts          # NEW: IExtensionSettings (Zod) + DEFAULT_SETTINGS
  settings-types.ts           # NEW: typed shape (inferred from Zod)
extensions/vscode/src/
  commands/
    open-settings.command.ts  # MODIFY: parse with schema + persist to globalState
```

## slices

### S1 — `IExtensionSettings` Zod schema (H13)

- **Files**: [packages/ui-extension/src/settings/settings-schema.ts](packages/ui-extension/src/settings/settings-schema.ts)
- **Status**: ready
- **Gate**: bun run typecheck

```typescript
import { z } from 'zod';

export const ExtensionSettings = z.object({
  autoRefresh: z.boolean(),
  refreshIntervalMs: z.number().int().min(1000).max(60_000),
  showKnowledgeNav: z.boolean(),
  preferredLocale: z.enum(['en', 'es', 'fr', 'de', 'it', 'pt', 'ja', 'zh', 'ar', 'hi', 'th', 'vi']),
});

export type IExtensionSettings = z.infer<typeof ExtensionSettings>;

export const DEFAULT_SETTINGS: IExtensionSettings = Object.freeze({
  autoRefresh: true,
  refreshIntervalMs: 5_000,
  showKnowledgeNav: true,
  preferredLocale: 'en',
});
```

### S2 — `renderSettings` posts typed JSON (H13 + DIP)

- **Files**: [packages/ui-extension/src/renderers/render-settings.ts](packages/ui-extension/src/renderers/render-settings.ts)
- **Status**: ready
- **Gate**: bun run typecheck

Replace every `value="${value}"` with the typed `value={String(setting.value)}` —
but the **post** body uses `JSON.stringify({ setting, value })` and the receiving
command parses it with the Zod schema. Booleans stop being stringified.

### S3 — extension boundary parse + persist (H4 closure)

- **Files**: [extensions/vscode/src/commands/open-settings.command.ts](extensions/vscode/src/commands/open-settings.command.ts)
- **Status**: ready
- **Gate**: bun run validate

```typescript
export async function executeOpenSettings(
  payload: unknown,
  ctx: IExtensionContext,
): Promise<ICommandResult> {
  const parsed = ExtensionSettings.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, code: 'malformedSettings', issues: parsed.error.issues };
  }
  await ctx.globalState.update('mcp-vertex.settings', parsed.data);
  return { ok: true, settings: parsed.data };
}
```

`IExtensionContext` is injected (DIP) so the spec can stub it with an in-memory map.

## dependency graph

```
S1 (schema) → S2 (typed post) → S3 (parse + persist)
```

## acceptance

`bun run validate` exits 0. The spec file asserts:
- `ExtensionSettings.parse({ autoRefresh: 'true' as any })` returns a Zod error.
- `executeOpenSettings({ autoRefresh: 'not-a-bool' }, stubCtx)` returns `{ ok: false, code: 'malformedSettings' }`.
- After a valid write, `stubCtx.globalState.get('mcp-vertex.settings')` equals the parsed object.

## risks and mitigations

| Risk | Mitigation |
|---|---|
| The schema rejects a setting the current UI produces | We add a one-shot spec that builds the form with `DEFAULT_SETTINGS` and asserts the form's serialized output passes `safeParse`. |
| `globalState` quota exceeded (5 MB) | Settings are tiny; we document the limit in the schema (`z.number().max(...)`); the parser catches malformed before write. |
| Backward compat: existing users have settings stored as strings | We ship a one-time migration in S3: on first read of `globalState`, if the stored shape fails Zod parse, fall back to `DEFAULT_SETTINGS` and log a `console.warn`. |

## notes

The H13 finding overlaps with H4 (both touch `openSettings`). We split the work so each
proposal owns a coherent slice: **f00058 owns the persistence layer**, **f00062 owns
the schema layer**. The two proposals merge cleanly: f00058 S3 hands off to f00062 S3.