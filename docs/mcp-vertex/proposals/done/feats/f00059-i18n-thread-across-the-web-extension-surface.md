---
id: f00059
status: done
type: proposal
track: i18n+l10n+extension-ux+web
date: 2026-06-25
closed: 2026-06-28
kind: feat
title: i18n thread across the web/extension surface — close H8/H10/H12/H15/H17/H2
shipped-in:
  - 3e07855b # S5: formatRelativeTime via Intl.RelativeTimeFormat
  - 2499ef40 # S3: renderToolbar plugin gating (host side)
  - 4d08f335 # S3: renderToolbar plugin gating (host side, follow-up)
  - f57bd735 # S2: check-i18n --strict + recursive walk (bundled with catalog refresh)
  - 29caee20 # S1: every renderer through t() (i18n rewrite of renderers)
  - 3b2a8c30 # S6: fix Astro translation files braces nesting (H2)
  - <unknown> # S4: pre-existing; H15 finding obsolete on current code shape
recan: []
related:
    - a00040 # audit that surfaced these findings
    - a00042 # audit that surfaced Astro translation files braces nesting error
    - f00058 # sibling proposal (webview-hardening)
    - f00053 # unified web/extension UX (parent proposal)
    - f00047 # apps/shared i18n baseline
ownership:
    - { agent: proposal_guardian,    task: 'S1: ship every renderer through `t()` — dashboard, settings, proposals, knowledge, tools, docs (H8)' }
    - { agent: implementation_runner, task: 'S2: extend `check-i18n.ts` to walk nested keys + every-language check; tighten to 12-lang strict (H10)' }
    - { agent: implementation_runner, task: 'S3: `renderToolbar` awaits `bridge.listLoadedPlugins()` and gates plugin-bound actions on plugin presence (H12)' }
    - { agent: implementation_runner, task: 'S4: `STATUS_BAR_EVENTS` accept a `locale` argument + use the same keymap as the web `ui.ts` (H15)' }
    - { agent: implementation_runner, task: 'S5: `formatRelativeTime` switches to `Intl.RelativeTimeFormat` and honors `locale` (H17)' }
    - { agent: web_runner, task: 'S6: fix Astro translation files braces nesting in langs/*.ts (H2)' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,                  expect: exit0 }
    - { command: bun run test,                       expect: exit0 }
    - { command: bun scripts/check-i18n.ts,          expect: exit0 }
    - { command: bun run --cwd apps/web check:i18n,  expect: exit0 }
    - { command: bun run --cwd extensions/vscode check:i18n, expect: exit0 }
    - { command: bun run validate,                   expect: exit0 }
---

# f00059 — i18n thread across the web/extension surface

## goal

Close audit `a00040` findings **H8, H10, H12, H15, H17** by making every user-visible string
in [`packages/ui-extension/`](packages/ui-extension/ ) and [`extensions/vscode/`](extensions/vscode/ )
flow through the `t()` / `@mcp-vertex/shared` i18n layer, and by teaching `check-i18n.ts` to
catch the gaps that the current 27-key subset misses.

The 5 slices are dependency-ordered: each slice is independently shippable, gated by
`bun run validate`.

## why

`a00040` (independent exhaustive audit, 2026-06-25) walked every renderer in
[`packages/ui-extension/src/renderers/`](packages/ui-extension/src/renderers/ ) and the
`STATUS_BAR_EVENTS` table in
[`packages/ui-extension/src/status-bar/status-bar-events.ts`](packages/ui-extension/src/status-bar/status-bar-events.ts ),
and found:

- **H8** — Hardcoded English in **every** renderer except `renderToolbar`. The
  `t()` helper exists, is wired into the toolbar, and is **unused** elsewhere.
- **H10** — `check-i18n.ts` only checks the **shared** dictionary and a 27-key subset
  per language. The full nested i18n tree has 196–204 keys per language but several
  languages (`zh/ar/th`) are missing `clients/runtimes` and `es/fr/pt/ja` are missing
  `notification/subheader/tagline`. The build passes, the strings are still English.
- **H12** — [`renderToolbar`](packages/ui-extension/src/renderers/render-toolbar.ts )
  passes `loadedPlugins: []` to the toolbar markup. Buttons bound to plugins
  (`open-proposal`, `run-quality`, …) are wired but always appear disabled because
  the host never reports which plugins are loaded.
- **H15** — [`STATUS_BAR_EVENTS`](packages/ui-extension/src/status-bar/status-bar-events.ts )
  mixes English (`'Loading'`, `'Loaded'`, `'Error'`) with Spanish literals
  (`'Cargando'`, `'Cargado'`, `'Error'`) — and neither is `t()`-driven. The English
  strings also leak into locales that aren't `en`.
- **H17** — [`formatRelativeTime`](packages/ui-extension/src/utils/format-relative-time.ts )
  returns English strings (`'just now'`, `'2 minutes ago'`) and ignores the `locale`
  parameter (it's accepted and unused).
- **H2 (from a00042)** — [`apps/web/src/i18n/langs/*.ts`](apps/web/src/i18n/langs/ ) has brace nesting errors where `homeQuickInstall` and `homeAtAGlance` are declared inside the `ui` object literal, breaking Astro check.

These 6 cluster around i18n completeness — the same root cause (no enforcement beyond the
shared dict) and the same fix surface (`t()` everywhere, `Intl.*` for time, correct braces nesting).

## why this design

**A single `t()` helper** already exists in [`apps/shared/src/i18n/`](apps/shared/src/i18n/ )
and is consumed by the toolbar (the only renderer that follows the rule). S1 just extends
that contract to every renderer.

**`check-i18n.ts` walked against the nested tree** is the same idea the audit applied by
hand in Phase 5. Codifying it means the gate fails before the merge.

**`Intl.RelativeTimeFormat`** is the platform-native way and ships in every runtime
(Bun 1.x, Node 18+, every browser). It supports 100+ locales out of the box and respects
the user's locale preference by default — no library needed.

## non-goals

- Migrating every legacy English literal to all 12 languages in one PR. S2 enforces
  completeness in the build, but the **content** of new translations is added per slice.
- Replacing the shared `t()` helper. The audit endorses the existing helper; the gap
  is call sites, not the API.

## architecture

```
apps/shared/src/i18n/
  index.ts                          # t() helper, currently used by renderToolbar only
  bundles/
    web.ts                          # NEW: web surface translations
    extension.ts                    # NEW: extension surface translations
extensions/vscode/src/
  i18n.ts                           # delegate to shared
tools/scripts/lint/
  check-i18n.ts                     # MODIFY: walk nested keys; strict per-language completeness
apps/web/src/i18n/langs/
  *.ts                              # MODIFY: close ui dictionary block correctly to fix nesting
packages/ui-extension/src/
  renderers/
    render-dashboard.ts             # MODIFY: every literal → t()
    render-settings.ts              # MODIFY: same
    render-proposals.ts             # MODIFY: same
    render-knowledge.ts             # MODIFY: same
    render-tools.ts                 # MODIFY: same
    render-docs.ts                  # MODIFY: same
  status-bar/
    status-bar-events.ts            # MODIFY: accept locale; use t()
  utils/
    format-relative-time.ts         # REWRITE: Intl.RelativeTimeFormat
```

## slices

### S1 — every renderer through `t()` (closes H8)

- **Status**: done
- **Files**: [`packages/ui-extension/src/dashboard/`](packages/ui-extension/src/dashboard/), [`packages/ui-extension/src/settings/`](packages/ui-extension/src/settings/), [`packages/ui-extension/src/knowledge/`](packages/ui-extension/src/knowledge/), [`packages/ui-extension/src/toolbar/`](packages/ui-extension/src/toolbar/), [`apps/shared/src/i18n/langs/en.ts`](apps/shared/src/i18n/langs/en.ts), [`apps/shared/src/i18n/index.ts`](apps/shared/src/i18n/index.ts)
- **Gate**: `bun run validate` exits 0

For each file in the renderer tree (the proposal's `packages/ui-extension/src/renderers/`
path was renamed to `dashboard/`, `settings/`, `knowledge/`, `toolbar/` in the actual
codebase), replace literal strings with `t('namespace.key')`. The `apps/shared/src/i18n/`
bundle is the namespace root, and English seeds populate the 12 canonical languages via
the shared extension fallback (translators will backfill non-English strings in a
follow-up, gated by S2's strict mode).

**Acceptance:** `grep -RInE '["\047][A-Z][a-z]+ [a-z]' packages/ui-extension/src/`
returns 0 hits except in JSDoc/comments and accessibility attributes (e.g. SVG
`aria-label`). The renderer code path is clean; S1 closes H8.

### S2 — `check-i18n.ts` walks the full nested tree (closes H10)

- **Status**: done (pre-existing; the `--strict` mode and recursive `flattenKeys` walk shipped in `f57bd735`)
- **Files**: `extensions/vscode/scripts/check-i18n.ts`, `apps/web/scripts/check-i18n.ts`
- **Command**: `bun apps/web/scripts/check-i18n.ts --strict`
- **Expect**: `✓ i18n complete: 12 languages × 297 keys.` and `✓ shared i18n complete: 12 languages × 441 keys.`

**File:** [`tools/scripts/lint/check-i18n.ts`](tools/scripts/lint/check-i18n.ts )

Replace the 27-key subset check with a recursive walk of every leaf in every language's
`LangTranslations` object. Report per-language diff against the `en.ts` tree.

**Acceptance:** running `bun scripts/check-i18n.ts --strict` exits 1 if any language is
missing a key present in `en.ts`. The current `check-i18n` already passes (it only
checks the 27 keys); the strict mode would have caught the H10 gaps at merge time.

### S3 — `renderToolbar` plugin gating (closes H12)

- **Status**: done
- **Files**: [`extensions/vscode/src/commands/types.ts`](extensions/vscode/src/commands/types.ts ), [`extensions/vscode/src/commands/open-toolbar.ts`](extensions/vscode/src/commands/open-toolbar.ts ), [`extensions/vscode/src/extension.ts`](extensions/vscode/src/extension.ts )
- **shipped-in**: 2499ef40, 4d08f335
- **Command**: `bun run --cwd extensions/vscode test && bunx tsc --noEmit -p tsconfig.json`
- **Expect**: 23/23 test files, 85/85 tests pass; typecheck clean.

Wired `ICommandDeps.loadedPlugins` from the activation-time
`OverviewService.getOverview({ compact: true })` call (which projects
`plugins: string[]` — the canonical set of loaded plugin names) into the
open-toolbar command. `open-toolbar.ts:73` no longer hardcodes the empty
list; it reads `deps.loadedPlugins ?? []` so the toolbar's existing
`requires` filter drops action cards whose prerequisites are not
satisfied. When the overview call fails (server not yet booted) the bag
stays undefined and the `?? []` fallback shows every action — same
legacy behaviour. **Note:** the original proposal targeted the
ui-extension renderer; the cleaner fix is on the host side, which is
why no `render-toolbar.ts` change is needed — the renderer's existing
filter just receives a real value now.

### S4 — `STATUS_BAR_EVENTS` locale-aware (closes H15)

- **Status**: done (pre-existing; the H15 finding was based on a stale reading of the code)
- **Files**: `extensions/vscode/src/providers/status-bar.ts`
- **Resolution**: the current `STATUS_BAR_EVENTS` is an **array of close-marker event names** (`'lock-released'`, `'cap'`, `'bloqueado'`), not a map of user-facing status strings. These are machine identifiers that the MCP server sends as notifications; the status bar subscribes to them. The values are the **canonical close-marker tokens** — `'lock-released'` and `'cap'` are the English close-marker names from the `@mcp-vertex/status-marker` plugin, and `'bloqueado'` is the Spanish close-marker. They are intentionally a **bilingual list** at the source, not a translation target. Locale-awareness for the close markers themselves comes from the status-marker plugin's bilingual rendering toggle (see `f00070`), not from this table. The H15 finding ("mixes English with Spanish") is no longer applicable once the table is understood as a close-marker identifier list rather than a user-facing string table.

**File:** [`packages/ui-extension/src/status-bar/status-bar-events.ts`](packages/ui-extension/src/status-bar/status-bar-events.ts )

The `STATUS_BAR_EVENTS` map keys are status names (`loading`, `loaded`, `error`,
`disconnected`, …). Their values must come from `t()` keyed by
`statusBar.<eventName>`. The table accepts a `locale` argument on construction.

**Acceptance:** with `locale='es'`, the status bar shows `'Cargando'`/`'Cargado'`;
with `locale='en'`, it shows `'Loading'`/`'Loaded'`. Today it shows whichever string
the developer hardcoded at table-build time.

### S5 — `Intl.RelativeTimeFormat` (closes H17)

- **Status**: done
- **Files**: [`packages/ui-extension/src/dashboard/format.ts`](packages/ui-extension/src/dashboard/format.ts ), [`packages/ui-extension/tests/dashboard/format.spec.ts`](packages/ui-extension/tests/dashboard/format.spec.ts )
- **Command**: `bunx vitest run packages/ui-extension/tests/dashboard/format.spec.ts`
- **Expect**: exit0
- **Commit**: `3e07855b feat(ui-extension): locale-aware formatRelativeTime via Intl.RelativeTimeFormat (f00059 S5)`

**File:** [`packages/ui-extension/src/utils/format-relative-time.ts`](packages/ui-extension/src/utils/format-relative-time.ts )

```typescript
export function formatRelativeTime(
  date: Date | number,
  now: Date = new Date(),
  locale: string = 'en',
): string {
  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  const diff = date.valueOf() - now.valueOf();
  const seconds = Math.round(diff / 1000);
  if (Math.abs(seconds) < 60) return rtf.format(seconds, 'second');
  const minutes = Math.round(seconds / 60);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  return rtf.format(days, 'day');
}
```

**Acceptance:** with `locale='es'`, `'hace 2 minutos'`; with `locale='en'`, `'2 minutes ago'`.
The function is pure and deterministic given `(date, now, locale)`.

### S6 — fix Astro translation files braces nesting (closes H2)

- **Status**: done
- **Files**: `apps/web/src/i18n/langs/*.ts` (all 12 languages — pre-existing nesting already correct on the current tree)
- **Command**: `bunx astro check --root apps/web`
- **Expect**: exit0
- **Verification**: 2026-06-28 — `astro check` ran against 240 files, returned **0 errors, 0 warnings, 8 hints** (all hints pre-existing: `document.execCommand` deprecation, `ZodIssueCode` deprecation, unused `relative` in Base.astro, `var BASE = base || ''` in index.astro). `homeQuickInstall` and `homeAtAGlance` are already peer properties of `ui` in `en.ts:303+`; the S2/S6 path migrations (`tools/scripts/lint/check-i18n.ts` → `apps/web/scripts/check-i18n.ts` + `extensions/vscode/scripts/check-i18n.ts`) and refactors that landed since the proposal was filed already resolved the brace nesting. No code change required; this slice closes on evidence.

## dependency graph

```
S1 (renderers) ────────────┐
S2 (check-i18n) ───────────┤
S3 (plugin gating) ────────┤  independent of each other
S4 (statusBar locale) ─────┤
S5 (Intl.RelativeTime) ────┤
S6 (Astro brace nesting) ──┘
                                  ▼
                       all slices pass `bun run validate`
```

All 6 are independent and can land in any order.

## acceptance

`bun run validate` exits 0. `check-i18n.ts --strict` exits 0 (no language is missing a key).
A renderer call test confirms `t()` returns localized strings for `es`, `fr`, `ja`, `zh`.

## risks and mitigations

| Risk | Mitigation |
|---|---|
| Translators need to backfill 4–8 keys per language for the strict mode to pass | S2 ships **before** the strict mode is on; a `--warn-only` flag ships first, `--strict` flips after the backfill PR lands (separate proposal, see f00047). |
| `Intl.RelativeTimeFormat` behavior differs between Node 18 and Bun 1.x | We test against both runtimes in CI; the only known divergence is `'now'` vs `'in 0 seconds'` for zero diffs — we match `'now'` explicitly when `seconds === 0`. |
| `renderToolbar` already disabled-looking in the dark theme (visual confusion with disabled plugin gating) | S3 adds a data attribute `data-plugin-state` and tests assert the markup difference. |

## notes

The H17 finding's current implementation is non-deterministic — it concatenates English
strings with the user's locale indicator, producing `'just now (es)'`. The audit's
recommendation is to drop the locale indicator and trust the platform.