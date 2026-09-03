---
id: q00017
title: "Plan una sola ontología de capacidades: detección políglota real, manifiestos de host y el puente con Gentle-AI"
kind: plan
status: ready
type: proposal
track: architecture
date: 2026-09-03
---

# q00017 — Una sola ontología de capacidades

## Goal

Que mcp-vertex tenga **una** representación de "qué es este proyecto,
qué host lo ejecuta y qué herramientas hay disponibles", y que todo lo
demás derive de ella.

Hoy hay dos detectores que responden preguntas parecidas con modelos
distintos, y el modelo que ambos usan pierde información por diseño: es
escalar donde la realidad es plural.

## why

**Hay dos detectores.** `packages/core/src/lib/bootstrap/analyze-project.ts`
y `packages/core/src/lib/config/detect-stack.ts` contestan casi lo mismo
con formas distintas. El segundo es claramente mejor — detecta Astro,
Next, Remix, SvelteKit, Nuxt, NestJS, Hono, Django, FastAPI, Prisma,
Drizzle, Rust, Go — pero coexistir con el primero significa que dos
partes del sistema pueden creer cosas distintas sobre el mismo
repositorio.

**El modelo escalar pierde información, y es demostrable.** El contrato
promete plural:

```ts
readonly detectedLanguages: readonly string[];
```

Y la implementación es singular:

```ts
const out: string[] = [];
const primary = detectPrimaryLanguage(...);
if (primary !== 'unknown') out.push(primary);
return out;
```

Un array que sólo puede contener un elemento. En un repo con
`tsconfig.json`, `Cargo.toml` y `go.mod`, Rust y Go desaparecen: no es
una limitación documentada, es un contrato que dice una cosa y hace
otra.

`language-rules.ts` explica por qué: es first-match por prioridad
(TS 100, JS 60, Python 50, Go 40, Rust 30). Un backend FastAPI con un
frontend npm pequeño se clasifica como `javascript`, porque 60 > 50.

**`projectType` tiene el mismo defecto y es peor.** Es escalar sobre
`library | cli | webapp | game | monorepo | generic`, así que `monorepo`
impide saber qué contiene. La forma del workspace y los roles que hay
dentro son ortogonales; colapsarlos en un enum pierde justo la
información que un agente necesita para saber dónde tocar.

Con clasificaciones concretas mal resueltas hoy: cualquier Python con
`pyproject.toml` acaba en `library`, aunque sea Django o Celery; un Go
con el layout habitual `cmd/myapp/main.go` acaba en `library` porque la
detección de CLI busca `main.go` en la raíz; y `three` se toma como señal
directa de `game`, cuando Three.js se usa igual en CAD, visualización
científica y configuradores de producto.

**Y hay un patrón externo que merece copiarse.** Una revisión comparativa
con `Gentle-Programming/gentle-ai` señala que ese proyecto resuelve muy
bien un problema que aquí está disperso: declara un
`AgentCapabilityManifest` canónico por host y **valida que las
proyecciones antiguas no divergen de él**; si divergen, falla. Es el
mismo patrón de manifest + drift guard que este repo ya usa para plugins,
aplicado a hosts. No hay que copiar código Go: hay que copiar la forma.

## why this design

**Una ontología, muchos detectores enchufables.** El salto no es "más
detección", es que exista una fuente canónica de la que todo derive. Un
detector aporta señales con evidencia y confianza; el grafo las agrega.
Añadir un lenguaje pasa a ser añadir un detector, no editar un `if`.

**Roles ortogonales a la forma.** En vez de `projectType: "monorepo"`:

```ts
shape: { workspace: 'monorepo', roles: ['web-client', 'backend-api', 'library', 'cli'] }
```

Un monorepo puede tener cuatro roles a la vez, porque los tiene.

**Plural de verdad, con evidencia.** Cada lenguaje detectado llega con
qué fichero lo delató y con qué confianza. `primary` sigue existiendo
como conveniencia derivada, no como el único dato que sobrevive.

**Migración por adición, no por sustitución.** `detect-stack` es la base
buena: el grafo se construye sobre él y `analyze-project` pasa a ser un
adaptador de compatibilidad que deriva su forma antigua del grafo. Así no
hay un momento en que las dos verdades convivan.

**Detección distinta de selección autorizada.** Otra idea que vale la
pena del proyecto comparado: detectar que algo existe no es lo mismo que
estar autorizado a usarlo. El grafo detecta; la política decide.

## non-goals

- **NO** fusiona Gentle-AI dentro de mcp-vertex ni al contrario. Son
  planos distintos: uno configura hosts, el otro aporta capacidades de
  ingeniería en runtime. Este plan sólo construye la ontología y deja el
  puente como slice opcional al final.
- **NO** convierte a mcp-vertex en instalador global de agentes.
- **NO** añade una segunda memoria, un segundo workflow paralelo a
  `proposals` ni un segundo enrutado de modelos. Donde ya hay dueño, se
  mantiene el dueño.
- **NO** amplía la lista de lenguajes en esta iteración. Primero el
  modelo deja de perder información; ampliar cobertura sobre un modelo
  que descarta datos es trabajo perdido.

## Slices

- global_gate: lint, types, test

### S1 — El contrato del grafo de capacidades

- **Status**: done
- **Files**:
  - `packages/contracts/src/capability-graph.interface.ts` — `ICapabilityGraph`, `ICapabilitySignal`, `IProjectShape`, `IProjectRoleFinding` y sus vocabularios. En `contracts` porque es TypeScript puro y un consumidor externo no debe arrastrar el runtime para leer la forma de un proyecto. La señal lleva `source`, `evidence` (el fichero o clave que la produjo) y `confidence`; sin evidencia no es una señal, es una opinión.
  - `packages/contracts/tests/src/capability-graph.spec.ts` — fixture tipado de un proyecto políglota con varios roles y evidencia, más el resultado vacío honesto.
- **Gate**: lint, types

### S2 — Lenguajes en plural, con evidencia

- **Status**: done — `f3fa13adf`, corregida en `622c3bc4d`. Verificado sobre la aceptación del propio plan: `tsconfig.json` + `Cargo.toml` + `go.mod` devuelve los tres con evidencia (typescript←tsconfig.json, go←go.mod, rust←Cargo.toml). Dos pérdidas de información en espejo se arreglaron por el camino: la primera versión BORRABA `javascript` en cuanto aparecía cualquier otro lenguaje — el mismo modelo escalar, apuntando al revés — y los `priority` seguían siendo el orden de una cascada, así que un `package.json` pelado puntuaba 60 y le ganaba a un `pyproject.toml` con 50. Es literalmente el caso que este plan cita. Ahora un manifiesto dedicado vale 90-100 y un `package.json` genérico 20.
- **Files**:
  - `packages/core/src/lib/config/detect-stack-defaults.helper.ts` — `detectLanguageSignals` devuelve TODOS los lenguajes con señal, cada uno con su evidencia. Hoy construye un array y le mete sólo `detectPrimaryLanguage`.
  - `packages/core/src/lib/bootstrap/language-rules.ts` — de first-match por prioridad a puntuación acumulativa: varias reglas pueden acertar a la vez. `primary` se deriva del resultado, no lo sustituye.
  - `packages/core/tests/src/lib/config/detect-stack-polyglot.spec.ts` — el caso que hoy falla: `tsconfig.json` + `Cargo.toml` + `go.mod` debe devolver los tres. Y `package.json` + `pyproject.toml` sin `tsconfig` no debe silenciar Python.
- **Gate**: lint, types, test

### S3 — Forma y roles, ortogonales

- **Status**: done — `f3fa13adf`. `role-rules.ts` + `project-shape.ts`: Django/FastAPI/Celery dejan de ser `library`, Go con `cmd/*/main.go` es `cli`, y `three` sola ya no produce `game`. `roles` vacío cuando nada encaja, porque «no encajó nada» es más útil que un `generic` con aplomo.
- **Files**:
  - `packages/core/src/lib/bootstrap/project-shape.ts` — `{ workspace, roles[] }` en lugar de un `projectType` escalar. Un monorepo puede declarar cuatro roles.
  - `packages/core/src/lib/bootstrap/role-rules.ts` — reglas de rol con las clasificaciones que hoy fallan: Python con Django/FastAPI/Celery/Typer no es `library`; Go con `cmd/*/main.go` es `cli`; `three` sola no basta para `game`.
  - `packages/core/tests/src/lib/bootstrap/role-rules.spec.ts` — un caso por clasificación equivocada, cada uno nombrando por qué la actual se equivoca.
- **Gate**: lint, types, test

### S4 — Un solo detector: `analyze-project` deriva del grafo

- **Status**: done — `f3fa13adf`, con dos correcciones en `3ec9e5cc5`. `analyzeProject` proyecta desde el grafo y no detecta por su cuenta. `projectLegacyLanguage` mapea a `unknown` un lenguaje que el enum antiguo no conocía, en vez de al vecino más cercano: ensanchar el enum es un cambio deliberado, decir que Java es JavaScript es una mentira que el llamador no puede ver. Y el grafo releía `package.json`, convirtiendo un análisis compartido en tres lecturas del mismo fichero — `plan-tool.spec.ts` lo caza contándolas.
- **Files**:
  - `packages/core/src/lib/bootstrap/analyze-project.ts` — pasa a proyectar su forma antigua desde el grafo, sin lógica de detección propia. Las dos verdades no coexisten: hay una y una proyección.
  - `packages/core/src/lib/config/capability-graph.ts` — el agregador: recoge señales de los detectores existentes y produce el grafo. Puro respecto a la decisión; el I/O queda en los probes que ya existen.
  - `packages/core/tests/src/lib/config/capability-graph.spec.ts` — sobre el mismo repositorio, `analyzeProject` y el grafo no pueden contradecirse. Es el test que impide que vuelvan a divergir.
- **Gate**: lint, types, test

### S5 — Manifiesto de host y guard de divergencia

- **Status**: done — `f3fa13adf`. Los manifiestos canónicos estaban declarados DENTRO de un script de verificación mientras el runtime llevaba su propia vista: esa es exactamente la divergencia que la slice cierra. Ahora viven en `host-capability-registry.ts` con `lint:host-manifest-drift` en `validate`. El registro importaba `GENERIC_MCP_HOST_CAPABILITY_MANIFEST` con `import type` y lo usaba como valor — compilaba y reventaba en ejecución; el default vive en el runtime, porque es una decisión sobre qué puede suponerse de un host genérico, no una forma.
- **Files**:
  - `packages/contracts/src/lib/host/host-capability-manifest.interface.ts` — declaración canónica por host: MCP, prompts, resources, `structuredContent`, cambios dinámicos, notificaciones, skills, subagentes.
  - `packages/core/src/lib/host/host-capability-registry.ts` — el registro, con el manifiesto como única fuente y los `supportsX()` derivados de él.
  - `tools/scripts/lint/host-manifest-drift.script.ts` — falla si una proyección discrepa del manifiesto. Es el patrón que este repo ya aplica a plugins; el proyecto comparado demuestra que aplicado a hosts funciona igual de bien.
  - `packages/core/tests/src/lib/host/host-capability-registry.spec.ts`
- **Gate**: lint, types, test

### S6 — Permisos declarativos por plugin

- **Status**: pending
- **Files**:
  - `packages/contracts/src/lib/plugin/plugin-permissions.interface.ts` — `filesystem.read`, `filesystem.write`, `network`, `process.spawn`, `git.write`, `git.push`, `secrets.read`, `browser`, `externalMcp`.
  - `plugins/*/plugin.manifest.ts` — cada plugin declara lo que necesita. Un host puede entonces mostrar "git: read + write + push" en vez de adivinarlo.
  - `plugins/auto-plugin-selector/src/lib/scoring/permission-risk.ts` — el peso `permissionRisk: 0.2` que ya existe en la configuración deja de depender de heurísticas y lee la declaración.
  - `tools/scripts/lint/plugin-permissions-declared.script.ts` — un plugin que usa un efecto sin declararlo no pasa.
- **Gate**: lint, types, test

### S7 — Puente de sólo lectura con Gentle-AI

- **Status**: pending
- **Files**:
  - `plugins/gentle-ai/package.json` — plugin opt-in, desactivado por defecto.
  - `plugins/gentle-ai/src/index.ts` — lee la configuración de hosts que Gentle-AI ya mantiene y la traduce a manifiestos de host de S5. **Sólo lectura**: no escribe configuración de agentes ni instala nada.
  - `plugins/gentle-ai/tests/src/lib/bridge.spec.ts` — con fixtures, sin tocar el sistema del usuario.
- **Gate**: lint, types, test

## dependency graph

- S1 antes que todo lo demás.
- S2 y S3 son independientes entre sí y ambas dependen de S1.
- S4 depende de S2 y S3 (proyecta lo que ellas producen).
- S5 depende de S1; independiente de S2–S4.
- S6 depende de S1.
- S7 depende de S5 y es la última: sin manifiesto de host no hay nada que
  traducir.

## acceptance

- Un repositorio con `tsconfig.json`, `Cargo.toml` y `go.mod` devuelve
  los tres lenguajes, cada uno con evidencia.
- `package.json` + `pyproject.toml` sin `tsconfig` no clasifica el
  proyecto como `javascript` a secas.
- Un monorepo declara varios roles a la vez.
- Django, FastAPI y Celery no se clasifican como `library`; un Go con
  `cmd/*/main.go` se clasifica como `cli`; `three` sola no produce
  `game`.
- `analyzeProject` y el grafo no pueden contradecirse sobre el mismo
  repositorio: hay un test que lo comprueba.
- `bun run lint:host-manifest-drift` falla si una proyección discrepa.
- Cada plugin declara sus permisos y el lint lo comprueba.

## risks and mitigations

- **S4 toca un camino de bootstrap del que dependen muchos consumidores.**
  Se mitiga proyectando la forma antigua sin cambiarla: el contrato
  público no se mueve en esta slice.
- **S6 toca los 56 manifiestos de plugin.** Se mitiga con trinquete: el
  lint arranca en modo advisory con una línea base y pasa a error cuando
  la línea base está vacía, que es el patrón que este repo ya usa.
- **La puntuación acumulativa de S2 puede cambiar `primary`** en algún
  repositorio. Los tests fijan los casos conocidos, y `primary` deja de
  ser el único dato disponible, así que un cambio deja de ser destructivo.
- **S7 puede crear un solapamiento de autoridad.** Se acota por
  construcción: sólo lectura, opt-in, y sin memoria ni workflow propios.

## notes

El análisis comparativo está en `.cache/chat-with-llms/`, fichero del
2026-09-03 con sufijo `_vs_gentleman_programing`.

Lo que ese análisis recomienda NO copiar, y que este plan deliberadamente
no toca: la profundidad del ciclo RDD/SDD, una segunda memoria canónica,
un workflow paralelo a `proposals`, el enrutado de modelos duplicado, y
llevar comportamiento específico de un host al core.

La conclusión que sostiene el orden de las slices: el siguiente salto de
este repositorio no es añadir más detección, sino tener una sola
ontología de la que todo derive. Hay tantas buenas ideas avanzando en
paralelo que empiezan a existir representaciones distintas de la misma
verdad, y `analyzeProject` frente a `detectStack` es el ejemplo exacto.
