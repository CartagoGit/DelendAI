---
id: i00004
title: "Ningun workflow de Actions puede estar sintacticamente roto sin que un check lo detecte, y los .d.ts sueltos dejan de estar versionados"
kind: infra
status: done
type: proposal
track: trust
date: 2026-09-08
shipped-in:
  - "4408dc2b8"
  - "8a3e2a315"
closed-by: evidence pass 2026-09-15
closed-evidence:
  - 8a3e2a315 workflow-yaml gate (YAML 1.2 parse with file/line/column, name/on/jobs and runs-on/steps shape) plus its spec, 19 tests passing
  - lint:workflow-yaml runs in validate:run and in the lint-security CI job, which delendai-validate (the single required check) needs; live run passes over all 15 workflows
  - 4408dc2b8 8a3e2a315 no-tracked-declarations (S2), verified earlier
---

# i00004 — Ningun workflow de Actions puede estar sintacticamente roto sin que un check lo detecte, y los .d.ts sueltos dejan de estar versionados

## Goal

Cerrar dos huecos de higiene que llevan varias auditorias abiertos: un workflow de calidad invalido que nadie detecta, y 278 artefactos de compilacion versionados dentro de src pese a estar en .gitignore.

## why

Auditoria 2026-09-08. (1) .github/workflows/quality-gate.yml estaba sintacticamente invalido: en el paso Run integrated quality gate las claves env y run estaban indentadas a 28 espacios en vez de 14, con lo que yaml.safe_load fallaba en la linea 49. Era el UNICO workflow invalido de los mas de 30 del repositorio, y era precisamente el que pretende ser el gate integrado de calidad: un workflow de validacion podia estar roto sin que ningun otro check lo dijera. Ya esta corregido, pero nada impide que vuelva a ocurrir. (2) .gitignore:86-88 ignora packages/*/src/**/*.d.ts y plugins/*/src/**/*.d.ts con el comentario a .d.ts next to a .ts source is always an accident, pero .gitignore no afecta a ficheros ya trackeados: git ls-files devolvia 278. Ya estaban desincronizados (db-status.tool.ts no tenia .d.ts mientras sus vecinos si). La regla se escribio y nunca se ejecuto el git rm --cached. Ya se han desindexado, y falta el guardarrail.

## non-goals

- No reescribir los workflows mas alla de dejarlos validos.
- No cambiar el contenido del quality gate.

## Slices

- global_gate: lint

### S1 — gate de validacion sintactica de todos los YAML de Actions
- **Status**: done — `8a3e2a315`. `tools/scripts/lint/workflow-yaml.script.ts` walks `.github/workflows/*.yml` and `*.yaml`, parses each with the `yaml` package (a real YAML 1.2 parser) and reports file, line and column for every parse error; it also checks the minimal shape (`name`, `on`, `jobs`; `runs-on` and `steps` per job), with shape findings located through the parser's `LineCounter`. Its spec passes (19 tests). It runs in `validate:run` and in the `lint-security` CI job, which is in the `needs` of `delendai-validate`, the single aggregated required check. A live run on 2026-09-15 passes over all 15 workflows; the acceptance's "30+" was the count when this proposal was written, and the repository has consolidated since. Verified 2026-09-15.
- **Files**: `tools/scripts/lint/workflow-yaml.script.ts`, `tools/scripts/lint/workflow-yaml.script.spec.ts`, `.github/workflows/ci.yml`
- **Gate**: lint
- acceptance:
  - "Un script recorre .github/workflows/*.yml y *.yaml y falla nombrando fichero, linea y columna ante cualquier YAML invalido."
  - "El script comprueba ademas la forma minima esperada: existe name, existe on, existe jobs, y cada job tiene runs-on y steps."
  - "Esta cableado en bun run validate y en un job de CI que forma parte de los required checks agregados."
  - "Hoy pasa en verde sobre los 30+ workflows del repositorio."

### S2 — guardarrail contra .d.ts versionados dentro de src
- **Status**: done — `4408dc2b8`, `8a3e2a315`. `no-tracked-declarations` and its spec (9 passing) are wired into `validate:run` and the CI lint job; a live run reports 0 tracked `.d.ts` files under package or plugin sources. Verified 2026-09-15.
- **Files**: `tools/scripts/lint/no-tracked-declarations.script.ts`, `tools/scripts/lint/no-tracked-declarations.script.spec.ts`
- **Gate**: lint
- acceptance:
  - "Un lint falla si git ls-files devuelve cualquier .d.ts bajo packages/*/src o plugins/*/src."
  - "El mensaje de error incluye el comando exacto de remedio (git rm --cached)."
  - "Esta cableado en validate y hoy pasa en verde con 0 ficheros."

## acceptance

- Un script recorre .github/workflows/*.yml y *.yaml y falla nombrando fichero, linea y columna ante cualquier YAML invalido.
- El script comprueba ademas la forma minima esperada: existe name, existe on, existe jobs, y cada job tiene runs-on y steps.
- Esta cableado en bun run validate y en un job de CI que forma parte de los required checks agregados.
- Hoy pasa en verde sobre los 30+ workflows del repositorio.
- Un lint falla si git ls-files devuelve cualquier .d.ts bajo packages/*/src o plugins/*/src.
- El mensaje de error incluye el comando exacto de remedio (git rm --cached).
- Esta cableado en validate y hoy pasa en verde con 0 ficheros.
