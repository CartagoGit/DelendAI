---
id: x00196
title: "a00084 fixes — vscode start-server sync I/O + apps/web Base.astro NAV/FOOTER dedup"
kind: fix
status: done
type: proposal
track: a00084-audit-followup
date: 2026-07-30
shipped-in:
    - 51265bfd # fix(x00196): a00084 — vscode start-server sync I/O + apps/web NAV/FOOTER dedup
---

# x00196 — a00084 fixes — vscode start-server sync I/O + apps/web Base.astro NAV/FOOTER dedup

## Goal

Fix 2 findings from a00084:

- **#28** `extensions/vscode/src/commands/start-server-untrusted.ts` — `readMcpJsonRaw` used `readFileSync` on the interactive untrusted-server-approval path (sync I/O, brief UI freeze on remote filesystems like WSL/SSH). Switched to `fs/promises.readFile`.
- **#33** `apps/web/src/layouts/Base.astro` — the client-side view-transition chrome-refresh script hand-duplicated a complete 12-language NAV/FOOTER copy table as a literal object, separate from the canonical `dictsByLang` every other page uses. Any future copy edit to the canonical dict would silently never propagate to this runtime table. Now generated at build time from `dictsByLang` and handed to the client via `define:vars`.

Fixing #33 surfaced and fixed a genuine, additional, real i18n bug as a side effect: the old hand-duplicated table's `home` field used a literal "Home"/"Início"/etc. translation, but `SiteNav.astro`'s own server-rendered nav link for that same `data-nav-key="home"` element actually uses `t.nav.concept`'s value (e.g. "Concept"/"Concepto"). The client-side refresh script would show the WRONG text for the home nav link after every view transition. Verified via a real `astro build`: the SSR-rendered page and the build-time-generated runtime table now both say "Concepto" for Spanish (previously the runtime table would have overwritten it back to "Inicio" on the next transition).

## why

#28 is a rule-3 violation on an interactive path. #33 is a genuine drift risk (confirmed to have ALREADY drifted — the home-link mismatch) plus general dedup value: 12 languages × ~19 fields hand-typed as literals is exactly the kind of thing that silently rots.

## non-goals

- Refactoring the OTHER inline scripts in Base.astro (theme/motion restore, href rewiring) - only the NAV/FOOTER table had a real canonical-source duplication to fix

## Slices

- global_gate: none

### S1 — vscode start-server: async .mcp.json read
- **Status**: done
- **Files**: `extensions/vscode/src/commands/start-server-untrusted.ts`
- **Gate**: type
- acceptance:
  - "readMcpJsonRaw uses fs/promises.readFile, not readFileSync"
  - "bun test extensions/vscode passes (224/225, 1 pre-existing unrelated vi.stubGlobal failure)"

### S2 — Base.astro: generate NAV_BY_LANG/FOOTER_BY_LANG from dictsByLang
- **Status**: done
- **Files**: `apps/web/src/layouts/Base.astro`
- **Gate**: e2e
- acceptance:
  - "The 12-language hand-duplicated literal is removed; NAV_BY_LANG/FOOTER_BY_LANG are derived from dictsByLang at build time and passed to a dedicated plain-JS script via define:vars (split from the TS-typed script above it, since define:vars demotes the whole script it's on to is:inline)"
  - "bun run lint:web (astro check) exits 0 with 0 errors"
  - "Real astro build verified: es.home reads 'Concepto' in both the SSR-rendered nav link and the generated runtime table (previously the hand-typed table said 'Inicio', a real mismatch)"
  - "bun test apps/web passes (179/179); style-integrity + content-integrity + check:i18n all clean"

## acceptance

- readMcpJsonRaw uses fs/promises.readFile, not readFileSync
- bun test extensions/vscode passes (224/225, 1 pre-existing unrelated vi.stubGlobal failure)
- The 12-language hand-duplicated literal is removed; NAV_BY_LANG/FOOTER_BY_LANG are derived from dictsByLang at build time and passed to a dedicated plain-JS script via define:vars (split from the TS-typed script above it, since define:vars demotes the whole script it's on to is:inline)
- bun run lint:web (astro check) exits 0 with 0 errors
- Real astro build verified: es.home reads 'Concepto' in both the SSR-rendered nav link and the generated runtime table (previously the hand-typed table said 'Inicio', a real mismatch)
- bun test apps/web passes (179/179); style-integrity + content-integrity + check:i18n all clean
