---
id: f00025
kind: feat
title: tools/scripts refactor — portar .sh/.py a TS, mover scripts/*.ts a tools/scripts/<area>/<name>.script.ts
status: ready
type: proposal
track: core+build+release+proposals+lint+i18n+site
date: 2026-06-21
---

# f124 — tools/scripts refactor — portar .sh/.py a TS y mover scripts/*.ts a tools/scripts/<area>/<name>.script.ts

## Goal

Cerrar el drift de lenguajes del monorepo: el repo es "TypeScript + bun", pero `scripts/` contiene 2 shell scripts (`translate-tutorials.sh`, `gen-section-pages.sh`) y 2 one-shots Python de debug (`diag.py`, `fix-ext.py`) colados desde sesiones anteriores. Además, los ~17 scripts `*.ts` viven todos en una sola carpeta plana (`scripts/`) sin separación de área, y un usuario del repo no puede saber a primera vista cuál es build, cuál es release, cuál es lint y cuál es site.

La refactor consolida todo en una única convención:

```
tools/
  scripts/
    <area>/                       # build | release | host | types | lint | proposals | smoke | i18n | site
      <name>.script.ts            # entrypoint ejecutable con `bun run tools/scripts/<area>/<name>.script.ts`
      <lib>.ts                    # módulo interno (importado por los .script.ts u otros lugares), sin sufijo
```

Reglas:

- `*.script.ts` = ejecutable bun. Cada uno tiene su propio JSDoc `Usage: bun tools/scripts/<area>/<name>.script.ts [args]`.
- `*.ts` plano dentro de `tools/scripts/<area>/` = módulo importable, no ejecutable.
- `scripts/` se borra entera al terminar S3.
- `tools/` queda **vacía por debajo** de `tools/scripts/` (sin `tools/<otro>` por ahora; si en el futuro aparece otra cosa que no sea "script", se discute en una propuesta aparte — esta propuesta no crea esa categoría).
- Gate biome nuevo: `bun run lint:tools` falla si existe cualquier archivo `.py`, `.sh`, `.bash`, `.zsh`, `.pyc` o `*.sh` dentro de `tools/` y de `scripts/` (este último debería estar vacío post-S3 pero el gate lo protege durante la transición).

## Why

- AGENTS.md, "Hard rules" y la descripción del repo son "TypeScript + bun runtime". Pero la realidad es que `scripts/diag.py` y `scripts/fix-ext.py` se colaron como scripts de debug de una sesión y nadie los borró. Los dos `.sh` son productivos y se referencian en commits, propuestas y `check-tutorials-i18n.ts`. Ambos se quedan como deuda.
- Una sola cadena de herramientas = una sola forma de validar (`bun run typecheck`, `bun run lint`, `biome`). Cada lenguaje nuevo es un segundo formatter, un segundo linter, y una segunda forma de "qué hace este archivo". El core se dogfoodea a sí mismo, así que la regla debe empezar por casa.
- La estructura `tools/scripts/<area>/` da **descubribilidad inmediata**: `tools/scripts/build/` es build, `tools/scripts/release/` es release, `tools/scripts/i18n/` es i18n, etc. Un humano que aterriza en el repo entiende el layout sin leer AGENTS.md.
- El sufijo `*.script.ts` es una pista visual de ejecutabilidad. La convención de los MCP `tools` ya usa `*-tool.ts`; la de los `tasks` ya usa `*.task.ts`; los entrypoints runtime usarán `*.script.ts`. Es la misma forma de razonar.

## Non-goals

- Reescribir la lógica de los scripts `.sh` (awk/sed/find recursivo/declare -A) en algo idiomático-funcional: se portan 1:1 a TS con `node:fs/promises` + `node:child_process` cuando haga falta (find, date, sed) y se mantienen como side-effecting shells en el sentido de AGENTS.md. Lo importante es que sean `.ts`.
- Crear un wrapper o helper `runScript(name, args)` para invocarlos desde otros sitios: cada script se invoca con `bun tools/scripts/<area>/<name>.script.ts` y nada más. Si en el futuro hace falta un wrapper, se discute en una propuesta aparte.
- Mover `apps/web/scripts/*.ts` o `apps/vscode/scripts/*.ts`: esos viven dentro de su app y siguen su propia convención. Esta propuesta toca **solo `scripts/` y crea `tools/scripts/`**.
- Cambiar el comportamiento de `package.json` `scripts.*`: las claves siguen llamándose igual (`build`, `release`, `smoke`, `smoke:pack`, `validate`, `types:generate`, `config:schema`, `lint:proposals`, `lint:scaffolds`). Lo que cambia es el `bun scripts/X.ts` interno por `bun tools/scripts/<area>/<X>.script.ts`. Esto se hace en S4.
- Renombrar `scripts/host/rename-audit-engine.ts` y `scripts/host/rename-audit-tool.ts` con sufijo `.script.ts` — no son entrypoints, son módulos importados por `host-server.script.ts`. Se mueven tal cual a `tools/scripts/host/`.

## Slices

### S1 — Definir convención + borrar basura (.py + root)
- **Status**: pending
- **Files**:
  - `scripts/diag.py` → borrar
  - `scripts/fix-ext.py` → borrar
  - `.validation-script.sh` → borrar
  - `leep 5` → borrar (artefacto de `sleep 5` mal tipeado en una sesión)
  - `S1-IMPLEMENTATION-SUMMARY.md` → borrar (nota de sesión, ya integrada en el commit `a243bcc` de n007)
- **Command**: `git rm` + `rm` para los untracked.
- **Acceptance**:
  - 0 archivos `.py` en `scripts/`
  - 0 archivos basura en la raíz del repo
  - `bun run validate` verde (no se toca código de prod, solo se borra)
  - `git status --porcelain` muestra solo los `D` y los `??` que siguen
- **Riesgo**: bajo. Nada de lo borrado está importado por código de prod (verificado con grep_search: ninguna referencia a `diag.py` o `fix-ext.py` en `*.ts`/`*.json`/`*.yml`/`*.md` del repo).

### S2 — Portar translate-tutorials.sh + gen-section-pages.sh a tools/scripts/<area>/<name>.script.ts
- **Status**: pending
- **Files**:
  - `scripts/translate-tutorials.sh` → `tools/scripts/i18n/translate-tutorials.script.ts`
  - `scripts/gen-section-pages.sh` → `tools/scripts/site/gen-section-pages.script.ts`
  - `scripts/translate-tutorials.sh` (delete) + `scripts/gen-section-pages.sh` (delete)
- **Command**: `bun run validate` + `bun tools/scripts/i18n/translate-tutorials.script.ts --dry-run` (si tiene flag) + `bun tools/scripts/site/gen-section-pages.script.ts --check` (idem)
- **Acceptance**:
  - Ambos `.script.ts` ejecutables con `bun run` (shebang `#!/usr/bin/env bun` + `process.exit` explícito con código)
  - Salida idéntica a los `.sh` originales para los mismos inputs (smoke test con un fixture de 1 plugin × 1 tutorial × 2 langs)
  - 0 referencias residuales a `.sh` en `apps/web/scripts/check-tutorials-i18n.ts` ni en `apps/web/scripts/lib/discover-tutorials.ts` (los `@see scripts/translate-tutorials.sh` se actualizan a `bun tools/scripts/i18n/translate-tutorials.script.ts`)
  - `bun run typecheck` verde
- **Notas de portabilidad**:
  - `translate-tutorials.sh` usa `find ... -type f`, `awk` (extraer frontmatter), `date -u +%Y-%m-%dT%H:%M:%SZ`, `declare -A`. El port usa `node:fs/promises.readdir` recursivo + un mini-parser de frontmatter con regex `^---$` (ya tenemos un patrón en `lint-proposals.ts`) + `new Date().toISOString()` + un `Map<string, string>`.
  - `gen-section-pages.sh` genera 4 archivos × 11 langs. El port usa `node:fs/promises.writeFile` + un loop sobre `LANGS × SECTION_COMPONENTS`. La parte `cat <<EOF` se reemplaza por template strings con la sintaxis exacta que tenía el bash (indentation con tabs, escape de backticks).
  - Ninguno de los dos necesita `node:child_process`: el bash original no llama binarios externos más allá de `find`/`awk`/`sed`/`date`/`grep`/`basename`/`cut`/`mkdir`/`cat`, todos substituibles por APIs nativas de Node 20+.

### S3 — Mover los 17 scripts/*.ts a tools/scripts/<area>/<name>.script.ts (entrypoints) o <name>.ts (módulos)
- **Status**: pending
- **Files**:

  | Origen | Destino entrypoint (`*.script.ts`) | Destino módulo (`*.ts`) |
  |---|---|---|
  | `scripts/build.ts` | `tools/scripts/build/build.script.ts` | — |
  | `scripts/release.ts` | `tools/scripts/release/release.script.ts` | — |
  | `scripts/release-plan.ts` | — | `tools/scripts/release/release-plan.ts` (importado por `release.script.ts`) |
  | `scripts/derive-version.ts` | `tools/scripts/release/derive-version.script.ts` | — |
  | `scripts/host-server.ts` | `tools/scripts/host/host-server.script.ts` | — |
  | `scripts/host/rename-audit-engine.ts` | — | `tools/scripts/host/rename-audit-engine.ts` |
  | `scripts/host/rename-audit-tool.ts` | — | `tools/scripts/host/rename-audit-tool.ts` |
  | `scripts/smoke-cli.ts` | `tools/scripts/smoke/cli.script.ts` | — |
  | `scripts/smoke-pack.ts` | `tools/scripts/smoke/pack.script.ts` | — |
  | `scripts/generate-config-schema.ts` | `tools/scripts/types/generate-config-schema.script.ts` | — |
  | `scripts/generate-tool-types.ts` | `tools/scripts/types/generate-tool-types.script.ts` | — |
  | `scripts/emit-tool-types.ts` | — | `tools/scripts/types/emit-tool-types.ts` |
  | `scripts/lint-proposals.ts` | `tools/scripts/lint/proposals.script.ts` | — |
  | `scripts/lint-scaffolds.ts` | `tools/scripts/lint/scaffolds.script.ts` | — |
  | `scripts/migrate-legacy-proposals.ts` | `tools/scripts/proposals/migrate-legacy.script.ts` | — |
  | `scripts/normalize-legacy-proposals.ts` | `tools/scripts/proposals/normalize-legacy.script.ts` | — |
  | `scripts/rewrite-proposal-refs.ts` | `tools/scripts/proposals/rewrite-refs.script.ts` | — |
  | `scripts/rename-proposals-padded.ts` | `tools/scripts/proposals/rename-padded.script.ts` | — |

  Y al final del slice: `git rm -r scripts/` (la carpeta queda vacía).

- **Command**: `git mv` (preserva historial) + `bun run typecheck && bun run test` (142 archivos, ~1040 tests, debe quedar verde) + smoke de los 12 entrypoints con `--help` o `--dry-run` cuando exista.
- **Acceptance**:
  - 0 archivos dentro de `scripts/` tras el slice
  - `bun run typecheck` verde (los paths internos a `../plugins/...` se actualizan si los archivos se movieron; los `import { ... } from './migrate-legacy-proposals'` se reescriben a `'./migrate-legacy.script'` solo si aplica — los imports a **módulos** quedan como `from './release-plan'`, los imports a **scripts** se mantienen en el callsite como `from './migrate-legacy.script'`)
  - `bun run test` verde
  - Cada `*.script.ts` tiene shebang `#!/usr/bin/env bun` y `process.exit(code)` explícito
  - `git log --follow tools/scripts/release/release.script.ts` muestra el historial original de `scripts/release.ts` (git --follow preserva el rename)
- **Notas**:
  - Los imports relativos entre scripts del mismo área (`release.script.ts` importa `./release-plan`) **se mantienen** — solo cambia la profundidad del path.
  - Los imports a `../plugins/proposals/src/...` (que tienen `lint-proposals.ts` hoy) **se actualizan** a `../../plugins/proposals/src/...` porque ahora vive un nivel más profundo.

### S4 — Actualizar package.json, lefthook, workflows, todos los consumidores
- **Status**: pending
- **Files**:
  - `package.json` → 12 entradas `scripts.*` cambian de `bun scripts/X.ts` a `bun tools/scripts/<area>/<X>.script.ts` (build, release, smoke, smoke:pack, validate es meta, types:generate, config:schema, lint:proposals, lint:scaffolds, lint:cross-ide también, los demás quedan igual).
  - `lefthook.yml` → actualizar `format-web-staged`/`format-other-staged` globs para incluir `tools/**` (la convención biome format ahora cubre también `tools/scripts/**`).
  - `.github/workflows/release.yml` → actualizar el call a `bun scripts/derive-version.ts` → `bun tools/scripts/release/derive-version.script.ts`.
  - Cualquier `docs/proposals/**/*.md` que referencie `scripts/X.ts` → actualizar las menciones (las propuestas cerradas como `f101` o `f110` NO se reescriben — son documentos históricos; solo se actualizan las `ready/` activas si las hay).
  - `AGENTS.md` → añadir un bullet en "Hard rules" (en S5).
- **Command**: `bun run validate` (gate global) + grep_search para confirmar 0 referencias rotas a `scripts/X.ts` en archivos no históricos.
- **Acceptance**:
  - `bun run build` funciona end-to-end
  - `bun run release --bump=patch --write --dry-run` muestra el plan correcto (sin intentar publicar)
  - `bun run smoke` ejecuta el CLI compilado bajo node, igual que antes
  - 0 referencias a `scripts/X.ts` en archivos `*.ts`/`*.json`/`*.yml`/`*.md` bajo `apps/`, `packages/`, `plugins/`, `docs/proposals/ready/`, `docs/proposals/in-progress/`, `docs/scaffolds/`, `tools/`, `.github/`, root
  - Las menciones en `docs/proposals/done/**` se dejan tal cual (histórico); se documenta aquí que el grep "0 referencias" se mide solo sobre `ready/`+`in-progress/`+`blocked/`+`paused/`+`review/`
  - `lefthook run format-web-staged` y `lefthook run format-web` siguen funcionando

### S5 — Gate biome + regla AGENTS.md
- **Status**: pending
- **Files**:
  - `biome.json` → añadir override que marque como **error** la presencia de archivos `.py`, `.sh`, `.bash`, `.zsh`, `.pyc` dentro de `tools/` y `scripts/`. Biome 2.5 tiene `files.includes` con negación pero no permite "fail if pattern matches"; se logra con un nuevo script `tools/scripts/lint/no-shell-python.script.ts` (auto-hospeda el gate, mismo patrón que `lint-proposals` y `lint-scaffolds`) y un alias en `package.json` (`lint:tools`) que se enchufa a `bun run lint`.
  - `package.json` → añadir `lint:tools` y añadirlo a la cadena de `lint`: `"lint": "biome ci && bun run lint:ide && bun run lint:tools"`. **Importante**: `lint:tools` debe correr **antes** de `biome ci` para que un `.py` colado no llegue al formatter; alternativamente, el gate va detrás y `validate` falla tarde pero determinista. La propuesta toma la segunda opción (gate detrás) por simetría con `lint:ide`/`lint:proposals`/`lint:scaffolds`.
  - `AGENTS.md` → nuevo bullet en "Hard rules":
    ```
    9. **`tools/scripts/` es TypeScript exclusivo.** Ningún archivo `.py`, `.sh`,
       `.bash`, `.zsh`, `.pl`, `.rb` dentro de `tools/` ni de `scripts/`. Los
       ejecutables llevan sufijo `*.script.ts` y se invocan con
       `bun tools/scripts/<area>/<name>.script.ts`. Excepción: plugins que
       vendan utilidades para un lenguaje de dominio (p.ej. un futuro
       plugin `python-lint`) pueden tener `tools/scripts/<plugin>/*.py`,
       declarándolo en su README. Hoy no hay ninguno.
    ```
  - `apps/web/scripts/check-tutorials-i18n.ts` → actualizar el `@see scripts/translate-tutorials.sh` → `@see tools/scripts/i18n/translate-tutorials.script.ts` y el comentario del banner "Bootstrap script: `bun scripts/translate-tutorials.sh`" → "`bun tools/scripts/i18n/translate-tutorials.script.ts`".
  - `apps/web/scripts/lib/discover-tutorials.ts` → actualizar el comentario del pipeline.
  - `biome.json` → `files.includes` añade `"tools/**"` y quita `"scripts/**"` (ya borrado en S3); el formatter cubre `tools/scripts/**/*.{ts,mjs,cjs,json,md}` con la misma config que `apps/web/scripts/**`.
- **Command**: `bun run validate` + crear ad-hoc un `scripts/test.py` (que `git clean` borrará tras el test) para verificar que el gate lo cazaría. Limpiar el `.py` tras la prueba.
- **Acceptance**:
  - `bun run lint:tools` verde
  - `bun run lint:tools` falla con exit code 1 si existe un `tools/scripts/test.py` o un `tools/scripts/test.sh` (verificado ad-hoc y limpiado)
  - `AGENTS.md` contiene el nuevo bullet 9 en "Hard rules"
  - `bun run validate` global verde
  - `git log --stat` muestra los archivos históricos de `docs/proposals/done/**` **sin tocar** (no se reescriben menciones a `scripts/X.ts` en propuestas cerradas)

## Acceptance

- [ ] S1: `git rm scripts/diag.py scripts/fix-ext.py` + `rm .validation-script.sh leep 5 S1-IMPLEMENTATION-SUMMARY.md` (los 2 últimos untracked)
- [ ] S2: `tools/scripts/i18n/translate-tutorials.script.ts` y `tools/scripts/site/gen-section-pages.script.ts` ejecutan vía `bun` y producen el mismo output que sus `.sh` originales (smoke con 1 plugin × 1 tutorial × 2 langs + 1 lang × 1 section)
- [ ] S3: `scripts/` borrada entera. 12 entrypoints `*.script.ts` + 3 módulos `*.ts` en `tools/scripts/`. `bun run typecheck` y `bun run test` verde
- [ ] S4: `package.json` actualizado. `lefthook.yml` cubre `tools/**`. `release.yml` actualizado. 0 referencias rotas a paths `scripts/X.ts` en archivos no históricos del repo
- [ ] S5: `bun run lint:tools` verde y se enchufa a `bun run validate`. Bullet 9 en `AGENTS.md`. El gate cazaría un `.py` o `.sh` colado en `tools/` (verificado ad-hoc, limpiado)
- [ ] `bun run validate` global verde tras cada slice
- [ ] `git log --follow` preserva la historia de los archivos movidos en S3

## Risks and mitigations

- **R1 (S3)**: los `git mv` cambian paths de imports relativos y rompen typecheck. **Mitigación**: tras el move, ejecutar `bun run typecheck`; los errores son deterministas y se arreglan con `find` + `sed` sobre los paths. Si el typecheck queda verde, no hay riesgo residual.
- **R2 (S4)**: el `lefthook` formatea con paths viejos y deja los nuevos sin tocar hasta el próximo commit. **Mitigación**: añadir `tools/**` a los globs de `format-web-staged`/`format-other-staged` en el mismo slice, antes del primer commit con un archivo nuevo en `tools/scripts/`.
- **R3 (S5)**: el gate `lint:tools` puede ser ruidoso si corre sobre archivos viejos en `scripts/` durante la transición. **Mitigación**: S3 borra `scripts/` entera; el gate ya no se queja. Mientras convivan ambas rutas (durante S4), el gate se enchufa al final, cuando ya no hay solapamiento.
- **R4 (S2)**: el `awk` del `.sh` original extrae el frontmatter EN con `awk 'BEGIN { in_fm=0; past_fm=0 } /^---$/ ...'`. El port TS usa una regex equivalente. **Mitigación**: smoke test con un fixture conocido antes de borrar el `.sh`. Si el comportamiento difiere en un edge case (e.g. frontmatter con `---` dentro), se documenta en el spec del slice y se ajusta.
- **R5 (cambio masivo)**: el `git diff` de S3 + S4 toca ~25 archivos. **Mitigación**: S3 y S4 son **commits separados** (S3 = moves, S4 = consumidores), no un mega-commit. Esto facilita `git bisect` y rollback selectivo.

## Notes

- **Auditoría origen**: esta propuesta NO nace de una auditoría abierta. Es respuesta directa a un observation del workspace owner (sesión actual) sobre la mezcla de lenguajes en `scripts/`. Se eleva a propuesta formal para que el move quede trazado en `docs/proposals/ready/` y se pueda cerrar con `lint:proposals` verde, igual que cualquier otra refactor del monorepo.
- **Convención `*.script.ts`**: es nueva en el repo. Se introduce aquí y se documenta en AGENTS.md (S5). La razón del sufijo (no prefijo) es que los archivos de módulos mantienen su `<name>.ts` plano y los entrypoints ganan `.script.ts` como segunda palabra, igual que las convenciones `*-tool.ts` (MCP tools) y `*.task.ts` (no usada todavía pero reservada). Es un sufijo que **califica** el archivo, no que lo nombra.
- **Por qué `tools/` y no `bin/`**: `bin/` es convención Unix para ejecutables que van al PATH del usuario (`/usr/local/bin`). Aquí no instalamos nada en el PATH del usuario; los scripts son de monorepo. `tools/` es la convención que usa pnpm, turborepo, nx y rust para "scripts internos que no son código de producto". Se alinea con el resto del ecosistema TS.
- **Por qué subcarpetas por área y no por dominio funcional**: 9 áreas × 1-3 archivos = 12 entrypoints y 3 módulos. Es el sweet spot: las áreas son obvias (`build/`, `release/`, `host/`, `smoke/`, `types/`, `lint/`, `proposals/`, `i18n/`, `site/`) y los archivos dentro son 1-2. Más subcarpetas sería over-engineering; menos (un flat `tools/scripts/*.ts`) vuelve al problema actual.
- **Lock del orchestrator**: verificado — no hay `agent_lock` activo sobre `tools/` ni sobre `scripts/`. El path está libre. Si al ejecutar S3 aparece un lock de otro agente sobre uno de los archivos a mover, S3 aborta y se reagenda.
