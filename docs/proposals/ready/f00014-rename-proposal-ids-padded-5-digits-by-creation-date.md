---
id: f00023
kind: feat
title: Renumerar proposals con padding de 5 dígitos, por fecha de creación, dentro de cada familia
status: ready
type: proposal
track: proposals-plugin+docs
date: 2026-06-21
reservedFiles:
    - docs/proposals/index.json
    - docs/proposals/ready/
    - docs/proposals/done/
    - docs/proposals/in-progress/
    - docs/proposals/paused/
    - docs/proposals/blocked/
    - docs/proposals/retired/
    - docs/proposals/n00001-SESION-2026-06-17.md
    - scripts/lint-proposals.ts
    - plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts
    - plugins/proposals/src/lib/proposals/frontmatter-parser.ts
    - plugins/proposals/src/lib/proposals/proposal-registry.ts
    - plugins/proposals/src/lib/proposals/proposal-sync.ts
related:
    - f00016 # proposal state machine — defines the 7-status DFA + the 12 kinds; f00023 must not break it
  - f00001 # done-folder mirrors kinds — already landed; the audit documents now live in done/audits/ with padded IDs
    - f00022 # IDE extension v2 — does not touch IDs but has reservedFiles that include docs/proposals/done/feats/
---

# f00023 — Renumerar proposals con padding de 5 dígitos, por fecha de creación, dentro de cada familia

## Goal

Hoy los IDs de proposal son irregulares:

- `a`: 21, 22, 23, 24 (4 audits, todos del 2026-06-21)
- `f`: 122, 123, 125 (3 fixes; huecos en 124 — que sí existe como `l124` no; sí como `x00007`; y en 100-121 no usados)
- `l`: 114, 115, 116, 117, 118, 119, 120, 121, 122, 125, 126, 127 (12 legacy; huecos en 123, 124)
- `x`: 123, 124 (2 done)

Esto causa tres problemas:

1. **Los números no reflejan el orden cronológico real.** `a1` y `a2` (los audits del 14/06 y 15/06 — los más antiguos) ya están en `done/audits/` renombrados por `f00001`; pero el resto del catálogo empieza en `a21`, dejando huecos inexplicables entre `a4` y `a21`.
2. **Los IDs son ambiguos en logs y PRs.** `f00020` y `r00002` coexisten; `f00019` y `x00006` también. Un grep `grep -E '\b1[0-9]{2}\b'` en un log devuelve los dos.
3. **No hay un ancho fijo**, así que cuando `f*` llegue a 1000 o `a*` llegue a 100, los IDs tendrán longitudes distintas y romperán el layout de tablas, columnas de dashboard, y orden lexicográfico (`f00020` < `f23` en ASCII aunque `f23` sea más antiguo).

**Esta propuesta** arregla los tres problemas con un único cambio:

- **Cada familia** (`a`, `c`, `f`, `l`, `p`, `x`) mantiene su namespace propio (no se mezclan — invariante del workflow f00016 §3.1).
- **Cada ID se rellena con ceros a la izquierda hasta 5 dígitos** (`a00001`, `f00100`, `c00001`, etc.). Margen para 99 999 proposals por familia = suficiente para décadas.
- **Cada familia se renumera por fecha de creación real** (fecha del primer commit que añadió el archivo, vía `git log --diff-filter=A --format=%aI -- <path>`), empezando en `00001` para la más antigua.

## Why

(why this proposal exists — the rationale)

## Why this design

(what this proposal touches — the scope)

1. **22 archivos `.md` bajo `docs/proposals/`** (frontmatter `id:` + nombre de archivo). Solo frontmatter y filename; **NO** se reescribe el cuerpo.
2. **`docs/proposals/index.json`** regenerado vía `mcp-vertex.proposals.sync_proposals` después de los renames.
3. **Refs internas** en otros proposals (`related: [f00016, f00001, f00022]`, links `[f00016](done/f00016-...)`, menciones en prosa como "After landing f00016..."). Solo las que apunten a un ID cuyo número haya cambiado.
4. **`scripts/lint-proposals.ts`** — el regex que valida el formato de ID (`/^[a-z]+\d+$/`) se endurece a `/^[a-z]+\d{5}$/` para que el padding sea enforced desde el CI, no opcional.
5. **`plugins/proposals/src/lib/proposals/frontmatter-parser.ts`** y **`proposal-registry.ts`** — si exponen un validador de ID, se ajusta al nuevo regex. Si solo lo leen, no se toca.
6. **`plugins/proposals/src/lib/contracts/constants/proposal-glossary.constant.ts`** — si el `STATUS_TO_FOLDER` o algún `KINDS` menciona IDs concretos (no debería, pero se verifica), se actualiza.
7. **`docs/proposals/n00001-SESION-2026-06-17.md`** — las menciones a IDs viejos se actualizan al nuevo padded.

## Non-goals

- El modelo DFA de 7-status (f00016) — intacto.
- El cascade priority por familia (`f` cascadea antes que `p`) — intacto.
- La estructura de carpetas (`ready/`, `done/{audits,feats,fixes}/`, etc.) — intacta.
- El contenido (cuerpo) de cualquier proposal — solo frontmatter + filename.
- Las propuestas en `done/audits/` que ya renombró `f00001` (a1..a20) — se les reescribe el `id:` para que sea `a00001..a00020` pero NO se mueven de carpeta.
- El campo `shipped-in` (PR/commits donde se cerró la proposal) — solo se actualiza si apunta a un ID que cambió, y solo el número dentro del string.

## Architecture

Cada familia se enumera por **fecha de creación real** (= fecha del primer commit que añadió el archivo, vía `git log --diff-filter=A --format=%aI -- <path>` | tail -1). En caso de empate a la misma fecha, se desempata por nombre de archivo (alfabético).

| Familia | Hoy (22 IDs)            | Mapeo propuesto (preliminar — S1 confirma con git log)                                |
|---------|-------------------------|---------------------------------------------------------------------------------------|
| `a`     | 21, 22, 23, 24          | `a00021`, `a00022`, `a00023`, `a00024` (los 4 del 21/06 — los 20 de `done/audits/` ya fueron `a1..a20` por f00001 y se renumeran a `a00001..a00020`) |
| `f`     | 122, 123, 125 (+ los renombrados por f00001 en done/) | `f00001`, `f00002`, `f00003` (los más recientes del catálogo ready/in-progress)        |
| `l`     | 114, 115, 116, 117, 118, 119, 120, 121, 122, 125, 126, 127 | `c00001`, `r00001`, …, `f00033` (ordenados por fecha de creación)                      |
| `x`     | 123, 124                | `x00001`, `x00002`                                                                    |

> El número exacto de cada ID lo computa la **S1** (`proposal_guardian` con `git log --diff-filter=A`). Esta tabla es solo un sanity check de que "padding 5" es viable: el ID más alto hoy es 127, así que `00127` cabe.

## Slices

Cada slice es **file-disjoint** (no comparte archivos), así que 4 subagentes en paralelo pueden ejecutarlas. La gate global es `lint` (`bun run lint:proposals`).

### S1 — Inventario + mapa de renumeración
- **Files**: [`tools/scripts/proposals/rename-padded.script.ts`]
- **Status**: done
- **Gate**: `bun run lint:proposals`
- **Acceptance**:
  - "Crea un script `tools/scripts/proposals/rename-padded.script.ts` que escanea todos los `.md` bajo `docs/proposals/{ready,done,in-progress,paused,blocked,retired}/`, extrae el `id:` del frontmatter, obtiene la fecha de creación vía `git log --diff-filter=A --format=%aI -- <path>`, ordena, asigna padded IDs por familia, y emite un mapa `oldId -> newId` como JSON."
  - "`--dry-run` (default) imprime el mapa en stdout; `--apply` hace `git mv` + reescritura de frontmatter."
  - "Maneja colisiones (dos archivos con misma fecha) por orden alfabético de filename."
  - "No toca refs externas — solo frontmatter y filename."

### S2 — Renombrar archivos + frontmatter
- **Files**: [`docs/proposals/ready/**`, `docs/proposals/done/**`, `docs/proposals/in-progress/**`, `docs/proposals/paused/**`, `docs/proposals/blocked/**`, `docs/proposals/retired/**`]
- **Status**: pending
- **Gate**: `bun run lint:proposals`
- **Acceptance**:
  - "Ejecuta `bun tools/scripts/proposals/rename-padded.script.ts --apply` (el script de S1)."
  - "Tras ejecutar, `git status --porcelain` muestra los renames como `R` (rename), no como `D` + `?` (delete + untracked) — esto preserva el historial."
  - "`bun run lint:proposals` pasa sin warnings de ID mal formado."
  - "`docs/proposals/index.json` se regenera con `mcp-vertex.proposals.sync_proposals` (o `bun scripts/sync-proposals.ts` si existe un script equivalente) — los `id` y `file` reflejan el nuevo padding."

### S3 — Actualizar referencias externas
- **Files**: [`docs/proposals/n00001-SESION-2026-06-17.md`, `docs/proposals/in-progress/f00001-*.md`, `scripts/lint-proposals.ts`]
- **Status**: pending
- **Gate**: `bun run lint:proposals`
- **Acceptance**:
  - "Para cada `oldId -> newId` del mapa de S1, busca refs en `*.md`, `*.ts`, `*.astro` (excluyendo `node_modules`, `dist`, `coverage`, `.bun`) y reemplaza `oldId` por `newId` solo donde aparece como ID de proposal."
  - "No reemplaza números que sean parte de versiones semver, años, IDs de issue de GitHub, o nombres de archivo sin patrón `<familia><dígitos>-`."
  - "Endurece el regex de validación en `scripts/lint-proposals.ts` a `/^[a-z]+\d{5}$/`."
  - "El diff resultante es mínimo: solo las refs a IDs que cambiaron de número."

### S4 — Validación global
- **Files**: []
- **Status**: pending
- **Gate**: `bun run validate`
- **Acceptance**:
  - "`bun run validate` verde."
  - "`bun run lint:proposals` verde."
  - "`bun run site:strict` sigue verde y confirma que el cambio no rompió el parser del proposals plugin."
  - "`git grep -nE '\b[a-z][0-9]{1,4}\b' -- ':!*.lock' ':!CHANGELOG.md'` solo devuelve matches donde `[0-9]{1,4}` es claramente no un ID de proposal; el verificador publica un report con los matches residuales para revisión manual."

## Dependency graph

- **f00001 ya está `done` y dejó los audits en `done/audits/`**. El mapa de S1 ya incluye esos IDs como `a00001..a00020`, así que S2 no tiene que coordinar un segundo rename con esa propuesta.
- **f00022 (IDE extension) tiene `reservedFiles: [..., docs/proposals/done/feats/]`.** S2 debe leer esos `reservedFiles` antes de hacer `git mv` y abortar si encuentra conflicto.
- **Agents paralelos en worktrees**: cada slice corre en su propio `agent/<name>` worktree. La sincronización final se hace en `develop` cuando los 4 PRs mergen.

## Acceptance

- [ ] `docs/proposals/index.json` lista los 22 IDs existentes (más los 20 audits que f00001 ya reubicó en `done/audits/`) con IDs padded: `a00001..a00020` (audits) + `a00021..a00024` (audits nuevos del 21/06), `f00001..f00003` (f121..f00019 + el hueco), `c00001..f00033` (c00001..f00032), `x00001..x00002` (x00006, x00007). Si al ejecutar S1 aparecen más IDs en `done/feats/` o `done/fixes/` que el index actual no conoce, se incluyen también.
- [ ] Los 22+ archivos `.md` bajo `docs/proposals/{ready,done,in-progress,paused,blocked,retired}/` tienen `id:` con 5 dígitos padded en el frontmatter.
- [ ] Los nombres de archivo siguen el patrón `<familia><5-dígitos>-<slug>.md` (e.g. `f00001-feat-proposal-state-machine.md`, no `f1-feat-...`).
- [ ] **Cero referencias rotas**: `bun run lint:proposals` pasa limpio; el grep `grep -rEn '\b[a-z][0-9]{1,4}\b' docs/ apps/ packages/ plugins/` no devuelve ningún ID viejo que no esté también en su nueva forma padded.
- [ ] Las dos menciones explícitas en `f00001` ("20 audit files renumbered a1..a20") y el `n00001-SESION-2026-06-17.md` quedan actualizadas al nuevo padded (`a00001..a00020`).
- [ ] `bun run validate` (typecheck + lint + tests) verde. No se modifica ningún test ni ningún comportamiento observable de los tools; el cambio es puramente cosmético + de ordenación.
- [ ] El campo `cascadePriority` del workflow (`f` < `p`) se mantiene — el padding no afecta a la cascada.

## Risks and mitigations

- **R1 — La migración puede salir mal a mitad de renames.** Mitigación: el rollback es `git revert <merge-commit-de-f00023>` y el `index.json` se regenera desde los archivos, no al revés.
- **R2 — Colisión con otra propuesta que reserve las mismas carpetas.** Mitigación: S1 y S2 verifican locks y `reservedFiles` antes de aplicar renames.

## Notes

- No hay estado persistente que se rompa: los IDs viven en frontmatter y nombres de archivo, no en una base de datos.
- Si el CI falla en S4, los slices anteriores se marcan como `pending` y se re-ejecutan desde `develop` después del fix.