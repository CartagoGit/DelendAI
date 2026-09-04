---
id: c00124
title: "Bootstrap: SOLID/Clean Code non-negotiable default"
kind: chore
status: done
type: proposal
track: general
date: 2026-07-26
shipped-in: ["146b65582ad50eb0ef57a4859fa2514a4b462aae"]
closed-by: cartago (auto sync 2026-07-27)
closed-evidence:
  - 146b65582ad50eb0ef57a4859fa2514a4b462aae

---

# c00124 — Bootstrap: SOLID/Clean Code non-negotiable default

## goal

Codificar en `docs/mcp-vertex/AGENT-BOOTSTRAP.md` la regla de que SOLID/Clean Code/reusable code/buenas prácticas se aplican por defecto — sin recordatorio — en este proyecto y en cualquier otro que use `mcp-vertex`, con escapes explícitos (usuario lo pida o contrato del proyecto lo fuerce) auditables en la respuesta.

## why

La preferencia existe en mi memoria de usuario pero no en el bootstrap universal. Mientras no esté en el bootstrap, los demás LLM (Copilot, Claude, Cursor, Aider, Continue, Codex, subagentes) que carguen este repo no la verán. Para que aplique universalmente — exactamente igual que las demás invariantes de §6 — debe vivir en el archivo canónico.

## non-goals

- Crear una skill nueva (~/.agents/skills/mcp-vertex-solid-default.md). El bootstrap ya es el canal universal; añadir más canales diluye la regla.
- Cambiar el TOC ni el orden de las H2 de §6/§7 (rompería `lint:bootstrap-canonical`).
- Enforcement por máquina (custom rule). El bootstrap es narrativo; el enforcement se queda en `run_quality`, `apply_rules`, agents de review y validación de PRs.

## slices

- global_gate: lint

### S1 — Append SOLID/Clean Code invariant to §6 and #12 hard rule to §7.1
- **Status**: done
- **Files**: `docs/mcp-vertex/AGENT-BOOTSTRAP.md`
- **Gate**: lint
- acceptance:
  - "§6 ("Invariants you must not break") contiene un nuevo bullet cuyo texto empieza por `**Code quality is a non-negotiable default.**` y menciona SOLID (SRP/OCP/LSP/ISP/DIP), Clean Code, reusable patterns, escapes explícitos (usuario lo pide o contrato del proyecto lo fuerza) y la obligación de dejar constancia en la respuesta."
  - "§7.1 ("Repo-level hard rules") contiene la regla #12, texto empieza por `Code quality defaults are non-negotiable.` y aterriza la regla al repo (small files, `IFoo`-prefixed interfaces, no `switch`/`if-else` chains sobre plugin/tool/enum IDs, etc.)."
  - "La sección §6 sigue teniendo exactamente UNA inserción (un bullet nuevo) — ninguna H2 duplicada, ningún H2 nuevo."
  - "El TOC (§ "Table of contents") no se modifica (no se introduce sub-sección nueva)."
  - "`bun tools/scripts/lint/bootstrap-canonical.script.ts` exit code 0 (anchor + orden de H2 canónicos + sin duplicados)."
  - "`bun run typecheck` exit code 0 (no se toca TS, sanity gate)."
  - "`bun run validate` exit code 0 (typecheck + lint + tests + drift guards completos)."

## acceptance

- §6 ("Invariants you must not break") contiene un nuevo bullet cuyo texto empieza por `**Code quality is a non-negotiable default.**` y menciona SOLID (SRP/OCP/LSP/ISP/DIP), Clean Code, reusable patterns, escapes explícitos (usuario lo pide o contrato del proyecto lo fuerza) y la obligación de dejar constancia en la respuesta.
- §7.1 ("Repo-level hard rules") contiene la regla #12, texto empieza por `Code quality defaults are non-negotiable.` y aterriza la regla al repo (small files, `IFoo`-prefixed interfaces, no `switch`/`if-else` chains sobre plugin/tool/enum IDs, etc.).
- La sección §6 sigue teniendo exactamente UNA inserción (un bullet nuevo) — ninguna H2 duplicada, ningún H2 nuevo.
- El TOC (§ "Table of contents") no se modifica (no se introduce sub-sección nueva).
- `bun tools/scripts/lint/bootstrap-canonical.script.ts` exit code 0 (anchor + orden de H2 canónicos + sin duplicados).
- `bun run typecheck` exit code 0 (no se toca TS, sanity gate).
- `bun run validate` exit code 0 (typecheck + lint + tests + drift guards completos).
