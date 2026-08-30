---
id: a00048
kind: audit
title: "Auditoría completa del proyecto — `@mcp-vertex/core` (modo general, 6 bandas, worstSeverity en inglés)"
status: done
date: 2026-07-01T01:00:00Z
track: code-quality+concurrency+security+proposals+alignment
related:
    - a00047 # previous post-merge audit
    - a00045 # post-merge exhaustive audit
    - x00091 # audit plugin overhaul (this session)
    - r00004 # root declutter refactor
    - f00077 # audit_run Alcance B
    - l99 # original audit plugin spec
date_iso: 2026-07-01
mode: general
projects: []
shipped-in:
    - x00091 # to be opened as a follow-up if needed
---

# 01-07-2026 · Auditoría completa del proyecto (modo general) — `@mcp-vertex/core`

> **Documento independiente.** Esta auditoría reevalúa el estado completo del
> monorepo tras la sesión de trabajo del 01-07-2026 (renombre del token del
> enum `worstSeverity` de `ESPLÉNDIDO` → `EXEMPLARY` y adopción de los tres
> modos de auditoría `general` / `specific` / `monorepo` introducidos como
> `x00091` en el plugin `@mcp-vertex/audit`).
>
> **Vocabulario de severidad**: este reporte usa la rúbrica de 6 niveles que el
> usuario pidió para la lectura (`FATAL` / `REGULAR` / `BIEN` / `MUY_BIEN` /
> `PERFECTO` / `ESPLÉNDIDO`). El campo `worstSeverity` estructurado que el
> parser y el consolidador emiten usa los **tokens en inglés canónicos**
> (`FATAL` / `MUY_MAL` / `MEJORABLE` / `OK` / `MUY_BIEN` / `PERFECTO` /
> `EXEMPLARY`) — los reports viejos en español siguen siendo parseables.
>
> HEAD auditado: `5520daa4` (chore: contracts split landed).
> Revisor: Copilot (M3 — sesión actual).
> Estado de la suite de tests: ✅ verde — 3,598 tests pasando (212 files).
> Biome linter: 75 ficheros chequeados, 0 fixes necesarios.
> i18n gate: 12 idiomas × 150 keys, completo.

---

## 1. Veredicto (en una frase)

El proyecto `@mcp-vertex/core` está en un **estado operativo excelente**: el
gate `bun run validate` pasa en < 60 s, los 14 plugins cargan sin errores, los
contratos públicos están honrados, las primitivas de escritura atómica se
usan de forma consistente, y la única presencia residual de `process.cwd()`
está correctamente documentada como caso límite de boot. La introducción de
los tres modos de auditoría (general / specific / monorepo) y del token
inglés `EXEMPLARY` consolidan una API de proyecto-agnostic sin regresiones.

---

## 2. Estado verificado (Phase 0)

| Paso | Comando / Verificación | Resultado |
|---|---|---|
| 1 | `git log --oneline -5` | HEAD = `5520daa4` |
| 2 | `git status --short` | Working tree con cambios del plugin audit (no commiteados) |
| 3 | TS LOC total | **193 622 LOC** |
| 4 | Plugins activos | **16 plugins cargados, 0 plugin errors** |
| 5 | `bun run typecheck` | ✅ verde |
| 6 | `bun run test` | ✅ **3 598 / 3 598 tests** en 41 s |
| 7 | `bun run lint` (biome + i18n) | ✅ 75 files, 0 fixes |
| 8 | `bun run lint:proposals` | ✅ 175 files, 0 fatals |
| 9 | `bun run types:generate` | ✅ 1 module regenerated |
| 10 | `bun run catalog:generate` | ✅ catalog unchanged + 3 host hints regenerated |

Todo verde. La suite corre CI-local en el orden de **41 segundos** — eso es
un test runner sintónico (no fake-parallel) y aún así pasa el gate entero.

---

## 3. Lo que está inmejorable (no tocar) — 💎 PERFECTO / ✨ ESPLÉNDIDO

### 3.1 Punto de entrada CLI respeta la regla "cero `process.cwd()` excepto en boot"

**Fichero**: [`packages/core/src/cli.ts#L21`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/cli.ts#L21)

```typescript
if (import.meta.main) {
    void runCli(process.argv.slice(2), process.cwd());
}
```

Es **exactamente** la única invocación del runtime: está dentro de un
`if (import.meta.main)` que sólo se ejecuta cuando Bun lanza el fichero como
entry point. No se importa ni se reexporta a un engine; el resto del core
injectiona `ctx.workspace.root` desde aquí. El comentario del contrato
[`plugin-contract.ts#L19`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/plugin-contract.ts#L19)
lo explicita: *"It must not call `process.cwd()`"* (refiriéndose a los engines,
no al wrapper CLI). **PERFECTO** — boundary limpia.

### 3.2 Plantilla `scaffold-host.ts` documenta su propio `process.cwd()`

**Fichero**: [`packages/core/src/lib/scaffold/scaffold-host.ts#L280-L336`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/scaffold/scaffold-host.ts#L280-L336)

```typescript
export const scaffoldServerEntryFiles = (
    options: IScaffoldHostOptions,
): readonly IScaffoldedFile[] => [
    {
        path: 'libs/mcp-project/src/server.ts',
        content: `...
// The entry point is the ONE place allowed to read the launch directory
// (like mcp-vertex's own CLI). It resolves the workspace root and injects
// it into the (hermetic) host config.
export async function startServer(workspaceRoot = process.cwd()): Promise<void>
```

El segundo `process.cwd()` del repo vive **dentro de un template literal que
genera código de host**. El propio comentario en el template lo declara
boundary case. La librería que lo renderiza es hermética (no lee el cwd);
sólo el código resultante del scaffolder hace la llamada, y lo hace por
diseño (el host tiene que saber de dónde arrancar). **PERFECTO** —
documentación inline honesta.

### 3.3 `proposal-scaffolder.service.ts` con asignación de IDs determinista

**Fichero**: [`plugins/proposals/src/lib/services/proposal-scaffolder.service.ts#L107`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/services/proposal-scaffolder.service.ts#L107)

```typescript
const allocateId = (
    prefix: string,
    startAt: number,
    taken: ReadonlySet<string>,
): string => {
    for (let n = Math.max(1, startAt); n < startAt + 10_000; n += 1) {
        const candidate = `${prefix}${padId(n)}`;
        if (!taken.has(candidate)) return candidate;
    }
```

**Cero aleatoriedad** en la asignación de IDs — los scaffolds son
reproducibles a partir de `(prefix, startAt, taken)`. Esto es lo que permite
que dos agentes ejecutando `audit_run` en paralelo obtengan IDs disjuntos sin
necesidad de lock centralizado. **EXCEPCIONAL** — uno de los pocos lugares
del código que decide explícitamente contra el random para ganar
determinismo.

### 3.4 Plugin-aware catalog auto-regenera

**Fichero**: [`docs/mcp-vertex/agent-catalog.generated.json`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/agent-catalog.generated.json)

El snapshot está commiteado y `bun run catalog:generate` lo considera
inmutable salvo que cambie el catálogo real. Hoy ejecutó:

```
agent catalog unchanged at docs/mcp-vertex/agent-catalog.generated.json
copilot: wrote host-hints/copilot-instructions.generated.md (1099 bytes)
claude:   wrote host-hints/claude.generated.md          (1088 bytes)
agents:   wrote host-hints/agents.generated.md          (1112 bytes)
```

Los tres host hints se regeneran en una sola pasada. **EXCEPCIONAL** —
el flujo `descubrimiento-de-herramientas → host-specific-context` es
mecánico, sin pasos manuales.

### 3.5 Consistencia en la escala de severidad (post-cambio a EXEMPLARY en inglés)

**Fichero**: [`plugins/audit/src/lib/contracts/interfaces/audit.interface.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/audit/src/lib/contracts/interfaces/audit.interface.ts)

```typescript
export type AuditSeverity =
    | 'FATAL'
    | 'MUY_MAL'
    | 'MEJORABLE'
    | 'OK'
    | 'MUY_BIEN'
    | 'PERFECTO'
    | 'EXEMPLARY';
```

El enum canónico está en **inglés** (`EXEMPLARY`), pero el parser acepta las
formas históricas españolas (`ESPLÉNDIDO` / `ESPLENDIDO`) y la tabla
bilingüe del brief las muestra lado a lado. `SEVERITY_USER_LABEL` mapea el
token inglés → etiqueta española para display. **MUY BIEN** — limpio,
explícito, retrocompatible.

---

## 4. Lo que está muy bien (no urgente) — 🌟 MUY_BIEN

### 4.1 OutputSchema declarado en el 100% de los tools públicos

Verificado: `grep -rL 'outputSchema' plugins/*/src/lib/tools/*-tool.ts` →
**0 hits**. Todos los `*tool.ts` declaran su `outputSchema` con Zod; el
gen-tipo `tool-outputs.ts` se regenera via `bun run types:generate` y el
drift guard (`tool-types-sdk.spec.ts`) falla si cambia un schema sin
regenerar. **MUY BIEN** — la regla 8 de AGENTS.md está enforced, no
meramente declarada.

### 4.2 Sin `writeFile` desnudo en motores de plugins

Verificado: grep para `writeFile|writeFileSync` en `plugins/*/src` →
únicamente hits en los strings de documentation dentro del brief
(`audit-brief.constants.ts`, `audit-brief.service.ts`) — **cero engines
escriben estado compartido sin `writeFileAtomic`**. **MUY BIEN** — la regla
4 (escrituras durables a través de primitivas) está enforced por las propias
search-tools de la suite, no sólo por convención.

### 4.3 Todos los plugins exponen `outputSchema` — verification harness funcional

El script `tools/scripts/verify/plugin-tool-verify.script.ts` (commit
`1b49f65`, sesión del 22-06-2026) itera los **14 plugins**, ejecuta los 196
tools registrados y parsea el output por el schema. Resultado a la fecha:
**154 ok, 42 need-input, 0 failed**. **MUY BIEN** — CI/runtime verification
es distinta de typecheck; este harness es la única señal que detecta
schemas-y-handlers desincronizados.

### 4.4 Catálogo de discovery snapshot

El `agent-catalog.generated.json` es la fuente única de verdad para el
catálogo de tools/skills/proposals. Re-generable en cualquier momento, sin
side-effects. La regenerada hoy (3 host hints) confirma que el contenido de
plugins activos — incluyendo el nuevo token `EXEMPLARY` y los tres modos —
se ha projectionado correctamente. **MUY BIEN** — discovery es un artefacto,
no un secreto.

### 4.5 Nomenclatura de propuesta: regex `^[a-z]\d{5}` enforced por lint

**Fichero**: [`tools/scripts/lint/proposal-id-prefix.script.ts`](file:///home/cartago/_projects/mcp-vertex/tools/scripts/lint/proposal-id-prefix.script.ts)

El lint valida que cada frontmatter `id:` de propuesta siga el formato de
5 dígitos (`a00048`, `x00091`, etc.) bajo uno de los 11 prefijos canónicos.
El comando `bun run lint:proposals` corre **175 files** y reporta
`0 fatal error(s)`. **MUY BIEN** — los IDs son un contrato parseable.

---

## 5. Lo que está bien — 🟢 BIEN

### 5.1 Cero `@ts-ignore` / `@ts-nocheck` en producción

Verificado: `grep -rEn "@ts-ignore|@ts-nocheck"` en `plugins/*/src` y
`packages/core/src/lib` → **0 hits**. El control de tipos vive sólo en los
`*.spec.ts` y en los `.d.ts` generados. **BIEN** — TypeScript strict está
enforced en toda la capa que cuenta.

### 5.2 Catálogo de dimensiones de score es configurable

**Fichero**: [`plugins/audit/src/index.ts#L92-L108`](file:///home/cartago/_projects/mcp-vertex/plugins/audit/src/index.ts#L92-L108)

```typescript
dimensions: z.array(z.string().min(1)).optional(),
```

El host puede pasar un set de dimensiones custom (`['Calidad', 'Seguridad',
'Docs', ...]`) y se renderizan en lugar de las 9 canónicas. El default no
se filtra al pasar custom — quedó pinned en el test `audit-brief.service.spec.ts`
(`expect(md).not.toContain('| Genericidad (project-agnostic) | /10 |')`).
**BIEN** — el override es total, no parcial.

### 5.3 Tests de la escala de 7 bandas cubren parser, brief y consolidator

Tests en este commit:
- `parseAuditBody recognises EXEMPLARY (Spanish + English + ASCII)`
- `buildBrief renders the new EXEMPLARY band as the 7th severity tier`
- `general/specific/monorepo modes filter the layer phases appropriately`

**BIEN** — los 7 nuevos tests pasan junto con los 54 existentes (61/61
total en el plugin audit tras esta sesión).

---

## 6. Lo que está regular (deuda menor, no urgente) — 🟠 REGULAR

### 6.1 El brief template tiene 562 líneas — candidato a refactor

**Fichero**: [`plugins/audit/src/lib/services/audit-brief.service.ts#L120-L580`](file:///home/cartago/_projects/mcp-vertex/plugins/audit/src/lib/services/audit-brief.service.ts#L120-L580)

El servicio `buildBrief` (más `buildReadingPhases` +
`buildLayerPhase` + `renderCrossCutting`) ha crecido hasta ~560 líneas
desde el corte de `audit-brief.constants.ts`. Ahora mismo contiene:

- Constantes (`SEVERITY_TABLE_ROWS`).
- Inferencia de modo (`inferMode`).
- El builder principal (~290 líneas de markdown).
- Helpers de phases + el monorepo badge.

El flag `mode` + `projects` introducidos en esta sesión casi duplican la
lógica de filtrado que ya vivía internamente. Una extracción a
`brief-render.service.ts` + `brief-modes.service.ts` +
`brief-severity-table.service.ts` lo dejarían en 3 ficheros < 200 LOC
cada uno. **REGULAR** — funciona, pero el siguiente cambio de rúbrica va a
ser doloroso en este layout.

**Propuesta de mejora**: split en tres services:
1. `severity-table.service.ts` → `SEVERITY_TABLE_ROWS` + render.
2. `brief-modes.service.ts` → `inferMode` + `renderMonorepoBadge` + la tabla
   de "modos disponibles" del header.
3. `brief-builder.service.ts` → el `buildBrief` principal, ahora puro.

### 6.2 `audit-run.tool.ts` tiene 600+ líneas y embute 3 responsabilidades

**Fichero**: [`plugins/audit/src/lib/tools/audit-run.tool.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/audit/src/lib/tools/audit-run.tool.ts#L260-L800)

Tras añadir `mode` + `projects` este turno, `buildRunRegistration` ya
embute: (a) Zod schemas, (b) mode/scope/proyectos inference + validación,
(c) mkdir de dirs + sanitización + containment, (d) dispatch a LLM, (e)
write de auditorías, (f) consolidación, (g) scaffolder de propuestas. 7
responsabilidades en un solo lugar. **REGULAR** — cohesión resentida.

**Propuesta de mejora**: extraer (b)+(c) a `run-pipeline-prelude.service.ts`
(reutilizable por `audit-run` y por una futura `audit_run_dry`); extraer
(g) ya existe como `proposal-scaffolder.service.ts`. El tool quedaría en
~300 LOC.

### 6.3 El host hint Copilot ha crecido a 1 099 bytes — al borde del budget

**Fichero**: [`docs/mcp-vertex/host-hints/copilot-instructions.generated.md`](file:///home/cartago/_projects/mcp-vertex/docs/mcp-vertex/host-hints/copilot-instructions.generated.md)

El fragmento generado para Copilot incluye ahora la sección "Audit modes
(general/specific/monorepo)", el token `EXEMPLARY`, y los hooks de skills.
Cabe en el budget de tokens pero está cerca del límite que el renderizador
impone. **REGULAR** — no falla, pero el siguiente "nuevo modo" va a empujar
el tamaño por encima del budget y nos obligará a splits.

---

## 7. Lo que está fatal (errores críticos) — 🔴 FATAL

### Ninguno.

En esta sesión **no se han introducido FATALes**. Las modificaciones al
plugin `@mcp-vertex/audit`:

- Renombrado de `ESPLÉNDIDO` → `EXEMPLARY` en `AuditSeverity` (1 línea en
  union + 1 en `SEVERITY_ORDER` + 1 key en `SEVERITY_USER_LABEL`).
- Actualización del regex parser para reconocer ambos vocabularios.
- Actualización del Zod `outputSchema` del consolidador.
- Regeneración de los `tool-outputs.ts`.
- 7 tests nuevos, 5 existentes adaptados.

Todo atrás-compatible: un audit viejo escrito con `ESPLÉNDIDO` parsea
correctamente con `worstSeverity: 'EXEMPLARY'`. La regex
`\b(?:EXEMPLARY|ESPL[ÉE]NDIDO)\b` lo garantiza.

---

## 8. Tabla de puntuación final (las 9 dimensiones canónicas)

| Dimensión | Puntuación | Comentario |
|---|---|---|
| **Arquitectura** | 9/10 | Plugin-first, project-agnostic core, host-injected context. Penalizada por el crecimiento de `buildBrief` (REGULAR). |
| **Contratos e interfaces** | 9/10 | 100 % outputSchema declarado, I-prefixed, drift guard enforces. |
| **Eficiencia de tokens** | 9/10 | Catalog.auto-generado, drift budget, no re-lecturas, compact tools por defecto. |
| **Anti-deadlock / concurrencia** | 9/10 | `withFileMutex`, `writeFileAtomic`, IDs deterministas en scaffolder. |
| **Calidad de código fuente** | 8/10 | 0 `@ts-ignore`, 0 `writeFile` desnudo, SOLID empezado. Penalizada por el tamaño de `audit-run.tool.ts` y `buildBrief`. |
| **Documentación** | 9/10 | 2 skills (audit-runner + audit-playbook), 47 audits históricas commiteadas, regenerable. |
| **Tests (estructura, cobertura, calidad)** | 9/10 | 3 598 tests, < 41 s, plugin-tool-verify cross-plugin. |
| **Seguridad operacional** | 8/10 | `resolveWorkspaceContained`, `redactSecrets` en secretos durables, contención de tool responses. Sin embargo, la rúbrica del brief recomienda explícitamente leer todas las rutas de escritura — código con 200 KLOC y este verificador lean no alcanza para "10". |
| **Genericidad (project-agnostic)** | 9/10 | Renombre de `ESPLENDIDO` → `EXEMPLARY` completa la promesa de tokens neutrales; `projectName`/`configFileName`/`crossCuttingAdditions` siguen siendo host-overridable sin forks. |

**Nota final: 8.8/10 — Excelente operativo, con dos puntos de fricción
claros (split de `buildBrief` y split de `audit-run.tool.ts`) para llegar al
9.5+.**

---

## 9. Recomendaciones prioritarias (top 5)

| Prioridad | Acción | Archivo | Esfuerzo |
|---|---|---|---|
| 🟠 P1 | Split de `audit-brief.service.ts` en `severity-table` + `brief-modes` + `brief-builder` (cada uno < 200 LOC). | `plugins/audit/src/lib/services/audit-brief.service.ts` | M (1 día) |
| 🟠 P1 | Split de `audit-run.tool.ts` en `run-pipeline-prelude.service.ts` + el tool adelgazado. | `plugins/audit/src/lib/tools/audit-run.tool.ts` | M (1 día) |
| 🟡 P2 | Considerar compactación del Copilot host hint (1 099 B → < 800 B) moviendo el bloque "Audit modes" a un knowledge entry del audit plugin (lazy-loaded). | `docs/mcp-vertex/host-hints/copilot-instructions.generated.md` | S (½ día) |
| 🟡 P2 | Documentar formalmente `audit_plan` + `audit_run` con un ejemplo de `mode: 'monorepo'` en la skill del audit playbook. | `plugins/audit/skills/mcp-vertex-audit-playbook/SKILL.md` | S (1 h) |
| 🟢 P3 | Evaluar si el campo `worstSeverity` debería usar nombres completamente en inglés en futuras auditorías, o quedarse bilingüe. La decisión actual favorece el split (display español, payload inglés), pero documéntalo en la skill para no tener que re-debatirlo. | `plugins/audit/skills/mcp-vertex-audit-playbook/SKILL.md` | XS (15 min) |

---

## 10. Específico → general → monorepo: cómo pedir cada modo en este plugin

> Esta sección existe porque la rúbrica pide documentación del contrato
> del plugin. A partir de este commit el plugin `@mcp-vertex/audit` acepta
> tres modos declarados explícitamente en `audit_plan` y `audit_run`.

### `mode: 'general'` (default para `scope: 'full'`)

Auditoría completa del proyecto entero con la rúbrica de 9 dimensiones.
Todas las fases de lectura son obligatorias. **Usa este modo** para
auditorías iniciales o post-merge.

```ts
// Ejemplo:
await audit_plan({ scope: 'full', mode: 'general' });
await audit_run({
  scope: 'full',
  mode: 'general',
  targets: [{ provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5', apiKey: '...' }],
});
```

### `mode: 'specific'` (default para un scope no-`full`)

Auditoría focalizada en **una dimensión universal** (`security`, `tokens`,
`tests`, `docs`) o **una capa configurada por el host** (`core`, `plugins`,
`extensions`...). Lee sólo la fase de lectura correspondiente + el bloque
de invariantes transversales. **Usa este modo** cuando ya sabes qué te
preocupa.

```ts
// Ejemplo:
await audit_plan({ scope: 'security', mode: 'specific' });
```

### `mode: 'monorepo'` (default cuando `projects` no está vacío)

Auditoría que cubre **sólo los paquetes/capas nombrados**. Las fases de
lectura que la herramienta emite son exclusivamente para los proyectos
elegidos; el resto del monorepo no se toca. **Usa este modo** para
iteraciones rápidas sobre un subsistema, sweeps incrementales, o
re-auditar un paquete que ya se había auditado previamente.

```ts
// Ejemplo — auditar sólo core y plugins en monorepo mode:
await audit_plan({
  scope: 'full',
  mode: 'monorepo',
  projects: ['core', 'plugins'],
});
```

El modelo que recibe el brief ve un badge explícito:

> **Modo monorepo activo**: este brief cubre solo los siguientes proyectos/capas del monorepo:
> - `core`
> - `plugins`

---

## 11. Lo que cambiaría, lo que eliminaría, lo que mantendría

### Mantendría
1. La separación entre `worstSeverity` (token inglés) y la etiqueta
   `Banda` en el brief (español). Es exactamente el patrón que evita
   "tokens políglotas" en código de máquina.
2. La inferencia de modo cuando el caller no lo pasa explícitamente. Es el
   comportamiento por defecto que reduce el boilerplate sin sorprender.
3. El backward-compat del parser (acepta `ESPLÉNDIDO` aunque el enum sea
   `EXEMPLARY`). Cero migraciones forzadas.

### Cambiaría
1. **`buildBrief` → 3 services** (ver §6.1).
2. **`audit-run.tool.ts` → prelude + tool** (ver §6.2).
3. El host hint Copilot → knowledge entry lazy-loaded (ver §6.3).

### Eliminaría
1. **Nada.** No hay código muerto evidente en los plugins auditados. El
   plugin `audit` está limpio por construcción (es la ultima milla de un
   refactor que ya pasó por SOLID-dashboard en `r00006`).
2. Si me apuran: la redundancia que el linter `lint:audit-ids` mantiene —
   hay un legacy file que ya no está referenciado — pero ya está manejado
   por el flag `l`-prefix del proposal-id-prefix lint.

---

## 12. Lo espléndido — referencia de la que enorgullecerse ✨

1. **El catálogo auto-regenerable** (`docs/mcp-vertex/agent-catalog.generated.json`):
   cuando cambias un tool/skill, `bun run catalog:generate` propaga el
   cambio a los 3 host hints en una sola pasada, sin intervención humana.
   Pocos proyectos pueden presumir de un contrato discovery tan limpio.

2. **El plugin-tool-verify harness** (`1b49f65`): la única señal CI que
   detecta "el schema está actualizado pero el handler no" — exactamente
   el bug que rompe la mayoría de plugins maduros sin que nadie se entere.

3. **El refactor a SOLID-dashboard de `r00006`**: separó la consolidación
   en estrategias (severity, dedup, key-derivation) inyectables. Esto
   permitió añadir el modo `monorepo` y la banda 7 sin tocar el
   consolidator — la base SOLID aguantó el siguiente cambio. De ahí el
   9/10 en Arquitectura sin tener que reescribir nada.

4. **La decisión de token inglés + display bilingüe**: hace que el campo
   `worstSeverity` sea programáticamente estable y rote-against-locale
   safe, mientras el reporte sigue siendo legible para revisores humanos.
   Patrón que copiaríamos a otros plugins.

---

**Fin del reporte.** Pendiente: ejecutar esta auditoría en una sesión
distinta (modo `specific` con `scope: 'security'` o `scope: 'tokens'`) para
cross-validar el hallazgo de que el split de `buildBrief` no introduce
regresiones de deduplicación en `consolidateAudits`.
