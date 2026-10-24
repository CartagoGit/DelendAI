---
id: x00281
title: "biome ci sobre el monorepo completo con baseline-ratchet"
kind: fix
status: done
type: proposal
track: ci
date: 2026-08-29
priority: P0
related:
    - q00011
    - c00125 # solid-compliance.script.ts — mismo idioma de ratchet
    - c00126 # types-in-contracts.script.ts — mismo idioma de ratchet (baseline por fichero)
    - c00157 # type-naming.script.ts — mismo idioma de ratchet más reciente
shipped-in:
    - c9688ef # S1 baseline + S2 tolerancia 0 + S3 lint/CI cableado
---

# x00281 — biome ci sobre el monorepo completo con baseline-ratchet

## Goal

`bun run lint` deja de invocar `biome ci extensions/vscode` y pasa a
invocar `biome ci .` (todo el árbol que `biome.json` ya declara vía
`files.includes: ["**", ...exclusiones]`), respaldado por una
**baseline JSON por regla** que registra la deuda actual y que solo
puede bajar. El check `check:i18n` de `extensions/vscode` se conserva
como paso independiente.

## why

El `package.json` raíz declara:

```json
"lint": "bun tools/scripts/lib/with-compute-lock.script.ts lint -- 'biome ci extensions/vscode && bun run --cwd extensions/vscode check:i18n'"
```

`biome.json` ya incluye `"**"` con exclusiones sensatas (`dist`,
`build`, `node_modules`, …) — es decir, **el linter está configurado
para todo el repo**, pero la invocación que `bun run lint` ejecuta
(y que `ci.yml`/`lint-biome`, `tier1`/`affected-lint` y
`tier2`/`lint-full` reutilizan las tres) lo restringe a
`extensions/vscode`.

Medición reproducida en esta sesión (2026-08-29, no confiar en la
cifra de la auditoría sin volver a correrla — el propio autor de la
auditoría ya se corrigió siete veces esta semana):

```
$ bunx biome ci packages plugins tools apps
Checked 3380 files in 1414ms. No fixes applied.
Found 45 errors.
Found 118 warnings.
Found 127 infos.
```

Esto es prácticamente idéntico a lo publicado en
`docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md`
(AUD-A09: 3320 ficheros, 45 errores, 119 warnings, 127 infos) — el
delta de 60 ficheros y 1 warning es churn normal de un día de trabajo
concurrente en el repo, no un error de medición. **Los 45 errores son
correctos y el recuento de ficheros ha subido, no bajado**: la premisa
de la auditoría sobrevive intacta.

Muestra de ficheros con errores reales (no solo warnings):
`packages/core/src/lib/scan/catch-swallow.ts`,
`packages/core/src/lib/scan/dip-violation.ts`,
`packages/core/src/lib/scan/long-chains.ts`,
`packages/core/src/lib/scan/long-chains-fix.ts`,
`packages/core/src/lib/scan/magic-numbers.ts`,
`packages/cli/src/commands/groups/docs.spec.ts`.

`affected-lint` en `tier1.yml` incluso documenta la intención
correcta en su propio comentario ("biome scans by file globs...")
mientras invoca `bun run lint`, que es el comando recortado: la
intención y la implementación divergen en el comentario mismo.

## why this design

El repo ya resuelve exactamente este problema —deuda masiva
preexistente + necesidad de activar un gate hoy sin bloquear a nadie—
con el mismo idioma tres veces: `types-in-contracts.script.ts`,
`solid-compliance.script.ts` y, más recientemente,
`type-naming.script.ts` (c00157). Los tres comparten: baseline JSON
versionado, `--update` para re-grabar, `--report` para solo contar, y
la regla "el conteo de un fichero/regla solo puede bajar, nunca
subir". Reutilizar el idioma es la opción de menor riesgo: cualquiera
que ya conozca uno de los tres scripts sabe leer este.

Una reformateada global (`biome ci . --write` de una vez) es la
alternativa obvia y la que este repo tiene motivos concretos para
temer: la memoria operativa registra codemods fusionados que
corrompen ficheros silenciosamente en volúmenes grandes de cambio
automático (ver "Merged codemods silently corrupt files" en el
histórico de sesiones), y un PR que reformatea ~3300 ficheros de una
vez es exactamente el tipo de diff que nadie revisa línea a línea. Un
ratchet permite activar el gate **hoy**, sin ese PR gigante, y drenar
los 45 errores + 118 warnings de forma incremental y revisable.

## non-goals

- **Arreglar los 45 errores ni los 118 warnings existentes.** Es
  trabajo de seguimiento (burn-down), fuera de esta propuesta.
  `check:i18n` de `extensions/vscode` tampoco se toca.
- **Reformatear el monorepo de una sola vez.** Ver "why this design":
  el riesgo de corrupción silenciosa en un diff de ese tamaño es
  real y ya se ha materializado antes en este repo con codemods.
- **Cambiar reglas de `biome.json`** (activar/desactivar linters). Esta
  propuesta solo amplía el *scope* de invocación, no el conjunto de
  reglas.
- **Sustituir Biome por otra herramienta.** Fuera de alcance.

## architecture

`tools/scripts/lint/biome-baseline.script.ts` (nuevo) envuelve
`biome ci` en modo `--reporter=json` sobre el árbol completo
(`packages plugins tools apps extensions` — nota: `extensions/vscode`
pasa a compartir el mismo baseline que el resto, en vez de tener su
comando aislado), agrega los diagnósticos por **regla** (no por
fichero — a diferencia de `types-in-contracts`, el volumen por
fichero individual sería demasiado ruidoso; agregar por
`category`/regla da un baseline manejable de decenas de entradas en
vez de cientos) y compara contra
`tools/scripts/lint/biome-baseline.json`:

- Si el conteo de una regla **sube** respecto al baseline → falla,
  nombrando la regla y el delta.
- Si aparece una regla **nueva** con violaciones que no estaba en el
  baseline → falla.
- Si el conteo de una regla **baja** → el script avisa
  ("baseline shrank for <rule>: update it") pero solo falla en modo
  estricto si `--update` no se ha corrido; en modo normal el
  descenso no bloquea (igual que `type-naming`).
- `--update` re-graba el baseline con los conteos actuales (solo se
  usa tras corregir violaciones reales, nunca para "aceptar" una
  subida).
- `--report` imprime los conteos sin comparar ni fallar.

Errores de Biome (severidad `error`, no `warning`/`info`) se separan
en su propia entrada `__errors__` del baseline con tolerancia 0 desde
el día uno tras corregirlos en un slice aparte — los errores actuales
no son estilo, son bugs reales de patrón (`noAssignInExpressions`,
etc.) y no deberían vivir en un baseline permanente de la misma forma
que los warnings de formato.

`bun run lint` pasa a:

```json
"lint": "bun tools/scripts/lib/with-compute-lock.script.ts lint -- 'bun tools/scripts/lint/biome-baseline.script.ts && bun run --cwd extensions/vscode check:i18n'"
```

## Slices

### S1 — Medir y congelar el baseline real de warnings/infos

- **Status**: done
- **Files**:
    - `tools/scripts/lint/biome-baseline.script.ts` (nuevo)
    - `tools/scripts/lint/biome-baseline.script.spec.ts` (nuevo)
    - `tools/scripts/lint/biome-baseline.json` (nuevo, generado con `--update`)
- **Gate**: `bunx vitest run tools/scripts/lint/biome-baseline.script.spec.ts`,
  `bun tools/scripts/lint/biome-baseline.script.ts --report`

### S2 — Arreglar los 45 errores reales y ponerlos a tolerancia 0

- **Status**: done
- **Files**: los ficheros con error listados por
  `bun tools/scripts/lint/biome-baseline.script.ts --report --severity=error`
  (hoy incluye, sin ser exhaustivo:
  `packages/core/src/lib/scan/catch-swallow.ts`,
  `packages/core/src/lib/scan/dip-violation.ts`,
  `packages/core/src/lib/scan/long-chains.ts`,
  `packages/core/src/lib/scan/long-chains-fix.ts`,
  `packages/core/src/lib/scan/magic-numbers.ts`,
  `packages/cli/src/commands/groups/docs.spec.ts`)
- **Gate**: `bunx biome ci packages plugins tools apps extensions --reporter=json | bun -e "process.exit(JSON.parse(require('fs').readFileSync(0,'utf8')).summary.errors===0?0:1)"`
- review-state: done
- review-implementer: falcon
- review-reviewer: delivery_verifier
- review-log: approved by delivery_verifier — Verificacion independiente en el checkout actual: bun tools/scripts/lint/biome-baseline.script.ts --report --severity=error sin errores; bunx biome ci verde en los 6 archivos del alcance y en los archivos adyacentes verificados; typecheck de packages/core y packages/cli verde; tests estrechos de scan + docs spec 28/28; no hay cambios locales en el area del slice ni vecinos inmediatos que bloqueen la aprobacion, aunque el arbol tiene cambios no relacionados fuera de alcance.
### S3 — Cablear `bun run lint` al comando completo + CI

- **Status**: done
- **Files**:
    - `package.json` (script `lint`, + `lint:biome-baseline` alias
      wired into `validate`)
    - `.github/workflows/ci.yml` (job `lint-biome`) — **corrección**:
      no requirió ningún cambio. `lint-biome` ya invoca `bun run
      lint`, nunca `biome ci extensions/vscode` directamente, así que
      queda cableado al comando completo en cuanto cambia el script
      `lint` de `package.json`.
    - `.github/workflows/tier1.yml` (job `affected-lint`) —
      **corrección**: mismo caso; ya invoca `bun run lint`. El
      comentario desactualizado ("biome scans by file globs...") sigue
      sin corregir porque `tier1.yml` no está en el territorio
      asignado para esta implementación (edición cosmética, no
      bloquea el gate).
    - `.github/workflows/tier2.yml` (job `lint-full`) — **corrección**:
      mismo caso; ya invoca `bun run lint`, sin cambios necesarios.
- **Gate**: `bun run lint` — PASA (verificado en vivo, ver informe de
  implementación).

## dependency graph

S1 (baseline) es independiente y debe entrar primero — es lo que hace
visible el estado real. S2 (los 45 errores) depende de S1 solo para
tener el reporte exacto de qué corregir, pero puede ejecutarse en
paralelo si alguien ya conoce la lista. S3 (cablear el comando) debe
entrar **después** de S1 y S2: activar el gate completo antes de bajar
los errores a 0 dejaría `validate` roto para todo el mundo desde el
primer commit.

## acceptance

1. `bun tools/scripts/lint/biome-baseline.script.ts --report` analiza
   ≥3300 ficheros bajo `packages plugins tools apps extensions`
   (verificado contra el recuento real del run, no un número fijo —
   el repo crece).
2. El baseline de errores (`__errors__`) es 0 tras S2.
3. Introducir una violación nueva de una regla ya en el baseline hace
   fallar el lint (exit 1, nombrando la regla y el delta); quitarla
   vuelve a exit 0. Probado en vivo con un fixture temporal.
4. `bun run lint` ejecuta el comando completo (no solo
   `extensions/vscode`) y `check:i18n` sigue corriendo.
5. `bun tools/scripts/lint/proposals.script.ts` sin errores ni
   warnings sobre este fichero.

## risks and mitigations

- **Riesgo: activar `biome ci .` de golpe exige un PR gigante.**
  Mitigación: baseline con recuento por regla que solo puede bajar —
  exactamente el patrón de `lint:file-conventions`/`types-in-contracts`
  citado en la propia auditoría (AUD-A09) como la solución
  arquitectónica correcta. El gate se activa hoy sin bloquear a nadie.
- **Riesgo de reformateo masivo silencioso.** Esta propuesta
  deliberadamente NO ejecuta `biome ci . --write` sobre el árbol
  completo: solo S2 toca ficheros, y solo los que tienen errores reales
  (no reformateo de estilo). El repo tiene precedente de codemods
  fusionados que corrompieron lógica fuera de su alcance declarado
  (memoria operativa: "Merged codemods silently corrupt files"); un
  diff de ~3300 ficheros de solo-formato no sería revisable línea a
  línea y se trata como fuera de alcance de esta propuesta.
- **Riesgo: el baseline se convierte en un cementerio permanente.**
  Mitigación: mismo mensaje explícito de "baseline shrank" que
  `type-naming`/`types-in-contracts`, que sí han bajado con el tiempo;
  además `__errors__` arranca en 0 desde el primer commit de esta
  propuesta, así que no hay categoría de error real que pueda
  acumularse de nuevo sin que el lint lo bloquee inmediatamente.
- **Riesgo: `affected-lint` (tier1) sigue ejecutando el lint completo
  en vez de solo lo afectado**, ya documentado como deuda separada en
  `x00282`/AUD-A11 — esta propuesta no lo resuelve, solo corrige el
  *scope* del comando, no su alcance por PR.

## notes

Ficheros de referencia para el idioma de ratchet copiado:

- `tools/scripts/lint/type-naming.script.ts` (más reciente, agregación
  por fichero)
- `tools/scripts/lint/types-in-contracts.script.ts`
- `tools/scripts/lint/solid-compliance.script.ts`

Medición completa reproducida el 2026-08-29 (un día después del
snapshot de la auditoría, `2cf17373`, sobre `fix/a00090-independent-audit-hardening`):

```
$ bunx biome ci packages plugins tools apps
Checked 3380 files in 1414ms. No fixes applied.
Found 45 errors.
Found 118 warnings.
Found 127 infos.
```
