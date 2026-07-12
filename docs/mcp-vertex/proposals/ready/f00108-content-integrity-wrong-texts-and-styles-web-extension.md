---
id: f00108
kind: feat
status: ready
type: proposal
track: web+extensions/vscode+ui-extension+i18n+lint
date: 2026-07-08
title: "Content integrity — fix wrong/missing texts + styles across web + extension, and ratchet it"
shipped-in: []
recan: []
related:
    - f00099 # style-integrity ratchet — this is its text sibling
    - f00102 # shared-ui source of truth — the shared components whose copy this audits
    - f00103 # mcpv rename + dev-mode — the surfaces this sweeps
    - c00002 # npm publish gate — user requires 100% correct visuals + copy before publishing
ownership:
    - { agent: implementation_runner, task: 'S1: audit + fix wrong/missing/hardcoded text across web + extension' }
    - { agent: implementation_runner, task: 'S2: audit + fix style regressions across web + extension' }
    - { agent: implementation_runner, task: 'S3: lint:content-integrity ratchet (hardcoded-string + i18n-usage)' }
globalGate: validate
acceptance:
    - { command: bun run validate, expect: exit0 }
    - { command: bun run site, expect: exit0 }
---

# f00108 — Content integrity: wrong texts + styles, fixed and ratcheted

## goal

Get the user-facing copy and visuals to 100%: fix every wrong, missing,
mistranslated, or hardcoded string and every broken/mismatched style across
the web and the extension, then add a ratchet so text regressions are as
impossible as style regressions already are (f00099). The user reports
"estilos y textos … no son correctos en muchos lugares" — this makes that a
tracked, gated workstream, not a whack-a-mole.

## why

The gates today only check **completeness**, never **correctness**:

- `check:i18n` (`apps/web/scripts/check-i18n.ts`, and the extension's twin)
  asserts every key exists in all 12 languages — but a key can be present,
  wrong, a stale copy of English, or the wrong string for its slot, and pass.
- There is **no hardcoded-string lint**: a component that hardcodes
  `'Refresh'` instead of `text('refresh')` ships silently (grep of
  `tools/scripts/lint/` finds only `cli-i18n` for CLI summaries — nothing for
  the web/extension render layer). f00099 gave styles a markup↔scss ratchet;
  text has no equivalent.
- After the f00102 shared-UI extraction and the f00103 mcpv rename, some copy
  and styles were touched mechanically; a human-visible correctness pass has
  not been done end-to-end.

Net: the product can render complete-but-wrong copy and subtly-off styling
and every gate stays green. For an npm-perfection bar, that is the gap.

## non-goals

- **No redesign / no new copy voice** — fix what is wrong to match the
  established voice + design; do not restyle working surfaces.
- **No new i18n framework** — the 12-lang `byLang` + `ILangDict` shape stays.
- **No overlap with f00099** (styles-defined-but-unused) — this is the
  correctness sibling (used-but-wrong / used-but-hardcoded).

## Slices

- global_gate: validate

### S1 — Audit + fix wrong/missing/hardcoded text

- **Status**: pending
- **Files**: `apps/web/src/**`, `packages/ui-extension/src/**`, `extensions/vscode/src/**` (coordinate — concurrent agents hold parts of web/extension; sequence after they land)
- **Gate**: bun run site
- **Acceptance**:
  - "Sweep every render surface for: (a) hardcoded user-facing strings that should go through `text()`/`byLang`; (b) keys present but stale-English in a non-English dict; (c) strings placed in the wrong slot (label/aria/title mismatches). Each is fixed; a short report lists every change by file:line and category."
  - "Spot-check the fixed routes render the correct copy in en + es (the two fully-authored locales); `bun run site` green."

### S2 — Audit + fix style regressions

- **Status**: pending
- **Files**: `apps/web/src/styles/**`, `apps/shared/src/styles/**`, `packages/ui-extension/src/**`, `extensions/vscode/src/**`
- **Gate**: bun run site
- **Acceptance**:
  - "Visual audit of the web + extension surfaces for broken/mismatched styles (post f00102/f00103): wrong tokens, missing responsive rules, mcpv-* rename fallout, shared-vs-local class collisions. Each fixed to match the design; the f00099 style-integrity + f00102 shared-ui ratchets stay green."
  - "Real `bun run site` + a build of the extension dev preview (f00103 dev-mode) render the affected surfaces correctly."

### S3 — lint:content-integrity ratchet

- **Status**: pending
- **Files**: `tools/scripts/lint/content-integrity.script.ts`, `tools/scripts/lint/content-integrity.waivers.json`, `tools/scripts/lint/content-integrity.script.spec.ts`, `package.json`
- **Depends on**: S1
- **Gate**: bun run lint:proposals
- **Acceptance**:
  - "A lint that flags hardcoded user-facing strings in `.astro`/render `.ts` (string literals in visible-text positions — `>{...}<` text nodes, `title=`/`aria-label=`/`alt=` attrs — not going through a `text()`/`byLang`/`dict` accessor), with a documented waivers file for legitimate literals (brand names, code samples, single symbols). Follows the f00099 style-integrity script shape."
  - "Optional correctness heuristic: flag non-English dict entries byte-identical to English beyond a small allowlist (likely untranslated) as WARN, not fail. Wired into `bun run validate` after lint:style-integrity; repo passes with the initial waivers."

## acceptance

- `bun run validate` → exit 0 (including lint:content-integrity once S3 lands).
- `bun run site` → exit 0.
- No hardcoded user-facing string, no stale-English non-English entry, and no
  broken style survives on a user-facing surface without a documented waiver.
