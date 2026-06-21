---
id: f127
kind: chore
title: Cascade priority por kind (12 + alias p) con override por frontmatter, refactor SOLID
status: ready
type: proposal
track: proposals-plugin+workflow
date: 2026-06-21
related:
    - f113 # proposal state machine — defines PROPOSAL_KINDS, the 7-status DFA; f127 must not break it
    - f126 # renumber IDs to padded 5 digits — independent; f127 doesn't depend on f126 and shouldn't wait for it
---

# f127 — Cascade priority por kind (12 + alias p) con override por frontmatter, refactor SOLID

## Goal

Hoy `proposal-workflow.ts` declara el cascade así:

```ts
families: [
    { prefix: 'f', description: 'fixes (highest cascade priority)', cascadePriority: 0 },
    { prefix: 'p', description: 'proposals (planned work)',         cascadePriority: 1 },
],
```

Esto está **roto contra el catálogo real**:

| Prefijo en el glossary (f113) | Kind canónico       | Uso real en disco                                              | ¿Cubierto hoy? |
|-------------------------------|---------------------|----------------------------------------------------------------|----------------|
| `x`                           | `fix`               | `x105`, `x106`, `x111`, `x113`, `x122`, `x123`, `x124`         | **NO**         |
| `b`                           | `breaking`          | (ninguno aún)                                                  | NO             |
| `a`                           | `audit`             | `a001..a024` (20 en done/audits/ + 4 en ready)                 | NO             |
| `c`                           | `chore`             | (ninguno aún)                                                  | NO             |
| `f`                           | `feat`              | `f99..f125` (10 en done/feats/ + 4 en ready + 1 in-progress)    | sí (pero descrito como "fixes", lo cual es mentira) |
| `r`                           | `refactor`          | (ninguno aún)                                                  | NO             |
| `v`                           | `perf`              | (ninguno aún)                                                  | NO             |
| `d`                           | `docs`              | (ninguno aún)                                                  | NO             |
| `t`                           | `test`              | (ninguno aún)                                                  | NO             |
| `i`                           | `infra`             | (ninguno aún)                                                  | NO             |
| `s`                           | `spike`             | (ninguno aún)                                                  | NO             |
| `l`                           | `legacy`            | `l99..l127`                                                    | NO             |
| `p`                           | alias de `legacy`   | (ninguno en disco desde f113 S11)                              | sí (descrito como "proposals planned", lo cual es mentira) |

**Consecuencias observables**:

1. `proposal_auto_work` (el motor que decide "qué proposal trabajo ahora") usa `cascadePriority` para ordenar la cola. Hoy siempre prefiere `f*` sobre `p*`, pero los `f*` reales son **feats** y los fixes reales son `x*` que se quedan al final.
2. La descripción impresa por `get_proposal_workflow` confunde a cualquier agente nuevo: dice "fixes (highest cascade priority)" sobre un prefijo que en realidad contiene feats.
3. No hay forma de que un proposal individual se salte la cascada (p.ej. un `f*` urgentísimo que debe correr antes que cualquier `x*`). El override es por convención social, no por contrato.

**Esta propuesta** reescribe el cascade con:

1. **13 entradas** (12 kinds + alias `p`) ordenadas por **severidad de bump + urgencia operativa**, no por orden histórico.
2. **Override por frontmatter** (`cascadeOverride: <int>`): un proposal puede decir "yo soy priority = -5" y ganar a todos los de su kind.
3. **Refactor SOLID** del módulo para que añadir un kind nuevo o cambiar el resolver no toque a los consumidores.

## Acceptance

- [ ] `proposal-workflow.ts.buildProposalWorkflow()` devuelve un array de **13 familias**, una por cada key de `PROPOSAL_KINDS` + el alias `p`. Cada familia tiene `prefix`, `description` (derivada del kind: `"{kind} ({prefix}: prefix)"` para no mentir), y `cascadePriority` según el orden por defecto de §"Orden por defecto".
- [ ] Cada proposal puede declarar `cascadeOverride: <int>` en su frontmatter. Si está, ese valor gana sobre el de la familia (y sobre cualquier otro `cascadeOverride` numérico). Los consumers que llaman al resolver lo ven como un único número resuelto.
- [ ] El cascade se computa en una **interfaz `ICascadePriorityResolver`** con un método `resolve(proposal: IProposalSummary): number`. Hay una implementación default `KindCascadePriorityResolver` que mira kind + frontmatter override.
- [ ] El array de familias se construye en una **factory** `buildProposalFamilies()` que recibe `IProposalKinds` (no la constante global), testable con kinds sintéticos.
- [ ] `proposal_auto_work` (el motor que decide el orden) usa el resolver; los tests verifican que `x*` cascadea antes que `f*` y que un proposal con `cascadeOverride: -1` cascadea antes que todos los de su kind.
- [ ] `get_proposal_workflow` actualiza su `outputSchema` para incluir el campo `cascadeOverride?: number` en la familia (o como campo separado de "overrides disponibles" — ver §Decisión de schema).
- [ ] `apps/web/src/i18n/tools/proposals_get_proposal_workflow.ts` (es/en/...) añade la traducción del campo nuevo si es user-visible.
- [ ] `bun run validate` (typecheck + lint + tests) verde. Se añaden ≥ 8 tests nuevos (uno por cada kind activo + override + default).
- [ ] El test del cascade priority es **puro** (no toca disco, no lee el `index.json`): inyecta el resolver y prueba con proposals sintéticos.

## Orden por defecto

El orden codifica dos principios: **(1) los fixes de bugs son lo más urgente** (rompen a usuarios), **(2) los breaking changes deben salir antes que los features nuevos** (porque rompen a integradores). El bump semver es el proxy de severidad que ya usa Conventional Commits.

| Rank | Prefix | Kind       | conventionalCommitType | Bump   | Justificación                                                          |
|------|--------|------------|------------------------|--------|------------------------------------------------------------------------|
| 0    | `x`    | `fix`      | `fix`                  | patch  | Bug confirmado en producción → primero.                                |
| 1    | `b`    | `breaking` | `feat!`                | major  | Breaking changes erosionan confianza si se atrasan.                    |
| 2    | `a`    | `audit`    | `chore(audit)`         | patch  | Las auditorías cierran hallazgos del master audit (a016).              |
| 3    | `c`    | `chore`    | `chore`                | patch  | Chore de workflow (como f127) suele desbloquear otros slices.         |
| 4    | `f`    | `feat`     | `feat`                 | minor  | Features nuevos, pero solo después de que lo urgente está cubierto.    |
| 5    | `r`    | `refactor` | `refactor`             | patch  | Mejora interna sin cambio de comportamiento — nunca urgente.           |
| 6    | `v`    | `perf`     | `perf`                 | patch  | Optimización — solo cuando hay medida que diga "esto va mal".          |
| 7    | `d`    | `docs`     | `docs`                 | none   | Documentación — backlog natural, no bloquea releases.                  |
| 8    | `t`    | `test`     | `test`                 | none   | Tests que cierren coverage gaps surgidos de audits.                    |
| 9    | `i`    | `infra`    | `chore(infra)`         | none   | CI/build/scripts — solo cuando bloquea a otro slice.                   |
| 10   | `s`    | `spike`    | `''`                   | none   | Spikes son investigación; pueden esperar al final.                     |
| 11   | `l`    | `legacy`   | `feat`                 | minor  | Legacy imports; históricamente cerrados, no activos.                  |
| 12   | `p`    | legacy alias | `feat`               | minor  | Alias pre-f113; no debería tener archivos nuevos.                      |

> **Razón para que `x` (fix) gane a `b` (breaking)**: un fix arregla algo roto HOY; un breaking es un cambio que va a romper MAÑANA. Lo roto-ahora gana sobre lo-que-romperá-después.

## Decisión de schema

`get_proposal_workflow` actualmente devuelve:

```json
{
  "families": [
    { "prefix": "f", "description": "fixes (highest cascade priority)", "cascadePriority": 0 },
    { "prefix": "p", "description": "proposals (planned work)",         "cascadePriority": 1 }
  ],
  ...
}
```

**Opción A — añadir el override a la familia** (más simple, pero conceptualmente incorrecto: la familia no "tiene" un override, el override es por-proposal):

```json
{ "prefix": "x", "kind": "fix", "description": "fix (x: prefix)", "cascadePriority": 0, "defaultOverride": null }
```

**Opción B — campo separado** (más correcto, pero requiere un segundo array):

```json
{
  "families": [{ "prefix": "x", "kind": "fix", "cascadePriority": 0, "description": "fix (x: prefix)" }, ...],
  "overrides": {
    "f125": -1,
    "x123": 0
  }
}
```

**Recomendación**: opción A por ahora (KISS). Si en el futuro hace falta overrides dinámicos, se migra a B sin breaking change (campo adicional). La propuesta elige **A**.

## Estructura SOLID propuesta

El código actual es un módulo con una función `buildProposalWorkflow` que devuelve un objeto literal. Para aplicar SOLID, se descompone así:

### Single Responsibility (SRP)

- `cascade-priority.ts` (nuevo): solo define el orden por defecto y el resolver.
- `proposal-workflow.ts` (existente): solo arma el `IProposalWorkflow` (locations, naming, rules, template).
- `get-proposal-workflow.tool.ts` (existente): solo expone el tool MCP, llamando a los dos anteriores.

### Open/Closed (OCP)

```ts
// plugins/proposals/src/lib/cascade/cascade-priority.ts

export interface IProposalSummary {
    readonly id: string;
    readonly kind: IProposalKind;
    readonly cascadeOverride?: number;
}

export interface ICascadePriorityResolver {
    resolve(proposal: IProposalSummary): number;
}

/** Default impl: kind-order + optional frontmatter override. */
export class KindCascadePriorityResolver implements ICascadePriorityResolver {
    constructor(
        private readonly kindOrder: ReadonlyMap<IProposalKind, number>,
        private readonly aliasPenalty: number, // for the 'p' alias
    ) {}

    resolve(p: IProposalSummary): number {
        if (typeof p.cascadeOverride === 'number') return p.cascadeOverride;
        return this.kindOrder.get(p.kind) ?? Number.POSITIVE_INFINITY;
    }
}

/** Factory: build the default kind-order map from PROPOSAL_KINDS. */
export const buildKindOrder = (kinds: typeof PROPOSAL_KINDS): ReadonlyMap<IProposalKind, number> => {
    // Hard-coded in §"Orden por defecto"; lives here as data, not as scattered ifs.
    const order: ReadonlyArray<IProposalKind> = [
        'fix', 'breaking', 'audit', 'chore', 'feat', 'refactor',
        'perf', 'docs', 'test', 'infra', 'spike', 'legacy',
    ];
    const map = new Map<IProposalKind, number>();
    order.forEach((kind, idx) => map.set(kind, idx));
    return map;
};
```

### Liskov (LSP) + Dependency Inversion (DIP)

`proposal_auto_work` no instancia `KindCascadePriorityResolver` directamente — recibe un `ICascadePriorityResolver` por inyección. Los tests inyectan un resolver fake que devuelve orden alfabético o prioridades hardcoded, sin tocar el registry de proposals.

### Interface Segregation (ISP)

`IProposalSummary` solo tiene los 3 campos que el resolver necesita (`id`, `kind`, `cascadeOverride`). No es un `IProposal` completo — eso sería ISP-violating (el resolver no necesita `status`, `track`, `title`, etc.).

## Slices

- **s1 — Tipos y resolver (3 archivos nuevos)**
  - files: [`plugins/proposals/src/lib/cascade/cascade-priority.ts`, `plugins/proposals/src/lib/cascade/cascade-priority.spec.ts`, `plugins/proposals/src/lib/cascade/index.ts`]
  - agent: `proposal_guardian`
  - gate: `lint`
  - acceptance:
    - Define `IProposalSummary`, `ICascadePriorityResolver`, `KindCascadePriorityResolver`, `buildKindOrder` como en §"Estructura SOLID".
    - `cascade-priority.spec.ts` cubre: (a) cada kind activo devuelve su rank, (b) `cascadeOverride: -1` gana sobre el rank, (c) `cascadeOverride: 99` pierde contra el rank 0, (d) un kind desconocido devuelve `+Infinity`, (e) `p` alias nunca se consulta directamente (solo vía `legacy`).
    - 0 regresiones en `bun run test`.
  - dependsOn: []

- **s2 — Refactor proposal-workflow (1 archivo modificado)**
  - files: [`plugins/proposals/src/lib/knowledge/proposal-workflow.ts`]
  - agent: `implementation_runner`
  - gate: `lint`
  - acceptance:
    - `buildProposalWorkflow()` ya no hardcodea `[{prefix:'f', ...}, {prefix:'p', ...}]`. En su lugar, llama a `buildKindOrder(PROPOSAL_KINDS)` + `buildAliasFamilies()` para componer las 13 familias.
    - La `description` de cada familia es `"{kind} ({prefix}: prefix)"` (veraz, no "fixes" si es feat).
    - El array mantiene el orden de §"Orden por defecto".
    - El alias `p` se añade con `description: "legacy alias for l (pre-f113) — kept for back-compat"`, `cascadePriority` = `kindOrder.get('legacy') + 1` (12).
    - La signature pública no cambia: `buildProposalWorkflow(proposalsDir, indexFile): IProposalWorkflow`.
  - dependsOn: [`s1`]

- **s3 — Wire up proposal_auto_work (1 archivo modificado)**
  - files: [`plugins/proposals/src/lib/proposals/proposal-auto-work.ts`]
  - agent: `implementation_runner`
  - gate: `e2e`
  - acceptance:
    - `proposal_auto_work` recibe `ICascadePriorityResolver` por DI (constructor o factory).
    - El default production wiring usa `KindCascadePriorityResolver` con `buildKindOrder(PROPOSAL_KINDS)`.
    - El e2e test (ya existe para `proposal_auto_work`) sigue verde: cuando hay 3 proposals (`x1`, `f1`, `a1`), la respuesta devuelve `x1` primero.
    - Un test nuevo confirma que un proposal con `cascadeOverride: -5` cascadea antes que un `x*` normal.
  - dependsOn: [`s2`]

- **s4 — Schema + i18n (2 archivos modificados)**
  - files: [`plugins/proposals/src/lib/contracts/schemas/get-proposal-workflow.schema.ts`, `apps/web/src/i18n/tools/proposals_get_proposal_workflow.ts`]
  - agent: `implementation_runner`
  - gate: `lint`
  - acceptance:
    - El schema Zod del output añade `kind: IProposalKind` como campo opcional de la familia (compatible hacia atrás con consumers que ignoren campos nuevos).
    - `bun run types:generate` regenera el SDK sin breaking change.
    - La descripción impresa del tool se actualiza en los 5 idiomas: `apps/web/src/i18n/ui.ts` (en, es, fr, de, ja) — el guard `apps/web/scripts/check-i18n.ts` falla el build si falta alguno.
  - dependsOn: [`s2`]

- **s5 — Validación global (0 archivos productivos)**
  - files: []
  - agent: `delivery_verifier`
  - gate: `e2e`
  - acceptance:
    - `bun run validate` verde.
    - `bun run site:strict` verde (el proposals plugin no rompe la generación del sitio).
    - `get_proposal_workflow` devuelve exactamente 13 familias con `kind`, `prefix`, `description`, `cascadePriority` y `cascadePriority` en el orden de §"Orden por defecto".
  - dependsOn: [`s1`, `s2`, `s3`, `s4`]

## Coordination notes

- **f126 (renumerar IDs) está en `ready/` pero no en progreso.** f127 no depende de f126: el cascade priority se basa en el **kind** del frontmatter, no en el número del ID. Si f126 ejecuta antes, el `id` cambia pero el `kind` no, así que el cascade sigue funcionando. Si ejecuta después, también. **No hay conflicto**.
- **f113 (state machine) es prerrequisito lógico, no de ejecución.** f127 importa `PROPOSAL_KINDS` y `IProposalKind` de `proposal-glossary.constant.ts`, que f113 ya exporta. f127 NO modifica f113.
- **Otros consumers del cascade** (si los hay en otros plugins, p.ej. status-marker o memory): segregan en el grep previo a s2. Si alguno lee `cascadePriority` directamente del `IProposalWorkflow.families[]`, sigue funcionando porque el campo se mantiene (mismo nombre, mismo tipo, mismo orden estable por prefix).

## Out of scope

- Reordenar los `kindOrder` por configuración (sigue siendo hardcoded en §"Orden por defecto"). Un override por-host en `mcp-vertex.config.json` puede ser una propuesta futura, no se mete aquí.
- Persistir el `cascadeOverride` por usuario/agente (override siempre viene del frontmatter, no del estado del swarm).
- Cambiar la cascada del **workflow de transiciones de status** (DFA de 7-status). Eso es f113 §4.2, intacto. f127 solo toca el cascade de **selección de propuesta a trabajar**, que es ortogonal.