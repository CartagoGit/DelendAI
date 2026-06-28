---
id: f00060
status: in-progress
type: proposal
track: design-tokens+css+extension-ux
date: 2026-06-25
kind: refactor
title: Relocate `--vscode-*` CSS custom properties from webviews into `componentCss` tokens
shipped-in: [c7419269]
recan: []
related:
    - a00040 # audit that surfaced this finding (H9)
    - f00053 # unified web/extension UX (parent proposal)
    - f00058 # sibling proposal (webview-hardening)
ownership:
    - { agent: proposal_guardian,    task: 'S1: define `IComponentCssTokens` interface + migration map in `packages/ui-extension/src/styles/component-css.ts` (H9)' }
    - { agent: implementation_runner, task: 'S2: 2 webviews (dashboard + settings) switch from `--vscode-*` to `componentCss.*` (the `globals.css` injects the right values per host)' }
    - { agent: implementation_runner, task: 'S3: ship a `tokens.spec.ts` snapshot that asserts the contract between `IComponentCssTokens` and the 2 webviews; fail the build on drift' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,  expect: exit0 }
    - { command: bun run test,       expect: exit0 }
    - { command: bun run lint:scss,  expect: exit0 }
    - { command: bun run validate,   expect: exit0 }
---

# f00060 — Relocate webview host CSS into `componentCss` tokens (H9)

## goal

Close audit `a00040` finding **H9** by replacing the two `--vscode-*` CSS custom properties
hardcoded in
[`packages/ui-extension/src/webviews/dashboard/styles.css`](packages/ui-extension/src/webviews/dashboard/styles.css )
and [`packages/ui-extension/src/webviews/settings/styles.css`](packages/ui-extension/src/webviews/settings/styles.css )
with neutral `componentCss.*` tokens injected by `globals.css`.

The 3 slices are dependency-ordered and small (≤ 1 file each).

## why

`a00040` walked every webview's stylesheet and found:

- **H9** — 2 webviews directly reference `--vscode-editor-background` and
  `--vscode-editor-foreground`. The `vscode-*` prefix is a host-specific contract from
  the VS Code theme API; the ui-extension is supposed to be **host-agnostic** (it ships
  to Cursor, Windsurf, JetBrains, and the docs site, none of which provide `--vscode-*`).
  In those hosts, the variables resolve to empty and the panels render transparent.

The fix is the same `componentCss` token system the audit also recommended for the
toolbar (H22, deferred to a sibling proposal): one typed interface, one values map
injected by `globals.css`, host-specific aliases in the host shim.

## why this design

**`IComponentCssTokens` is a typed mirror of the CSS custom properties.** TypeScript
catches the drift the moment a renderer asks for a token that's not declared. The
[`packages/ui-extension/src/styles/`](packages/ui-extension/src/styles/ ) folder already
has the right shape — it just needs the token map.

**Two webviews, one source of truth.** Today each webview ships its own
`styles.css`. After S2, both pull from `globals.css` (which is host-agnostic and ships
in every host).

## non-goals

- Replacing the 6 other webviews. The audit found `--vscode-*` in only 2; the others
  already use the componentCss token system or inline styles.
- Changing the **values** of the tokens (theme palettes, dark/light). We only relocate
  the **names**.

## architecture

```
packages/ui-extension/src/styles/
  component-css.ts            # NEW: IComponentCssTokens + DEFAULT_TOKENS
  globals.css                 # MODIFY: declare :root { --mv-* } from component-css.ts
  webviews/
    dashboard/
      styles.css              # MODIFY: --vscode-editor-background → var(--mv-bg-primary)
    settings/
      styles.css              # MODIFY: same
extensions/vscode/src/webview/
  shim.ts                     # MODIFY: bridge --vscode-editor-background → --mv-bg-primary
apps/web/src/styles/globals.css # MODIFY: same bridge for the docs site (which already ships neutral tokens)
```

## slices

### S1 — `IComponentCssTokens` interface + DEFAULT_TOKENS

**File:** [`packages/ui-extension/src/styles/component-css.ts`](packages/ui-extension/src/styles/component-css.ts ) (NEW)

```typescript
export interface IComponentCssTokens {
  readonly 'bg-primary': string;
  readonly 'bg-secondary': string;
  readonly 'fg-primary': string;
  readonly 'fg-secondary': string;
  readonly 'border-primary': string;
  readonly 'accent': string;
}

export const DEFAULT_TOKENS: IComponentCssTokens = Object.freeze({
  'bg-primary': '#1e1e1e',
  'bg-secondary': '#252526',
  'fg-primary': '#d4d4d4',
  'fg-secondary': '#858585',
  'border-primary': '#3c3c3c',
  'accent': '#007acc',
});
```

The values match the VS Code dark-theme defaults so the migration is a no-op for VS Code
hosts; non-VS Code hosts override in their `globals.css`.

### S2 — dashboard + settings switch to `componentCss` tokens

**File:** [`packages/ui-extension/src/webviews/dashboard/styles.css`](packages/ui-extension/src/webviews/dashboard/styles.css )

```css
.dashboard {
  background: var(--mv-bg-primary);
  color: var(--mv-fg-primary);
  border: 1px solid var(--mv-border-primary);
}
```

(Same diff for [`settings/styles.css`](packages/ui-extension/src/webviews/settings/styles.css ).)

### S3 — `tokens.spec.ts` snapshot

**File:** [`packages/ui-extension/src/styles/component-css.spec.ts`](packages/ui-extension/src/styles/component-css.spec.ts ) (NEW)

Vitest snapshot test that serializes the `DEFAULT_TOKENS` and asserts the CSS in
`globals.css` declares a matching `--mv-*` for every token. Fails if a renderer
references a token that isn't declared.

## dependency graph

```
S1 (tokens) → S2 (webviews) → S3 (snapshot)
```

## acceptance

`bun run validate` exits 0. `tokens.spec.ts` exits 0. A grep for `--vscode-` inside
`packages/ui-extension/src/webviews/` returns 0 hits.

## risks and mitigations

| Risk | Mitigation |
|---|---|
| VS Code theme switcher overrides our tokens | The shim in `extensions/vscode/src/webview/shim.ts` reads the live theme via `vscode.window.activeColorTheme` and rewrites `--mv-*` at boot. The audit didn't require live theme sync (the existing webviews don't have it either). |
| Cursor / Windsurf hosts use a different accent color | Each host ships its own `globals.css` override; `DEFAULT_TOKENS` is the fallback. |

## notes

The audit also flagged H22 (`render-panel-tools.ts` sparkline is a constant value, not a
trend) and H24 (`barChart` no aria-label). Those are deferred to the dashboard refactor
proposal (f00061).