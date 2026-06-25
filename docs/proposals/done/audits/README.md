# Audits — `@mcp-vertex/core`

Index of every audit filed under `docs/proposals/done/audits/`. The list is
auto-generated from the live folder + frontmatter; re-run the generator
(`bun tools/scripts/lint/audit-ids.script.ts` — currently reports duplicates
only; the index below is hand-maintained from the live frontmatter as of
2026-06-23) after adding or renaming audits.

## Naming contract

Every file under this folder follows the contract declared in
[`AGENTS.md`](../../../AGENTS.md) §"Audits File Naming":

```
{numAuditoria}-{DD}-{MM}-{YYYY}-{controladorModelo}-{modelo}-{queSeHaAuditado}.md
```

`numAuditoria` is a 5-digit zero-padded id (`a00001`..`a99999`) and must be
unique across the folder — enforced by `bun run lint:audit-ids`.

## Index

| ID | Date | Runner | Model | Scope | Title |
|----|------|--------|-------|-------|-------|
| [a00001](a00001-14-06-2026-antigravity-claude-sonnet-4-6-thinking.md) | 2026-06-14 | antigravity | claude-sonnet-4-6-thinking | — | Auditoría Exhaustiva inicial — Antigravity (Claude Sonnet 4.6 Thinking) |
| [a00002](a00002-15-06-2026-antigravity-claude-sonnet-4-6-thinking-estado-actual.md) | 2026-06-15 | antigravity | claude-sonnet-4-6-thinking | estado-actual | Estado actual |
| [a00003](a00003-15-06-2026-antigravity-gemini-3-5-flash.md) | 2026-06-15 | antigravity | gemini-3-5-flash | — | Auditoría |
| [a00004](a00004-15-06-2026-antigravity-gemini-3-5-flash-estado-actual.md) | 2026-06-15 | antigravity | gemini-3-5-flash | estado-actual | Estado actual |
| [a00005](a00005-15-06-2026-auditoria-unificada.md) | 2026-06-15 | — | — | auditoria-unificada | Auditoría unificada |
| [a00006](a00006-15-06-2026-claude-code-opus-4-8.md) | 2026-06-15 | claude-code | opus-4-8 | — | Auditoría |
| [a00007](a00007-15-06-2026-codex-gpt-5-5.md) | 2026-06-15 | codex | gpt-5-5 | — | Auditoría |
| [a00008](a00008-16-06-2026-antigravity-claude-sonnet-4-6-thinking.md) | 2026-06-16 | antigravity | claude-sonnet-4-6-thinking | — | Auditoría |
| [a00009](a00009-16-06-2026-antigravity-claude-sonnet-4-6-thinking-previa.md) | 2026-06-16 | antigravity | claude-sonnet-4-6-thinking | previa | Previa |
| [a00010](a00010-16-06-2026-antigravity-gemini-3-5-flash.md) | 2026-06-16 | antigravity | gemini-3-5-flash | — | Auditoría |
| [a00011](a00011-16-06-2026-antigravity-gemini-3-5-flash-previa-exhaustiva.md) | 2026-06-16 | antigravity | gemini-3-5-flash | previa-exhaustiva | Previa exhaustiva |
| [a00012](a00012-16-06-2026-antigravity-gemini-3-5-flash-previa-unificada.md) | 2026-06-16 | antigravity | gemini-3-5-flash | previa-unificada | Previa unificada |
| [a00013](a00013-16-06-2026-auditoria-maestra-unificada.md) | 2026-06-16 | — | — | auditoria-maestra-unificada | Auditoría maestra unificada |
| [a00014](a00014-16-06-2026-claude-code-opus-4-8.md) | 2026-06-16 | claude-code | opus-4-8 | — | Auditoría |
| [a00015](a00015-16-06-2026-codex-gpt-5-auditoria-exhaustiva.md) | 2026-06-16 | codex | gpt-5-5 | auditoria-exhaustiva | Auditoría exhaustiva |
| [a00016](a00016-17-06-2026-auditoria-independiente-github-copilot-minimax-m3.md) | 2026-06-17 | github-copilot | minimax-m3 | auditoria-independiente | Auditoría independiente |
| [a00017](a00017-17-06-2026-claude-code-opus-4-8-estado-actual.md) | 2026-06-17 | claude-code | opus-4-8 | estado-actual | Estado actual |
| [a00018](a00018-18-06-2026-auditoria-agnostica-codex-gpt-5.md) | 2026-06-18 | codex | gpt-5-5 | auditoria-agnostica | Auditoría agnóstica |
| [a00019](a00019-18-06-2026-auditoria-agnostica-estado-actual.md) | 2026-06-18 | — | — | auditoria-agnostica | Estado actual |
| [a00020](a00020-18-06-2026-auditoria-agnostica-gpt-5-4.md) | 2026-06-18 | — | gpt-5-4 | auditoria-agnostica | Auditoría agnóstica |
| [a00021](a00021-21-06-2026-antigravity-gemini-3-5-flash-repositorio.md) | 2026-06-21 | antigravity | gemini-3-5-flash | repositorio | Auditoría de repositorio |
| [a00022](a00022-21-06-2026-claude-code-sonnet-4-6-repositorio.md) | 2026-06-21 | claude-code | sonnet-4-6 | repositorio | Auditoría de repositorio |
| [a00023](a00023-21-06-2026-copilot-gpt-5-4-repositorio.md) | 2026-06-21 | copilot | gpt-5-4 | repositorio | Auditoría de repositorio |
| [a00024](a00024-21-06-2026-copilot-minimax-m3-estudio-ahorro-tokens.md) | 2026-06-21 | copilot | minimax-m3 | estudio-ahorro-tokens | Estudio de ahorro de tokens |
| [a00025](a00025-21-06-2026-copilot-minimax-m3-repositorio.md) | 2026-06-21 | copilot | minimax-m3 | repositorio | Auditoría de repositorio |
| [a00026](a00026-21-06-2026-claude-code-sonnet-4-6-auditoria-unificada.md) | 2026-06-21 | claude-code | sonnet-4-6 | auditoria-unificada | Auditoría unificada |
| [a00027](a00027-21-06-2026-antigravity-gemini-3-5-flash-repositorio.md) | 2026-06-21 | antigravity | gemini-3-5-flash | repositorio | Auditoría de repositorio |
| [a00028](a00028-21-06-2026-copilot-gpt-5-4-eficiencia-operativa-de-agentes.md) | 2026-06-21 | copilot | gpt-5-4 | eficiencia-operativa-de-agentes | Eficiencia operativa de agentes |
| [a00029](a00029-21-06-2026-antigravity-gemini-3-5-flash-repositorio.md) | 2026-06-21 | antigravity | gemini-3-5-flash | repositorio | Auditoría de repositorio |
| [a00030](a00030-21-06-2026-antigravity-gemini-3-5-flash-repositorio.md) | 2026-06-21 | antigravity | gemini-3-5-flash | repositorio | Auditoría de repositorio |
| [a00031](a00031-21-06-2026-antigravity-gemini-3-5-flash-repositorio.md) | 2026-06-21 | antigravity | gemini-3-5-flash | repositorio | Auditoría de repositorio |
| [a00032](a00032-22-06-2026-copilot-minimax-m3-repositorio.md) | 2026-06-22 | copilot | minimax-m3 | repositorio | Auditoría de repositorio |
| [a00033](a00033-22-06-2026-copilot-minimax-m3-test-isolation-and-auto-work-loop.md) | 2026-06-22 | copilot | minimax-m3 | test-isolation-and-auto-work-loop | Test isolation + auto-work loop |
| [a00034](a00034-23-06-2026-antigravity-gemini-3-5-flash-repositorio.md) | 2026-06-23 | antigravity | gemini-3-5-flash | repositorio | Auditoría de repositorio |
| [a00035](a00035-23-06-2026-antigravity-gemini-pro-repositorio.md) | 2026-06-23 | antigravity | gemini-pro | repositorio | Auditoría de repositorio |
| [a00036](a00036-23-06-2026-copilot-minimax-m3-repositorio.md) | 2026-06-23 | copilot | minimax-m3 | repositorio | Auditoría canónica del repositorio mcp-vertex — HEAD 6e1015e |
| [a00037](a00037-23-06-2026-antigravity-deepmind-repositorio.md) | 2026-06-23 | antigravity | deepmind | repositorio | Exhaustive audit of mcp-vertex monorepo — HEAD 43d452d |
| [a00038](a00038-23-06-2026-copilot-minimax-m3-repositorio.md) | 2026-06-23 | copilot | minimax-m3 | repositorio | Auditoría Maestra Exhaustiva — Copilot (minimax-m3) |
| [a00039](a00039-24-06-2026-antigravity-deepmind-repositorio.md) | 2026-06-24 | antigravity | deepmind | repositorio | Auditoría Exhaustiva — Antigravity (DeepMind / Claude Opus 4.6 Thinking) |
| [a00040](a00040-25-06-2026-copilot-minimax-m3-repositorio.md) | 2026-06-25 | copilot | minimax-m3 | repositorio | Auditoría Exhaustiva — Copilot (MiniMax-M3) — repositorio completo |
| [a00041](a00041-24-06-2026-antigravity-deepmind-repositorio.md) | 2026-06-24 | antigravity | deepmind | repositorio | Auditoría Exhaustiva de Excelencia — Antigravity (DeepMind) |

41 audits · f00050 S10.
