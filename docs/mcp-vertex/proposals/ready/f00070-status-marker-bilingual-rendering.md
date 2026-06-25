---
id: f00070
status: ready
type: proposal
track: i18n+l10n+plugins/status-marker+token-budget
date: 2026-06-26
kind: feat
title: status-marker bilingual rendering — keep state ES, render the closing line in EN when requested
shipped-in: []
recan: []
related:
    - f00059 # sibling i18n thread across web/extension surface
    - f00063 # locale-aware date/time formatting
ownership:
    - { agent: proposal_guardian,    task: 'S1: extend `MARKERS` with a parallel `MARKERS_EN` map; keep `CloseMarker` type untouched' }
    - { agent: implementation_runner, task: 'S2: `formatCloseMarker(state, reason?, opts?: { locale?: "es"|"en" })` — ES is the default and matches the legacy output bit-for-bit' }
    - { agent: implementation_runner, task: 'S3: thread the locale through `<prefix>_close` and `<prefix>_validate` (output `line` flips; validators stay tolerant — accept both `[HECHO]` and `[DONE]` against the canonical emoji)' }
    - { agent: implementation_runner, task: 'S4: regenerate `tool-outputs.ts` via `bun run types:generate`; add `formatCloseMarker` spec covering 8 states × 2 locales × reason on/off' }
    - { agent: implementation_runner, task: 'S5: update the `mcp-vertex-status-marker-and-closure` skill + `.github/copilot-instructions.md` table with the bilingual mapping; document that the validator tolerates both renderings' }
globalGate: validate
acceptance:
    - { command: bun run typecheck,                                              expect: exit0 }
    - { command: bun run --cwd plugins/status-marker test,                      expect: exit0 }
    - { command: bun run --cwd plugins/status-marker typecheck,                  expect: exit0 }
    - { command: bun run types:generate,                                        expect: exit0 }
    - { command: bun run --cwd plugins/status-marker test --coverage,            expect: 'thresholds met' }
    - { command: bun run validate,                                               expect: exit0 }
---

# f00070 — status-marker bilingual rendering

## goal

Let hosts pick the language used to **render** the close-marker line emitted by
[`<prefix>_close`](plugins/status-marker/src/lib/tools/close-tools.ts ) while keeping
the wire-format state token (`state`) in Spanish. The Spanish rendering remains
the default and is byte-identical to today's output, so this proposal is
backwards-compatible with every existing consumer.

Concretely:

```
formatCloseMarker("HECHO")                            → "🟩 [HECHO]"        // default, unchanged
formatCloseMarker("HECHO", undefined, { locale: "en"}) → "🟩 [DONE]"
formatCloseMarker("BLOQUEADO", "creds missing", { locale: "en" })
                                                       → "🟥 [BLOCKED] — creds missing"
```

The `<prefix>_validate` tool becomes tolerant on the `line` it inspects: it
already looks up state by emoji (via `EMOJI_TO_STATE`); we extend the regex to
accept the rendered bracket in either language, while still requiring the emoji
to match a registered state.

## why

The 8 close-marker state tokens (`HECHO`, `CAP`, `RE-PIVOT`,
`CHECKPOINT-REQUIRED`, `REPAIR-NEEDED`, `BLOQUEADO`, `SIN PROPUESTAS LIBRES`,
`SIN PROPUESTA DE NINGUN TIPO`) are the canonical wire identifiers of the
`status-marker` protocol. Renaming them to English is a **breaking** cross-plugin
change (`feat!:` → major bump) because:

- They are the values of the `state` Zod enum in the `outputSchema`, so any
  generated SDK (`plugins/*/src/generated/tool-outputs.ts`) flips.
- They appear verbatim in durable state: proposal `reason` fields, persisted
  audit logs, and historical PR comments reference the token by string.
- The `MARKERS` table is the single source of truth shared by 16 plugins via
  `@mcp-vertex/core`; renaming it forces every plugin to regenerate.

But the visible **rendering** of those tokens does not need to be Spanish.
Hosts that serve English-speaking audiences (or non-Spanish LLM prompts) want
`🟩 [DONE]` instead of `🟩 [HECHO]`. Today they can't get it without forking
the plugin.

## design

### Mapping table

| State (protocol, ES) | Emoji | EN rendering | Reason required |
|---|---|---|---|
| `HECHO` | 🟩 | `DONE` | no |
| `CAP` | 🟨 | `HANDOFF` | yes |
| `RE-PIVOT` | 🟧 | `REPIVOT` | yes |
| `CHECKPOINT-REQUIRED` | 🟦 | `CHECKPOINT` | yes |
| `REPAIR-NEEDED` | 🟫 | `REPAIR` | yes |
| `BLOQUEADO` | 🟥 | `BLOCKED` | yes |
| `SIN PROPUESTAS LIBRES` | 🟪 | `NO_FREE_PROPOSALS` | no |
| `SIN PROPUESTA DE NINGUN TIPO` | ⬜ | `NO_WORK` | no |

The ES column is what `MARKERS` already declares; the EN column is the new
`MARKERS_EN` map declared next to it.

### API

```ts
// unchanged
export const formatCloseMarker = (
  state: CloseMarker,
  reason?: string,
  opts?: { locale?: 'es' | 'en' },   // NEW; defaults to 'es'
): string;
```

`opts.locale` defaults to `'es'`. Passing `'en'` swaps the rendered token but
keeps the rest of the line — emoji, separator, reason, length cap — identical.

### Validator

`validateCloseMarker` already uses `EMOJI_TO_STATE` to look up the state from
the leading emoji, then it greps `[\w-]+` (or similar) for the bracketed token.
Today the regex is anchored to the ES spelling. We extend it to accept either
the ES or the EN spelling, while keeping the state lookup keyed on the emoji.
A single line that says `🟨 [HANDOFF] — ...` validates as `state: "CAP"`; a line
that says `🟨 [CAP] — ...` also validates as `state: "CAP"`. The host decides
which rendering to emit; the validator accepts both.

### Token-cost impact

Per turn, the closing line is one string between 6 and 25 chars. The EN
rendering is on average **+0.6 chars** longer than the ES rendering (because
`DONE` is shorter than `HECHO` but `SIN PROPUESTAS LIBRES` is far longer than
`NO_FREE_PROPOSALS`); the real saving for non-Spanish hosts is **cognitive
load** on the LLM, not raw tokens. We expect this to be visible only in the
LLM's adherence to the marker (fewer "creative" mis-format attempts) rather
than in token counts.

## scope

| Slice | File(s) | Risk |
|---|---|---|
| S1 — `MARKERS_EN` table | [markers.ts](plugins/status-marker/src/lib/markers.ts ) | none (additive) |
| S2 — `formatCloseMarker` opts | [markers.ts](plugins/status-marker/src/lib/markers.ts ) | low; ES path bit-identical |
| S3 — `close` / `validate` plumbing | [close-tools.ts](plugins/status-marker/src/lib/tools/close-tools.ts ), [validate.ts](plugins/status-marker/src/lib/validate.ts ) | low; validator extension is opt-in |
| S4 — generated types + spec coverage | [tool-outputs.ts](plugins/status-marker/src/generated/tool-outputs.ts ), [markers.spec.ts](plugins/status-marker/tests/markers.spec.ts ) | none (regenerate) |
| S5 — docs: skill + copilot-instructions | [SKILL.md](plugins/status-marker/skills/mcp-vertex-status-marker-and-closure/SKILL.md ), [.github/copilot-instructions.md](.github/copilot-instructions.md ) | none (additive table) |

## non-goals

- **Do not rename the `state` token**. The protocol identifier stays Spanish.
- **Do not translate `reason`**. It is free-form user text and is already in
  whatever language the agent speaks.
- **Do not auto-detect locale from environment**. Hosts that want EN rendering
  pass `{ locale: 'en' }` explicitly. The default is `'es'` for backwards
  compatibility.
- **Do not add additional locales** in this slice. The hook is there
  (`opts.locale`), but the table ships only `es` and `en`. Add more when a
  consumer asks for them.

## rollout

1. Land S1–S5 as a single `feat:` commit (no version bump — additive).
2. Update [apps/web/src/i18n/ui.ts](apps/web/src/i18n/ui.ts ) so the docs site
   renders both spellings in the plugin table.
3. Watch the `status-marker_metrics` event stream for 7 days; if more than
   10% of close events use `{ locale: 'en' }`, fold the EN map into the
   default schema registration so future plugins inherit it for free.