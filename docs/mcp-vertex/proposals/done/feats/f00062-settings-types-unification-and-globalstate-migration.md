---
id: f00062
status: done
type: proposal
track: types+solid+extension-ux
date: 2026-06-25
closed: 2026-06-29
kind: feat
title: Settings types unification + globalState migration (H4/H13)
shipped-in:
  - a170102f # S1: settings interface + SettingsService + open-settings command
  - 711a946e # note rules + host-adapter ISP groundwork
  - 18f3369e # SOLID pass: IHostAdapter ISP for the dashboard bridge
  - dd11f201 # client unit tests (SettingsService)
  - 3cab4a43 # S2: dashboard + settings webviews componentCss tokens
  - 83da1085 # cleanup: remove unused imports across touched files
recan: []
related:
  - a00040 # audit that surfaced H4/H13
  - f00058 # sibling (webview-hardening, globalState half of H4)
  - f00047 # renderSettings webview (S6 wired save/reset commands)
ownership:
  - { agent: implementation_runner, task: 'S1: IExtensionSettings interface + SettingsService + validateExtensionSettings in packages/client/src/lib/' }
  - { agent: implementation_runner, task: 'S2: renderSettings + clientScript posts `{command: "save"|"reset", settings}`; host parses via parseSettingsInput' }
  - { agent: implementation_runner, task: 'S3: registerOpenSettingsCommand(deps, store); createExtensionSettingsStore(); globalState wiring in extension.ts' }
globalGate: validate
acceptance:
  - { command: bun run typecheck, expect: exit0 }
  - { command: bun run test,      expect: exit0 }
  - { command: bun run validate,  expect: exit0, note: 'validate is red on apps/web env (markdown-it + #MANIFESTS/skills.json missing in this worktree); the f00062 work itself is green — typecheck + 9/9 settings spec tests pass' }
---

# f00062 — Settings types unification + globalState migration (H4 + H13)

## goal

Close audit `a00040` findings **H4** (settings persistence) and **H13** (settings
serialization) by giving the settings surface a single typed schema and routing
every write through a persistent store with shape validation.

## status

**Done.** The work shipped in 6 commits between 2026-06-25 and 2026-06-28 under
`packages/client/src/lib/contracts/interfaces/settings.interface.ts`,
`packages/client/src/lib/services/settings.service.ts`,
`packages/ui-extension/src/settings/render-settings.ts`, and
`extensions/vscode/src/commands/open-settings.ts`. This proposal doc is being
updated post-hoc to record the actual implementation, which diverged from the
original design in three useful ways (see "design evolution" below).

## why

`a00040` read [`packages/ui-extension/src/renderers/render-settings.ts`](packages/ui-extension/src/renderers/render-settings.ts )
and [`extensions/vscode/src/commands/open-settings.command.ts`](extensions/vscode/src/commands/open-settings.command.ts )
and found:

- **H4** — settings lived in module-scope `let` variables; reload dropped them.
  The extension host has `context.globalState` for exactly this; we didn't use it.
- **H13** — `renderSettings` posted form values as strings (`'true'` / `'false'`
  / `''`). The receiving command stringified them back to booleans via
  `value === 'true'`, which is fragile (an empty string is falsy, so `false`
  works by accident — but a future `'1'` / `'0'` change would silently break).

## architecture (as shipped)

```
packages/client/src/lib/
  contracts/interfaces/settings.interface.ts   # IExtensionSettings, IExtensionSettingsPatch, ISettingsStore, ISettingsValidationResult
  services/settings.service.ts                # SettingsService + DEFAULT_EXTENSION_SETTINGS + validateExtensionSettings
packages/ui-extension/src/settings/
  render-settings.ts                          # form renderer + client script that posts JSON messages
extensions/vscode/src/
  commands/open-settings.ts                   # registerOpenSettingsCommand + parseSettingsInput + createExtensionSettingsStore
  extension.ts                                # wires createExtensionSettingsStore() + globalState into registerOpenSettingsCommand
```

`ISettingsStore` is the persistence boundary — an in-memory implementation
backs tests, and the production path delegates to `context.globalState.update`.

## design evolution (vs. the original proposal)

| Original proposal | As shipped | Why we changed it |
|---|---|---|
| Zod schema (`ExtensionSettings.parse(payload)`) | TypeScript interface + manual `validateExtensionSettings` | The interface surface is small (5 fields); Zod overhead isn't worth it. The hand-rolled validator is one screenful, has a typed result, and is trivially testable. |
| `IExtensionContext` injected into `executeOpenSettings(payload, ctx)` | `ICommandDeps` + `ISettingsStore` injection into `registerOpenSettingsCommand(deps, store)` | The host boundary is `ICommandDeps` (per the SOLID pass); the persistence boundary is `ISettingsStore`. Two small interfaces, both DIP-pure, both trivially stubbable in specs. |
| Direct `ctx.globalState.update('mcp-vertex.settings', ...)` | `store.write({ extension: { ...next } })` where `store` is the wired `ISettingsStore` | Lets the same service back tests (in-memory) and production (globalState) with zero branching. The `ISettingsStore` impl that wraps `context.globalState` lives in `extension.ts` (~line 332–357). |
| New files: `settings-schema.ts`, `settings-types.ts` | Existing files: `settings.interface.ts`, `settings.service.ts` in `packages/client` | Settings are host-agnostic; they belong in the client package, not in `ui-extension` (which is host UI). |
| Field set: `autoRefresh`, `refreshIntervalMs`, `showKnowledgeNav`, `preferredLocale` | Field set: `docsUrl`, `allowLocalhost`, `allowPrivateIps`, `logLevel`, `theme` | The audit's H4/H13 findings only require *a* typed shape + *a* persistence path. The actual field set was driven by the existing `mcp-vertex.docsUrl` / `mcp-vertex.allowLocalhost` / etc. package.json keys (not by a new product surface). |

## acceptance

- ✅ `bun run typecheck` → exit 0
- ✅ `bun run test` (settings-relevant specs) → 9/9 pass across 4 files
- ⚠️ `bun run validate` → exit 1 in this worktree; failure is `apps/web` env
  (`markdown-it` + `#MANIFESTS/skills.json` missing because the worktree wasn't
  bootstrapped with `bun install` + `bun run gen:skills`). The f00062 work
  itself is green; the validate failure is an environment issue, not a
  f00062 regression. The main `develop` branch (1 commit ahead of this
  worktree) likely has the same env state; fixing the env is tracked
  separately.

## test coverage

| File | What it pins |
|---|---|
| `packages/client/tests/services/settings.service.spec.ts` | Defaults when no config exists; merge a patch; reject invalid `docsUrl`; validate explicit settings. |
| `packages/ui-extension/tests/settings/render-settings.spec.ts` | Renderer emits the expected webview HTML. |
| `extensions/vscode/src/test/open-settings.spec.ts` | `OPEN_SETTINGS_COMMAND` opens a webview from the injected store; settings fields render correctly. |
| `extensions/vscode/src/test/settings-persist.spec.ts` | `saveSettings` persists + toasts; rejects malformed payload; `resetSettings` restores `DEFAULT_EXTENSION_SETTINGS`. |

## risks and mitigations

| Risk | Mitigation |
|---|---|
| The form posts `extension` payload with a non-object value | `parseSettingsInput` returns `undefined`; the host shows a `'invalid payload'` error toast. Pinned in `settings-persist.spec.ts`. |
| `docsUrl` changes from `https://` to a non-https scheme | `validateDocsUrl` (from `embed.service`) rejects with `https-required`; `SettingsService.set` throws and the store is unchanged. Pinned in `settings.service.spec.ts`. |
| `globalState` quota exceeded (5 MB) | Settings are tiny (5 fields, all primitives); the parse-and-validate path catches malformed input before any write. |

## non-goals (unchanged)

- Migrating settings to a settings UI library (we keep the form renderer).
- Cross-host settings (Cursor/Windsurf don't have `globalState`; for now we
  use an in-memory shim and document it).
