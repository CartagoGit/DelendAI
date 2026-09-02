---
id: d00415
title: "Document pre-existing test failures in apps-ide (header-bar + settings i18n)"
kind: docs
status: ready
type: proposal
track: general
date: 2026-08-31
---

# d00415 — Document pre-existing test failures in apps-ide (header-bar + settings i18n)

## Goal

Catalogue the three test failures that block `bun run validate` on `origin/develop`,
along with the related `apps/web check:i18n` gap, so a future slice can fix them
without rediscovering the diagnosis. None of these failures are regressions introduced
by recent commits: they reproduce on `origin/develop` without any working-tree
changes (`git status -sb` → `## HEAD (no branch)` against `9ddd7d038`).

## why

`bun run validate` exits non-zero because of these three failures, which means the
current release cut cannot be promoted to a tag without first addressing them. The
failures are unrelated to the actual scope of the release (token-budget fixture,
catalog measurement) and should therefore be tracked under a separate finding so the
release can proceed.

## non-goals

- Fixing the three failures or the i18n gap. That is left for follow-up slices once
  scope and ownership are confirmed.
- Re-baselining the affected specs (`biome-baseline`, `type-naming`, etc.) to make
  them pass — that would mask the actual regression in `header-bar` / `render-settings`.
- Touching the catalog measurement fixture or
  `tools/scripts/measure/catalog-task-context-cost.ts`.

## Slices

- global_gate: none

### S1 — Catalogue and triage (this proposal)
- **Status**: done
- **Files**:
  - `docs/mcp-vertex/proposals/ready/docs/d00415-document-pre-existing-test-failures-in-apps-ide-header-bar-settings-i18n.md`
- **Gate**: none

### S2 — Follow-up: fix F1 + F2 (header-bar renderer + spec)
- **Status**: retired
- **Files**:
  - `packages/ui-extension/src/components/header-bar.ts`
  - `packages/ui-extension/tests/components/header-bar.spec.ts`
- **Gate**: `bunx vitest run packages/ui-extension/tests/components/header-bar.spec.ts`

### S3 — Follow-up: fix F3 + i18n gap (settings copy + l10n dicts)
- **Status**: retired
- **Files**:
  - `apps/shared/src/i18n/shared.ts`
  - `apps/shared/src/i18n/langs/{en,es,...}.ts`
  - `packages/ui-extension/src/settings/render-settings.ts`
  - `packages/ui-extension/tests/settings/render-settings.spec.ts`
  - `apps/web/scripts/check-i18n.ts`
- **Gate**: `bun run --cwd apps/web check:i18n` and
  `bunx vitest run packages/ui-extension/tests/settings/render-settings.spec.ts`.

## acceptance

- [x] The three failures and the i18n gap are listed above with concrete file/line references.
- [x] Reproduction commands are pinned to `origin/develop`.
- [x] The diagnosis is preserved on disk so a future slice does not have to redo the investigation.
- [x] S2 + S3 no longer need separate follow-up proposals: verified 2026-09-02 that all three
      failures and the i18n gap no longer reproduce on `develop` (see closing note); the doc-only
      catalogue is the full remaining scope of this proposal.

## Closing note (2026-09-02)

Re-ran the exact reproduction from this proposal on current `develop`:

```
VITE_CONFIG_NATIVE_IGNORE_WARNING=true bunx vitest run \
  tests/components/header-bar.spec.ts tests/settings/render-settings.spec.ts \
  --reporter=verbose --maxWorkers=1
```

Result: **9 passed | 0 failed** (was 3 failed | 6 passed when this proposal was written).
`bun run --cwd apps/web check:i18n` also now reports complete coverage (was reporting missing
Spanish keys). `packages/ui-extension/src/components/header-bar.ts` was touched incidentally by
`f00395` slice S3 (commit `9d6c16704`, 2026-08-31), which appears to have fixed F1/F2 as a side
effect of unrelated dashboard-branding work; the i18n dictionaries were completed by a separate,
untracked commit around the same window. No S2/S3 follow-up proposal is needed — there is nothing
left to fix. Retiring S2/S3 in place rather than opening dead proposals for already-fixed bugs.

## Notes

### Pre-existing failures (reproduce on `origin/develop`)

Run from `packages/ui-extension`:

```bash
VITE_CONFIG_NATIVE_IGNORE_WARNING=true bunx vitest run \
  tests/components/header-bar.spec.ts \
  tests/settings/render-settings.spec.ts \
  --reporter=verbose --maxWorkers=1
```

Result: **3 failed | 6 passed**.

### F1 — `header-bar > returns a <header class="mcpv-header">`

- **Test**: `tests/components/header-bar.spec.ts:11` —
  `expect(html).toMatch(/<header class="mcpv-header">/)`.
- **Actual**: `header-bar.ts:58` always concatenates `data-connection="ok"` (or
  `"lost"`), so the opening tag becomes
  `<header class="mcpv-header" data-connection="ok">` and the regex does not match.
- **Fix hint**: drop `data-connection` when the caller did not opt in to a
  connection state, or update the regex to be tolerant of trailing attributes.

### F2 — `header-bar > includes an inline brand SVG with the MV gradient`

- **Test**: `tests/components/header-bar.spec.ts:22` —
  `expect(html).toContain('--mcpv-brand-blue')` and `--mcpv-brand-purple`.
- **Actual**: `header-bar.ts:31` interpolates `${BRAND_HEX_BLUE}` / `${BRAND_HEX_PURPLE}`
  hex literals into `stop-color`, so the emitted SVG references `#58a6ff` /
  `#a371f7`, not CSS custom properties.
- **Fix hint**: stop emitting the gradient `<defs>` in the inline SVG and rely on
  `var(--mcpv-brand-blue)` / `var(--mcpv-brand-purple)` defined at the host root,
  matching how every other panel paints the brand mark.

### F3 — `settings > resolves complete settings copy for every supported language`

- **Test**: `tests/settings/render-settings.spec.ts:104` —
  `expect(html).not.toContain('settings.')` for every entry in `dictsByLang`.
- **Actual**: `apps/shared/src/i18n/shared.ts:163` (`settingsTranslations`) calls
  `t(dict, ['extension', 'settings.<key>'])` and `t(...)` returns the raw path
  when a key is missing. Several `extension.settings.*` keys are absent in the
  English dictionary (and therefore absent in every other language that falls
  back via `withExtensionFallback`), so the rendered HTML leaks unresolved
  dotted keys like `extension.settings.docsUrlDescription`.
- **Fix hint**: either populate the missing English keys (the contract mismatch
  is between `docsUrlDescription` and the existing `docsUrlHelp`), or make
  `settingsTranslations` raise / substitute a clearly-marked fallback instead
  of returning the dotted key.

### Related i18n gap (`apps/web check:i18n`)

Running the i18n lint step on `origin/develop` reports:

```
✗ authored extension i18n incomplete for Spanish:
  untranslated: status.pluginsLabel, tabLogs, settings.section.workspace
```

This is a separate (but adjacent) gap: the authored extension copy — managed
under `apps/shared/src/i18n/langs/<lang>.ts` — is missing translations for
several keys that the extension surfaces in its status bar, logs tab, and
settings sections. The same dictionary files are involved in F3, so a single
l10n slice can clear both.
