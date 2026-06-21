---
id: f00024
kind: feat
title: Cascade priority por kind (12 + alias p) con override por frontmatter, refactor SOLID
status: ready
type: proposal
track: proposals-plugin+workflow
date: 2026-06-21
related:
    - f00016 # proposal state machine — defines PROPOSAL_KINDS, the 7-status DFA; f00024 must not break it
    - f00023 # renumber IDs to padded 5 digits — independent; f00024 doesn't depend on f00023 and shouldn't wait for it
---

# f00024 — Cascade priority por kind (12 + alias p) con override por frontmatter, refactor SOLID

## Goal

Hoy `proposal-workflow.ts` declara el cascade así:

```ts
families: [
    { prefix: 'f', description: 'fixes (highest cascade priority)', cascadePriority: 0 },
    { prefix: 'p', description: 'proposals (planned work)',         cascadePriority: 1 },
],
```

Esto está **roto contra el catálogo real**:

| Prefijo en el glossary (f00016) | Kind canónico       | Uso real en disco                                              | ¿Cubierto hoy? |
|-------------------------------|---------------------|----------------------------------------------------------------|----------------|
| `x`                           | `fix`               | `x00004`, `x00002`, `x00003`, `x00001`, `x00005`, `x00006`, `x00007`         | **NO**         |
| `b`                           | `breaking`          | (ninguno aún)                                                  | NO             |
| `a`                           | `audit`             | `a00007..a00025` (20 en done/audits/ + 4 en ready)                 | NO             |
| `c`                           | `chore`             | (ninguno aún)                                                  | NO             |
| `f`                           | `feat`              | `f00004..f00022` (10 en done/feats/ + 4 en ready + 1 in-progress)    | sí (pero descrito como "fixes", lo cual es mentira) |
| `r`                           | `refactor`          | (ninguno aún)                                                  | NO             |
| `v`                           | `perf`              | (ninguno aún)                                                  | NO             |
| `d`                           | `docs`              | (ninguno aún)                                                  | NO             |
| `t`                           | `test`              | (ninguno aún)                                                  | NO             |
| `i`                           | `infra`             | (ninguno aún)                                                  | NO             |
| `s`                           | `spike`             | (ninguno aún)                                                  | NO             |
| `l`                           | `legacy`            | `l99..f00032`                                                    | NO             |
| `p`                           | alias de `legacy`   | (ninguno en disco desde f00016 S11)                              | sí (descrito como "proposals planned", lo cual es mentira) |

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
  - El cascade se computa como una **cadena de resolvers** (`ICascadePriorityResolver` + composición Chain of Responsibility). El primer eslabón es `KindCascadePriorityResolver` (orden por kind); el segundo es `FrontmatterOverrideResolver` (decorador que aplica `cascadeOverride` y `cascadeBoost`). Los consumers pueden añadir más eslabones sin tocar a los existentes.
  - El array de familias se construye en una **factory** `buildProposalFamilies()` que recibe `IProposalKinds` (no la constante global), testable con kinds sintéticos.
  - Cada proposal puede declarar `cascadeOverride: <int>` **y, obligatoriamente, `cascadeOverrideReason: <string>`** (linter-enforced). El reason queda registrado en el log de `proposal_auto_work` para auditoría.
  - Cada proposal puede declarar `cascadeBoost: 'shipped-blocking' | 'customer-reported' | 'security'` (string union, extensible). El boost desplaza al proposal al **frente de su kind** (no antes que kinds más urgentes), evitando que un `f*` con boost salte por encima de un `x*` real.
- [ ] `proposal_auto_work` (el motor que decide el orden) usa el resolver; los tests verifican que `x*` cascadea antes que `f*` y que un proposal con `cascadeOverride: -1` cascadea antes que todos los de su kind.
- [ ] `get_proposal_workflow` actualiza su `outputSchema` para incluir el campo `cascadeOverride?: number` en la familia (o como campo separado de "overrides disponibles" — ver §Decisión de schema).
- [ ] `apps/web/src/i18n/tools/proposals_get_proposal_workflow.ts` (es/en/...) añade la traducción del campo nuevo si es user-visible.
- [ ] `bun run validate` (typecheck + lint + tests) verde. Se añaden ≥ 8 tests nuevos (uno por cada kind activo + override + default).
- [ ] El test del cascade priority es **puro** (no toca disco, no lee el `index.json`): inyecta el resolver y prueba con proposals sintéticos.

## why this design

Las decisiones de schema, estructura y orden viven en esta sección, desglosadas en subsecciones.

### Orden por defecto

El orden codifica dos principios: **(1) los fixes de bugs son lo más urgente** (rompen a usuarios), **(2) los breaking changes deben salir antes que los features nuevos** (porque rompen a integradores). El bump semver es el proxy de severidad que ya usa Conventional Commits.

| Rank | Prefix | Kind       | conventionalCommitType | Bump   | Justificación                                                          |
|------|--------|------------|------------------------|--------|------------------------------------------------------------------------|
| 0    | `x`    | `fix`      | `fix`                  | patch  | Bug confirmado en producción → primero.                                |
| 1    | `b`    | `breaking` | `feat!`                | major  | Breaking changes erosionan confianza si se atrasan.                    |
| 2    | `a`    | `audit`    | `chore(audit)`         | patch  | Las auditorías cierran hallazgos del master audit (a00013).              |
| 3    | `c`    | `chore`    | `chore`                | patch  | Chore de workflow (como f00024) suele desbloquear otros slices.         |
| 4    | `f`    | `feat`     | `feat`                 | minor  | Features nuevos, pero solo después de que lo urgente está cubierto.    |
| 5    | `r`    | `refactor` | `refactor`             | patch  | Mejora interna sin cambio de comportamiento — nunca urgente.           |
| 6    | `v`    | `perf`     | `perf`                 | patch  | Optimización — solo cuando hay medida que diga "esto va mal".          |
| 7    | `d`    | `docs`     | `docs`                 | none   | Documentación — backlog natural, no bloquea releases.                  |
| 8    | `t`    | `test`     | `test`                 | none   | Tests que cierren coverage gaps surgidos de audits.                    |
| 9    | `i`    | `infra`    | `chore(infra)`         | none   | CI/build/scripts — solo cuando bloquea a otro slice.                   |
| 10   | `s`    | `spike`    | `''`                   | none   | Spikes son investigación; pueden esperar al final.                     |
| 11   | `l`    | `legacy`   | `feat`                 | minor  | Legacy imports; históricamente cerrados, no activos.                  |
| 12   | `p`    | legacy alias | `feat`               | minor  | Alias pre-f00016; no debería tener archivos nuevos.                      |

> **Razón para que `x` (fix) gane a `b` (breaking)**: un fix arregla algo roto HOY; un breaking es un cambio que va a romper MAÑANA. Lo roto-ahora gana sobre lo-que-romperá-después.

### Boosts (desplazamiento intra-kind, no inter-kind)

Un boost NO cambia la prioridad absoluta del proposal; solo lo mueve al **frente de su mismo kind**. Esto preserva el principio de "los fixes siempre ganan a las features" — un `f*` con `cascadeBoost: shipped-blocking` sigue cascadeando **después** de cualquier `x*` sin boost.

| Boost value             | Significado                                                     | Penalización |
|-------------------------|-----------------------------------------------------------------|--------------|
| `shipped-blocking`      | Bloquea un release ya planificado (e.g. release notes drafted). | priority -= 0.5 dentro de su kind |
| `customer-reported`     | Reportado por un usuario con severity alta (P0/P1).             | priority -= 0.3 dentro de su kind |
| `security`              | Cierra un hallazgo de seguridad de una auditoría.              | priority -= 0.5 dentro de su kind |
| (sin boost)             | Sin tratamiento especial.                                       | 0            |

**Por qué un boost no salta inter-kind**: la regla "`x` antes que `f`" es un invariante de seguridad del cascade (un fix no puede quedar atrapado detrás de un feat). Si un `f*` con boost saltara por encima de un `x*`, reintroduciríamos el bug que arregla esta propuesta. Si necesitas que un `f*` corra antes que un `x*`, usa `cascadeOverride: -1` con su reason — eso es un break-glass, no un atajo.

### Decisión de schema (kind, override, boost)

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
    "f00022": -1,
    "x00006": 0
  }
}
```

**Recomendación**: opción A por ahora (KISS). Si en el futuro hace falta overrides dinámicos, se migra a B sin breaking change (campo adicional). La propuesta elige **A**.

### Estructura SOLID propuesta

El código actual es un módulo con una función `buildProposalWorkflow` que devuelve un objeto literal. Para aplicar SOLID, se descompone así:

### Single Responsibility (SRP)

- `cascade/cascade-priority.ts` (nuevo): solo define el orden por defecto, los boosts, y los resolvers componibles.
- `cascade/cascade-chain.ts` (nuevo): compone la cadena default (kind resolver + frontmatter resolver).
- `proposal-workflow.ts` (existente): solo arma el `IProposalWorkflow` (locations, naming, rules, template). No sabe nada de boosts u overrides.
- `get-proposal-workflow.tool.ts` (existente): solo expone el tool MCP, llamando a los anteriores.

### Open/Closed (OCP) + Chain of Responsibility

```ts
// plugins/proposals/src/lib/cascade/cascade-priority.ts

export type TCascadeBoost = 'shipped-blocking' | 'customer-reported' | 'security';

export interface IProposalSummary {
    readonly id: string;
    readonly kind: IProposalKind;
    /** Break-glass: any proposal can pin itself to a numeric priority. */
    readonly cascadeOverride?: number;
    /** Mandatory if cascadeOverride is set: human-readable reason for audit. */
    readonly cascadeOverrideReason?: string;
    /** Intra-kind boost: moves the proposal to the front of its kind. */
    readonly cascadeBoost?: TCascadeBoost;
}

export interface ICascadePriorityResolver {
    /** Resolves the absolute priority. Lower = higher cascade. */
    resolve(proposal: IProposalSummary): number;
    /** Optional hook: whether this resolver "claims" the proposal. */
    accepts?(proposal: IProposalSummary): boolean;
}

/** Step 1 of the chain: priority by kind. */
export class KindCascadePriorityResolver implements ICascadePriorityResolver {
    constructor(
        private readonly kindOrder: ReadonlyMap<IProposalKind, number>,
        private readonly boostPenalties: ReadonlyMap<TCascadeBoost, number> = DEFAULT_BOOST_PENALTIES,
    ) {}

    resolve(p: IProposalSummary): number {
        const base = this.kindOrder.get(p.kind);
        if (base === undefined) return Number.POSITIVE_INFINITY;
        const penalty = p.cascadeBoost ? (this.boostPenalties.get(p.cascadeBoost) ?? 0) : 0;
        // Boosts lower the priority within the same kind — e.g. a feat with
        // shipped-blocking goes from rank 4 to 3.5, still behind any fix (rank 0).
        return base - penalty;
    }
}

const DEFAULT_BOOST_PENALTIES: ReadonlyMap<TCascadeBoost, number> = new Map([
    ['shipped-blocking', 0.5],
    ['customer-reported', 0.3],
    ['security', 0.5],
]);

/** Step 2 of the chain: break-glass override. Always wins (when present). */
export class FrontmatterOverrideResolver implements ICascadePriorityResolver {
    constructor(private readonly inner: ICascadePriorityResolver) {}

    resolve(p: IProposalSummary): number {
        if (typeof p.cascadeOverride === 'number') return p.cascadeOverride;
        return this.inner.resolve(p);
    }
}

// plugins/proposals/src/lib/cascade/cascade-chain.ts
export const buildDefaultCascadeChain = (): ICascadePriorityResolver =>
    new FrontmatterOverrideResolver(
        new KindCascadePriorityResolver(buildKindOrder(PROPOSAL_KINDS)),
    );
```

**Por qué Chain of Responsibility** (en vez de una sola clase con un if grande): cada eslabón tiene una sola razón de cambio. Si mañana quieres añadir un resolver que sube los proposals de un agente concreto, es una clase nueva + `buildDefaultCascadeChain` modificado en un solo punto. El linter puede validar que `cascadeOverride` venga siempre con `cascadeOverrideReason` (s4 lo cubre), y el log de `proposal_auto_work` registra el reason para auditoría.

### Liskov (LSP) + Dependency Inversion (DIP)

`proposal_auto_work` no instancia la cadena directamente — recibe un `ICascadePriorityResolver` por inyección. Los tests inyectan un resolver fake que devuelve orden alfabético o prioridades hardcoded, sin tocar el registry de proposals. La cadena default se construye vía `buildDefaultCascadeChain()`.

### Interface Segregation (ISP)

`IProposalSummary` solo tiene los 5 campos que el resolver necesita. No es un `IProposal` completo — eso sería ISP-violating (el resolver no necesita `status`, `track`, `title`, etc.).

## Slices

> Los slices s1-s4 son **file-disjoint entre sí** y pueden correr en paralelo. s0 es discovery puro (read-only) y es prerrequisito barato de s2/s3.

- **s0 — Discovery de callers externos del cascade (0 archivos productivos)**
  - files: [] (solo lee)
  - agent: `technical_investigator`
  - gate: `lint`
  - acceptance:
    - Grep exhaustivo de **todos los consumers** de `cascadePriority` y de `proposal-workflow.families[]` en `plugins/`, `packages/`, `apps/`. Salida: lista con path + línea + tipo de uso (lectura directa, iteración, destructuring, comparación).
    - Identifica si `status-marker` o `memory` plugins leen el cascade. Si lo hacen, clasifica el uso como "must preserve" o "can be deleted".
    - Salida en `docs/proposals/done/audits/aXXX-discovery-cascade-callers.md` (nuevo audit, no en `ready/` — es output de f00024, no una proposal).
  - dependsOn: []

- **s1 — Tipos y cadena de resolvers (4 archivos nuevos)**
  - files: [`plugins/proposals/src/lib/cascade/cascade-priority.ts`, `plugins/proposals/src/lib/cascade/cascade-chain.ts`, `plugins/proposals/src/lib/cascade/cascade-priority.spec.ts`, `plugins/proposals/src/lib/cascade/index.ts`]
  - agent: `proposal_guardian`
  - gate: `lint`
  - acceptance:
    - Define `IProposalSummary`, `ICascadePriorityResolver`, `KindCascadePriorityResolver`, `FrontmatterOverrideResolver`, `buildKindOrder`, `buildDefaultCascadeChain` como en §"Estructura SOLID".
    - `cascade-priority.spec.ts` cubre: (a) cada kind activo devuelve su rank, (b) `cascadeOverride: -1` gana sobre el rank, (c) `cascadeOverride: 99` pierde contra el rank 0, (d) un kind desconocido devuelve `+Infinity`, (e) un `f*` con `cascadeBoost: shipped-blocking` queda en rank 3.5, no en rank 0 (preserva el invariante "x antes que f"), (f) `cascadeOverride` sin `cascadeOverrideReason` falla con un error explícito (no silencioso).
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
    - El alias `p` se añade con `description: "legacy alias for l (pre-f00016) — kept for back-compat"`, `cascadePriority` = `kindOrder.get('legacy') + 1` (12).
    - La signature pública no cambia: `buildProposalWorkflow(proposalsDir, indexFile): IProposalWorkflow`.
    - **S2 NO depende de s1** — solo necesita la constante de orden, que s1 publica vía `buildKindOrder` (interfaz estable). Si s1 no ha mergeado, s2 importa la constante de orden directamente de `cascade-priority.ts` (que s1 deja commiteable incluso sin s2 listo).
  - dependsOn: [`s0`]

- **s3 — Wire up proposal_auto_work (1 archivo modificado)**
  - files: [`plugins/proposals/src/lib/proposals/proposal-auto-work.ts`]
  - agent: `implementation_runner`
  - gate: `e2e`
  - acceptance:
    - `proposal_auto_work` recibe `ICascadePriorityResolver` por DI (constructor o factory).
    - El default production wiring usa `buildDefaultCascadeChain()`.
    - El e2e test (ya existe para `proposal_auto_work`) sigue verde: cuando hay 3 proposals (`x1`, `f1`, `a1`), la respuesta devuelve `x1` primero.
    - Un test nuevo confirma que un `f*` con `cascadeBoost: shipped-blocking` (rank 3.5) cascadea **después** de un `x*` sin boost (rank 0) — invariante preservado.
    - Un test nuevo confirma que un proposal con `cascadeOverride: -5` cascadea antes que un `x*` normal.
    - El log de `proposal_auto_work` registra `cascadeOverrideReason` cuando se aplica un override (auditoría).
  - dependsOn: [`s0`, `s1`]

- **s4 — Schema + i18n + linter de override (3 archivos modificados)**
  - files: [`plugins/proposals/src/lib/contracts/schemas/get-proposal-workflow.schema.ts`, `apps/web/src/i18n/tools/proposals_get_proposal_workflow.ts`, `scripts/lint-proposals.ts`]
  - agent: `implementation_runner`
  - gate: `lint`
  - acceptance:
    - El schema Zod del output añade `kind: IProposalKind` como campo opcional de la familia (compatible hacia atrás con consumers que ignoren campos nuevos).
    - `bun run types:generate` regenera el SDK sin breaking change.
    - La descripción impresa del tool se actualiza en los 5 idiomas: `apps/web/src/i18n/ui.ts` (en, es, fr, de, ja) — el guard `apps/web/scripts/check-i18n.ts` falla el build si falta alguno.
    - **Linter nuevo en `scripts/lint-proposals.ts`**: si un `.md` declara `cascadeOverride:` en el frontmatter y NO declara `cascadeOverrideReason:`, falla con error (no warning). Esto cierra el riesgo de "override silencioso".
    - **Linter nuevo**: `cascadeBoost` solo acepta los valores del union `'shipped-blocking' | 'customer-reported' | 'security'`. Cualquier otro valor falla.
  - dependsOn: [`s2`]

- **s5 — Validación global (0 archivos productivos)**
  - files: []
  - agent: `delivery_verifier`
  - gate: `e2e`
  - acceptance:
    - `bun run validate` verde.
    - `bun run site:strict` verde (el proposals plugin no rompe la generación del sitio).
    - `get_proposal_workflow` devuelve exactamente 13 familias con `kind`, `prefix`, `description`, `cascadePriority` y `cascadePriority` en el orden de §"Orden por defecto".
    - Los callers externos identificados en s0 siguen funcionando: si el audit de s0 clasificó un caller como "must preserve", hay un test e2e que lo cubre.
  - dependsOn: [`s1`, `s2`, `s3`, `s4`]

## Coordination notes

- **f00023 (renumerar IDs) está en `ready/` pero no en progreso.** f00024 no depende de f00023: el cascade priority se basa en el **kind** del frontmatter, no en el número del ID. Si f00023 ejecuta antes, el `id` cambia pero el `kind` no, así que el cascade sigue funcionando. Si ejecuta después, también. **No hay conflicto**.
- **f00016 (state machine) es prerrequisito lógico, no de ejecución.** f00024 importa `PROPOSAL_KINDS` y `IProposalKind` de `proposal-glossary.constant.ts`, que f00016 ya exporta. f00024 NO modifica f00016.
- **Otros consumers del cascade** (si los hay en otros plugins, p.ej. status-marker o memory): segregan en el grep previo a s2. Si alguno lee `cascadePriority` directamente del `IProposalWorkflow.families[]`, sigue funcionando porque el campo se mantiene (mismo nombre, mismo tipo, mismo orden estable por prefix).

## Out of scope

- Reordenar los `kindOrder` por configuración (sigue siendo hardcoded en §"Orden por defecto"). Un override por-host en `mcp-vertex.config.json` puede ser una propuesta futura, no se mete aquí.
- Persistir el `cascadeOverride` por usuario/agente (override siempre viene del frontmatter, no del estado del swarm).
- Cambiar la cascada del **workflow de transiciones de status** (DFA de 7-status). Eso es f00016 §4.2, intacto. f00024 solo toca el cascade de **selección de propuesta a trabajar**, que es ortogonal.