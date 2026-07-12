---
id: r00008
kind: refactor
title: Unify shared UI settings and i18n, remove package cycle
status: ready
type: proposal
track: ui-architecture
date: 2026-07-12
---

# r00008 — unify shared ui settings i18n and remove package cycle

## Goal

Create one acyclic host-agnostic design-system and settings contract shared by web and extensions, with complete i18n, accessible rendering and consistent visual behavior.

## Why

El design system tiene una dependencia circular y web/extension discrepan en
temas, idioma, motion, persistencia y copy. La reutilización actual es parcial.

## Non-goals

- No imponer un storage único a todos los hosts.
- No introducir imports de VS Code en paquetes host-agnostic.

## Architecture

The 2026-07-12 audit recorded the following evidence and resolution tracks.

### 1. Extension settings persist without configuring the host or project

**File**: `extensions/vscode/src/commands/open-settings.ts:42-80`

```typescript
export const SETTINGS_STATE_KEY = 'mcp-vertex.settings';
const seeded = globalState.get<unknown>(SETTINGS_STATE_KEY);
await globalState.update(SETTINGS_STATE_KEY, next);
```

**Problem**: the settings webview stores a private blob in `globalState`, while
the server command/args/prefix are read from VS Code workspace configuration and
the project runtime is configured by `mcp-vertex.config.json`. The blob is only
read back by this settings form, so Save can succeed without changing runtime
behaviour.
**Impact**: the UI claims to configure mcp-vertex but only remembers form values.
**Resolution Track**: S2 defines the canonical host/settings boundary; S4 adds
real persistence adapters. The schema-driven project configuration center is a
separate feature proposal because it includes plugins and owned artifacts.

### 2. Theme and preference contracts disagree across surfaces

**File**: `packages/client/src/lib/contracts/interfaces/settings.interface.ts:1-7`

```typescript
readonly theme: 'system' | 'light' | 'dark';
```

**File**: `apps/shared/src/components/dev/theme-picker.ts:73-80`

```typescript
export const THEME_ORDER = [
  'system', 'light', 'dark', 'midnight', 'solarized', 'nord',
];
```

**Problem**: the extension contract exposes three themes, while shared/web
surfaces expose six plus language and motion preferences with different keys.
**Impact**: the same setting renders and persists differently depending on host.
**Resolution Track**: S2 and S3 establish one host-agnostic contract and renderer.

### 3. Save/reset announce success before the host acknowledges persistence

**File**: `packages/ui-extension/src/settings/render-settings.ts:64-79`

```typescript
if (vscode) vscode.postMessage({ command: 'save', settings: settings });
flash(savedMessage);
```

**Problem**: the webview flashes success immediately after `postMessage`; the
host may reject the payload or fail while writing, and it never sends a success
or error acknowledgement back to the renderer.
**Impact**: users can be told settings were saved when nothing changed.
**Resolution Track**: S3 owns request/ack UI state; S4 owns host acknowledgements
and error propagation.

### 4. Dev settings navigation can be overwritten by a delayed rerender

**File**: `extensions/vscode/src/dev/settings-panel.ts:392-407`

```typescript
const result = await installHandler();
window.setTimeout(async () => {
  const nextStatus = await fetch('/api/setup/status');
  rerender(nextStatus);
}, 800);
```

**File**: `extensions/vscode/src/dev/pages/settings.ts:52-64`

```typescript
if (body?.note) void options.navigate('dashboard');
return body?.note ? { note: body.note } : null;
```

**Problem**: install navigates to dashboard, then the settings component keeps a
timer that can repaint the old view into the shared root. Navigation also lacks
an unmount generation/abort contract.
**Impact**: a freshly opened dashboard can be replaced by stale settings markup.
**Resolution Track**: S4 adds adapter lifecycle cancellation and an e2e
install→navigate regression.

## Slices

- global_gate: e2e

### S1 — Remove shared ui package cycle
- **Files**: apps/shared/package.json
- **Files**: apps/shared/src/public/index.ts
- **Files**: packages/ui-extension/package.json
- **Gate**: `bun run typecheck`
- **Status**: pending

### S2 — Canonical settings and theme contract
- **Files**: packages/client/src/lib/contracts/interfaces/settings.interface.ts
- **Files**: packages/client/src/lib/services/settings.service.ts
- **Files**: apps/shared/src/components/dev/theme-picker.ts
- **Gate**: `bun run typecheck`
- **Status**: pending
- **Acceptance**:
  - One contract covers theme, language, motion and extension-host preferences without pretending that project config lives in globalState.
  - Theme choices derive from the shared catalog; web and VS Code cannot publish different unions.
  - Storage keys and migration/default semantics are explicit and tested.

### S3 — Shared localized settings renderer
- **Files**: packages/ui-extension/src/settings/render-settings.ts
- **Files**: packages/ui-extension/src/settings/settings-schema.ts
- **Files**: apps/shared/src/i18n/shared.ts
- depends_on: [S1, S2]
- **Gate**: `bun run test`
- **Status**: pending
- **Acceptance**:
  - Renderer copy is injected for every supported language and interactive controls expose labels, descriptions, focus states and reduced-motion behaviour.
  - Save/reset use a request/ack protocol; success is rendered only after `settingsSaved`, failures after `settingsError`, and submit is disabled while pending.

### S4 — Web and VS Code persistence adapters
- **Files**: apps/web/src/components/Config.astro
- **Files**: extensions/vscode/src/commands/open-settings.ts
- **Files**: extensions/vscode/src/i18n/strings.ts
- depends_on: [S3]
- **Gate**: `bun run test`
- **Status**: pending
- **Files**: extensions/vscode/src/dev/settings-panel.ts
- **Files**: extensions/vscode/src/dev/pages/settings.ts
- **Files**: extensions/vscode/src/dev/entry.ts
- **Acceptance**:
  - VS Code host settings round-trip through workspace configuration or the adapter that actually owns each value; web preferences use their web adapter.
  - Project `mcp-vertex.config.json` is not shadowed by the extension-global settings blob.
  - Host sends explicit saved/error acknowledgements and preserves the last valid value on failure.
  - Navigation owns cancellation/generation state so delayed install/status work cannot repaint an unmounted view; e2e covers install→dashboard.

## Acceptance

- Grafo de paquetes acíclico y typechecks aislados verdes.
- Un contrato de settings y temas compartido con adapters por host.
- Toda copy del renderer recibe i18n y pasa checks de accesibilidad/visual.
