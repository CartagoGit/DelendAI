---
id: a00090
title: "Auditoría independiente de `develop` — mcp-vertex"
kind: audit
status: done
type: proposal
track: migrated
date: 2026-08-30
migrated-from: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
---

# a00090 — Auditoría independiente de `develop` — mcp-vertex

## Goal

> Revisión técnica exhaustiva e independiente del repositorio
> `CartagoGit/mcp-vertex`, rama `develop`, realizada sin reutilizar
> conclusiones de auditorías anteriores. Todo hallazgo está anclado a
> evidencia reproducible (path + línea, salida de comando, o respuesta
> de la API de GitHub) recogida contra el snapshot declarado abajo.

---

## Índice

1. [Snapshot exacto](#1-snapshot-exacto)
2. [Metodología y cobertura real](#2-metodología-y-cobertura-real)
3. [Resumen ejecutivo](#3-resumen-ejecutivo)
4. [Puntuaciones](#4-puntuaciones)
5. [Hallazgos — Track A: CI/CD y gobernanza](#5-track-a--cicd-y-gobernanza)
6. [Hallazgos — Track B: economía de tokens](#6-track-b--economía-de-tokens)
7. [Hallazgos — Track C: superficie adaptativa](#7-track-c--superficie-adaptativa)
8. [Hallazgos — Track D: seguridad y efectos](#8-track-d--seguridad-y-efectos)
9. [Hallazgos — Track E: arquitectura y fronteras](#9-track-e--arquitectura-y-fronteras)
10. [Hallazgos — Track F: producto, DX y superficies cliente](#10-track-f--producto-dx-y-superficies-cliente)
10bis. [Hallazgos — Track G: confianza y control (uso real del autor)](#10bis-track-g--confianza-y-control-uso-real-del-autor)
11. [Inventario del monorepo](#11-inventario-del-monorepo)
12. [Inventario de plugins](#12-inventario-de-plugins)
13. [Top 10 cambios por ROI](#13-top-10-cambios-por-roi)
14. [Roadmap P0 / P1 / P2](#14-roadmap-p0--p1--p2)
15. [Arquitectura objetivo propuesta](#15-arquitectura-objetivo-propuesta)
16. [Qué NO hacer](#16-qué-no-hacer)
17. [Métricas a instrumentar](#17-métricas-a-instrumentar)
18. [Plantilla de propuesta](#18-plantilla-de-propuesta)
19. [Definition of Done global](#19-definition-of-done-global)
20. [Prompt reutilizable para la próxima auditoría](#20-prompt-reutilizable-para-la-próxima-auditoría)

---

## 1. Snapshot exacto

> **La rama se movió durante la auditoría.** El snapshot inicial fue
> `ff289141` (CI rojo). Mientras se auditaba, el PR #49 se integró en `develop`.
> **Todo hallazgo de este informe está revalidado línea a línea contra el
> snapshot final**; los que el PR #49 resolvió aparecen marcados
> `✅ RESUELTO por #49` y se conservan sólo como trazabilidad, no como deuda.

| Campo | Valor |
| --- | --- |
| Repositorio | `CartagoGit/mcp-vertex` |
| Rama auditada | `develop` |
| **Commit SHA final (snapshot vinculante)** | **`2cf17373f32b536e0c5154892ceddbb5d490ab37`** |
| Mensaje | `Merge pull request #49 from CartagoGit/wip` |
| Fecha | `Thu Aug 27 20:31:10 2026 +0200` |
| Commit inicial (descartado) | `ff289141a26ecb3a70744ae608373517d7b87c1b` (CI rojo) |
| Rama por defecto en GitHub | `main` |
| Método de extracción | `git archive origin/develop` a directorios aislados (uno por snapshot) |

### Estado de integración en `2cf17373`

| Elemento | Estado real |
| --- | --- |
| `ci-complete` | **success** ✅ |
| `develop-health` (tier3) | **failure** ❌ — sigue rojo (ver `AUD-A04`) |
| Resto de checks (24) | success |
| Branch protection `develop` | **NO EXISTE** (404) — pero ahora **declarada** como `protected: false` en `.github/branch-protection.ts:78`, así que ya **no es drift**: es una asimetría deliberada (ver `AUD-A01`) |
| Branch protection `main` | `strict=true`, `contexts=["ci-complete"]`, `enforce_admins=true`, `required_linear_history=true`, `allow_force_pushes=false`, `allow_deletions=false` |
| PRs abiertos | 0 |

### Qué cambió entre los dos snapshots

El PR #49 resolvió tres de los hallazgos del snapshot inicial:

| Hallazgo | Estado en `ff289141` | Estado en `2cf17373` |
| --- | --- | --- |
| `AUD-A01` drift de branch protection | Config exigía proteger `develop`; no lo estaba | ✅ Config declara `protected: false` + `required_checks: []`; el campo `protected` **sí** lo consumen ambos verificadores (`verify-branch-protection.script.ts:136`, `verify-develop-health.script.ts:133`) |
| `AUD-A02` `ci-complete` rojo | failure | ✅ success |
| `AUD-A03` frozen-guard por `mtime` | 129 falsos positivos | ✅ Congelado por `sha256` (`closed-frozen-guard.lib.ts:45-47`) |
| `AUD-A08` `bun run lint:architecture` inexistente | `tier2` rojo | ✅ Sustituido por los lints reales (`tier2.yml:73-77`) |

**Y confirmé que NO cambió** (verificado sobre `2cf17373`): `AUD-A04`, `AUD-A05`,
`AUD-A06`, `AUD-A07`, `AUD-A09`, `AUD-A10`, `AUD-A11`, todo el Track B, todo el
Track C, y todo el Track D.

## 2. Metodología y cobertura real

**Fuentes cruzadas.** Ninguna conclusión se apoya sólo en README/docs. Cada
hallazgo contrasta al menos dos de: código fuente, manifest, configuración de
CI, salida real de un script ejecutado, estado en la API de GitHub, o el
artefacto generado correspondiente.

**Verificaciones ejecutadas realmente (no sólo leídas):**

- `gh api` contra branch protection, check-runs, workflow runs y logs de jobs
  fallidos (logs crudos de `lint-governance` y `develop-health` descargados y
  citados literalmente en los hallazgos).
- `biome ci` ejecutado sobre `packages/`, `plugins/`, `tools/`, `apps/` del
  snapshot → 3320 ficheros, 45 errores, 119 warnings, 127 infos.
- `bun tools/scripts/lint/capabilities-declared.script.ts` ejecutado en vivo →
  `✓ 51 plugin(s), 1162 file(s)`.
- `bun tools/scripts/verify/plugin-wiring.script.ts --report` ejecutado en vivo.
- Arranque del servidor MCP por stdio con un cliente propio (`initialize` +
  `tools/list`) para medir la superficie real.
- Inventario programático de scripts referenciados en workflows vs. scripts
  existentes en `package.json`.

**Cobertura por área:**

| Área | Cobertura | Nota |
| --- | --- | --- |
| CI/CD (14 workflows) | **Completa** | Los 14 ficheros leídos íntegros; `ci/tier1/tier2/tier3` analizados job a job |
| Gobernanza / branch protection | **Completa** | Config declarativa + los 2 verificadores + estado real en GitHub |
| Contrato de tokens y dashboard | **Completa** | Constante de budgets + script de dashboard + artefacto generado |
| Superficie adaptativa (`surface/`, `tool-surface-runtime`) | **Completa** | 660 líneas del runtime leídas íntegras |
| Core (`packages/core`, 570 ficheros / 87.9k líneas) | **Alta selectiva** | Ficheros >380 líneas, barrels públicos, capabilities, filesystem, git-write, plugins/loader. No se leyó línea a línea el 100% |
| Plugins (51, 1692 ficheros / 222.8k líneas) | **Media dirigida** | Inventario completo (100%); lectura profunda priorizada por: cambio reciente, coste en tokens, y efectos (fs/git/red/proceso). Analizados en profundidad: `orchestrator-runner`, `proposals`, `commit-policy`, `external-mcps`, `git`, `capabilities`-consumers. **No** se leyó íntegro `rules` (185 ficheros, 0 tools) ni los data-packs |
| CLI (`packages/cli`, 18.2k líneas) | **Media** | Estructura, `doctor`, cobertura de comandos |
| Client TS (10.5k líneas) | **Media** | package.json, exports, acoplamiento con core |
| Web (`apps/web`, 29k líneas) | **Baja-media** | Build gate, generadores, drift; no se auditó SCSS/i18n en profundidad |
| VS Code (20.4k líneas) | **Media** | Manifest completo, comandos/vistas/settings/activación |
| Tests (1054 specs) | **Media** | Conteo, skips, gates; **no** se ejecutó la suite completa (CI ya reporta `tests` en verde en el snapshot) |

**Limitación declarada.** Las comprobaciones que requerían ejecutar el runtime
se hicieron sobre el worktree local (`wip`), que difiere de `develop` en 33
ficheros acotados (CI scripts, `orchestrator-runner`, docs de proposals). Ningún
hallazgo de runtime depende de esos 33 ficheros; donde hay riesgo de
divergencia se marca explícitamente.

---

## 3. Resumen ejecutivo

**mcp-vertex es un proyecto de ambición y ejecución muy por encima de la media.**
465.000 líneas de TypeScript, 51 plugins, un contrato de tokens medido y
versionado con tokenizadores reales, un sistema de propuestas con máquina de
estados y 130 propuestas congeladas por hash, superficie de herramientas
adaptativa con carga perezosa genuinamente cableada, y 1.054 ficheros de spec con
una densidad de deuda declarada excepcionalmente baja (74 TODO, 88 `any`, 10
`skip` de los cuales 9 son condicionales de entorno legítimos). El guard de
force-push con autorización auditada, el ciclo de vida de `commit-policy` y la
separación ortogonal visibilidad/autorización en el runtime de superficie son de
nivel staff genuino.

Durante la auditoría el PR #49 se integró y **cerró los tres fallos de CI más
visibles** del snapshot inicial: `ci-complete` está verde, el frozen-guard ya no
depende de `mtime`, `tier2` invoca scripts que existen, y la asimetría de ramas
está ahora declarada en la política en vez de ser drift. El proyecto reacciona
rápido y bien.

**Lo que queda no es superficie: son contratos de runtime que el sistema promete
y no cumple.** Cinco patrones, todos verificados línea a línea contra
`2cf17373`:

1. **Dos implementaciones del mismo concepto que ya han divergido.** La
   activación *eager* y la *lazy* deberían ser equivalentes. No lo son: la ruta
   lazy comprueba `safeParse(...).success` y **descarta `parsed.data`** (así que
   los `default`/`coerce`/`transform` de Zod no se aplican), llama a `register()`
   **sin timeout ni AbortSignal**, y **no retiene el `dispose`** que el plugin
   devuelve. El mismo plugin se comporta distinto según cómo se cargara — y la
   ruta débil es precisamente el modo `managed`, que es el default silencioso y
   la mejor pieza del proyecto. Cuanto mejor funciona la superficie adaptativa,
   más plugins pasan por el camino degradado.

2. **Nadie es dueño del teardown, en los tres niveles a la vez.**
   `external-mcps` arranca subprocesos de terceros y su `register()` **no
   devuelve `dispose`** (aunque `closeAll()` existe); el activador lazy **no
   retiene** el `dispose` que sí recibe; y `createMcpProject()` **no expone**
   forma de cerrar lo que abrió. El plugin sabe destruirse y nadie tiene la
   responsabilidad de pedírselo. Arreglar un nivel solo no produce ninguna
   mejora observable.

3. **Puertas que no pueden fallar, y una que no puede pasar.**
   `verify-branch-protection` devuelve `0` cuando **ninguna** rama es legible con
   el token del workflow — que es el caso real, siempre. El check
   `branch-protection` aparece en verde en cada ejecución sin haber verificado
   jamás nada. Su gemela `verify-develop-health` consulta el mismo endpoint y
   **lanza** en el 403: es el único check rojo que queda en `develop`. Y ambas
   leen `allow_deletion` cuando la API devuelve `allow_deletions`, así que
   incluso con un token de administrador reportarían drift falso para siempre.

4. **Puertas que miden lo que no importa.** `bun run lint` ejecuta
   `biome ci extensions/vscode`: los otros **3.320 ficheros** del monorepo nunca
   pasan por Biome en CI, y ya acumulan **45 errores y 119 warnings** reales.
   `lint:capabilities` reporta `✓ 51 plugin(s)` porque busca el patrón textual
   `ctx.capabilities.x.y` — mientras **35 plugins importan builtins con efecto (`node:child_process`, `node:fs`, …)
   directamente** y sólo 6 usan `ctx.effects`. La puerta de seguridad se
   satisface trivialmente *no usando* la capa de seguridad. Y `affected.script.ts`
   emite nombres de paquete (`@mcp-vertex/core`) que `vitest --project` rechaza
   (`No projects matched the filter`), porque los proyectos se llaman `core`:
   el gate rápido o bien revienta o bien ejecuta la suite entera.

5. **Opciones declaradas que no hacen nada** — y algunas son controles de
   seguridad. `managedSurface.idleTtlMs`/`maxWarmPlugins` están tipadas,
   validadas por esquema y mostradas en el informe de arranque, pero la evicción
   sólo borra un `Map` de contabilidad: no descarga, no libera, no oculta, y su
   valor de retorno se descarta en los dos únicos sitios que la llaman.
   `llmDecidesActivation` documenta que con `false` "el LLM sólo puede sugerir y
   un humano activa" — y **no lo consume nadie**: cero referencias fuera del
   esquema y los comentarios. `eager` está implementado en el registry, se invoca
   en cada arranque, y es **inexpresable** en la config porque el esquema es
   `.strict()` y no declara la clave. `decideSurfaceModeFromCapabilities` recibe
   `clientInfo` y `capabilities` y devuelve `'managed'` sin leerlos.

**Sobre tokens, la conclusión es contraintuitiva y muy accionable.** El coste no
está en las descripciones. En el preset `vertex` (283.919 B de `tools/list`), los
**`outputSchema` son 187.067 B — el 66%** — frente a 55.036 B de inputSchema
(19%) y sólo 17.781 B de descripciones (6%). En el bootstrap adaptativo (8.934 B,
el camino que recorre *todo* cliente por defecto) los `outputSchema` son el
**75%**. Cinco herramientas concentran 44.617 B, de los cuales el **90% son sus
esquemas de salida**; `advise_routing` sola cuesta 12.992 B con 12.157 B de
outputSchema. Recortar prosa es ruido; poner los esquemas de salida a dieta —
envelope compartido con `$ref`, niveles de detalle, y los esquemas pesados como
*resources* MCP — es la palanca real.

**Y la cobertura de ramas al 69% explica por qué nada de esto se detectó.** Los
umbrales están dos puntos por debajo de la medida real (un trinquete que no
trinca, confesado en el propio `vitest.config.ts`), y casi un tercio de las ramas
condicionales no se ejercita. Las ramas son los `catch`, los fallbacks y los
casos límite — **todos** los bugs de este informe viven ahí. Ninguno estaba en el
camino feliz.

**Veredicto.** El proyecto no tiene un problema de capacidad de ingeniería: tiene
un problema de *verificabilidad*. Ha construido más controles de los que puede
demostrar que funcionan, y más configuración de la que puede demostrar que surte
efecto. La prioridad no es añadir features — hay amplitud de sobra para
diferenciarse. Es convertir ciclo de vida, efectos, superficie adaptativa y
enrutado externo en **contratos de runtime imposibles de violar por accidente**, y
que cada puerta tenga un test que demuestre que falla cuando debe fallar. Eso
elevaría el proyecto mucho más que otros veinte plugins.

---

## 4. Puntuaciones

Escala 0–10, justificadas contra la evidencia de este informe, sobre el snapshot
final `2cf17373`.

| Dimensión | Nota | Justificación |
| --- | --- | --- |
| **Idea** | **9,3** | Un runtime MCP project-agnostic con superficie adaptativa, economía de tokens medida y gobernanza de propuestas es una idea correcta y poco explorada. El ángulo "el servidor MCP como plataforma, no como bolsa de tools" es genuinamente diferencial. |
| **Producto** | **8,0** | Propuesta de valor articulada y amplitud real (CLI + VS Code + web + client). Penaliza que la extensión no arranque en un repo sin config (`F03`), cerrando el embudo de adopción sobre sí mismo. |
| **Arquitectura** | **7,8** | Capas y fronteras deliberadas (contracts/public/node/runtime/plugin), grafo de dependencias, transacciones y rollback. Penalizan el barrel de 287 exports (`E03`), `client → core` en runtime (`E04`) y la concentración en `proposals` (`E05`). |
| **Core** | **7,0** | Primitivas excelentes (idempotencia, mutex de fichero, lectura contenida, dry-run ambiental). La nota cae por `E01`: dos rutas de activación divergentes en opciones, timeout y `dispose`. |
| **Plugin system** | **7,0** | Manifest declarativo, grafo de dependencias, carga perezosa realmente cableada, wiring verificado por script. Misma penalización que Core: el ciclo de vida no es equivalente entre rutas. |
| **Superficie adaptativa** | **8,0** | 8.934 B de bootstrap frente a 283.919 B nativos es un resultado sobresaliente, y la separación visibilidad/autorización es correcta. Penalizan el working set inerte (`C02`) y la decisión de modo que ignora al cliente (`C01`). |
| **Familia: orquestación** (`proposals`, `agent-orchestrator`, `orchestrator-runner`) | **7,5** | Profundidad de tests de concurrencia inusual (135 specs sólo en `proposals`). Penaliza el tamaño y ser el mayor contribuyente de tokens. |
| **Familia: efectos** (`git`, `commit-policy`, `container`, `database`, `browser`) | **7,5** | `commit-policy` es ejemplar (timers `unref`, disposables, dispose idempotente); `git` tiene el mejor guard del repo. Penaliza el bypass de la capa de capabilities. |
| **Familia: análisis** (`audit`, `quality`, `security`, `deps`, `perf`, `refactor`, `conventions`) | **7,5** | Cobertura amplia y útil; solapamiento real entre `quality`/`quality-policy`/`test-policy`/`test-convention`. |
| **Familia: data-packs** (`rules`, `prompts-pack`, `skills-pack`, `completion`) | **6,5** | `rules` son 185 ficheros y 0 tools: contenido, no comportamiento. Correcto, pero infra-documentado como tal. |
| **Plugin crítico: `orchestrator-runner`** | **6,5** | 11 tools, 12 puntos de spawn, y el mayor coste de superficie del repo. Buena cobertura (22 specs). Su outputSchema es el problema. |
| **Plugin crítico: `proposals`** | **7,5** | Motor real del flujo agentic con la mejor batería de concurrencia del proyecto. Necesita partirse y adelgazar su superficie. |
| **Plugin crítico: `commit-policy`** | **8,5** | Ciclo de vida impecable. Referencia interna a seguir. Sólo penaliza el e2e de dogfood desactivado (`F02`). |
| **Plugin crítico: `external-mcps`** | **5,5** | Buenas decisiones de diseño (pinning exacto, secretos por nombre, env filtrado, ack persistente, discovery off por defecto, rate-limit). Pero tres contratos rotos a la vez: `eager` inexpresable, `llmDecidesActivation` inerte y sin `dispose`. Y sin README. |
| **Client (TS)** | **6,5** | Exports limpios, `structuredContent` preferido sobre parsear texto, seam de transporte. Penaliza la dependencia de runtime con el core, que arrastra 88k líneas y cierra la puerta a un cliente de navegador. |
| **CLI** | **8,5** | Sorpresa positiva: `mcpv doctor` ya existe, con puntuación, P0/P1/P2, JSON y códigos de salida para CI. Amplia y bien agrupada. Le falta cubrir los fallos de este informe (`F04`). |
| **Web** | **8,0** | Build real como gate (decisión correcta y documentada tras dos roturas históricas), generadores con drift check, 51 páginas auto-generadas. Penalizan 3 páginas manuales duplicadas. |
| **VS Code** | **7,0** | Superficie de producto sorprendentemente completa (34 comandos: proposals, memory, timeline, métricas, salud, acks). Penaliza el `activationEvents` único que la deja inerte en un repo virgen. |
| **Testing** | **7,5** | 1.054 specs, property tests, concurrencia, e2e de locks y transiciones. Penaliza fuerte el 69% de branches con umbrales que no trincan: es exactamente donde vivían todos los bugs de este informe. |
| **CI** | **6,5** | Sube mucho respecto al snapshot inicial: `ci-complete` verde, agregación bien diseñada, tiering PR/nightly correcto, `pack-smoke` con instalación real bajo Node. Sigue penalizada por una puerta ciega, una siempre roja, el lint al 3% del árbol y el `affected` que no afecta. |
| **Security** | **6,0** | Primitivas buenas (force-push autorizado, `buildSafeEnv`, contención de FS, ack persistente). Castiga la brecha entre declarado y forzado: capability lint vacuo, dry-run advisory y un knob de autonomía inerte. |
| **Observability** | **7,5** | Logs, métricas por plugin, tool-confusion, usage tracking, startup report, dashboard de tokens generado. Falta cerrar el bucle con precisión de activación. |
| **Tokens (native)** | **6,5** | Instrumentación excelente; magnitud insostenible (284 KB en `vertex`) y techos que han subido hasta justo por encima de la medición. |
| **Tokens (adaptive)** | **9,0** | 8.934 B de bootstrap es la mejor decisión de producto del proyecto. Penaliza que el 75% siga siendo outputSchema evitable y que sea idéntico para los 9 presets. |
| **DX** | **8,5** | Scaffolding, generadores, AGENT.md por paquete, code map, doctor, dev scripts. Penaliza la superficie de >130 scripts en el `package.json` raíz. |
| **Maintainability** | **7,5** | Convenciones fuertes y ratchets de lint reales. Penalizan los God modules y las dos implementaciones del mismo concepto. |
| **Documentation** | **8,3** | Muy por encima de la media: 30+ documentos temáticos, ADRs, docs generadas con drift check, matriz de compatibilidad de hosts. Penaliza el drift puntual de versión y la duplicación manual/generada. |
| **Governance** | **7,5** | Aparato impresionante y ahora coherente: la asimetría `develop`/`main` está declarada, no es drift. Penaliza que el verificador que debería sostenerla sea ciego. |
| **Release readiness** | **6,5** | `pack-smoke` con tarball + Node es una prueba de madurez seria y está en verde. No se publica con fugas de subprocesos y contratos de ciclo de vida sin cerrar. |
| **Potencial futuro** | **9,5** | Con los P0 cerrados esto es una plataforma, no un servidor. El router de MCPs externos con enrutado por coste/calidad/latencia sobre un `EffectBroker` es algo que hoy no existe empaquetado. |

### Notas globales

| Métrica | Nota |
| --- | --- |
| **Nota global (snapshot `2cf17373`)** | **7,4 / 10** |
| **Nota global potencial tras P0+P1** | **9,0 / 10** |

La distancia (1,6 puntos) es casi enteramente *cierre de contratos*: ciclo de
vida, efectos, superficie y enrutado. No exige features nuevas.

### Top 5 fortalezas

1. **Superficie adaptativa realmente eficiente.** No es una promesa de diseño:
   `MANAGED_LAZY_PLUGIN_CATALOG` + `bindLazyTool` + `setLazyPluginLoader` están
   cableados de punta a punta, y el bootstrap mide 8.934 B frente a 283.919 B.
2. **Economía de tokens medida, no discutida.** Contrato tipado, dashboard
   generado con desglose por componente y por owner, tres tokenizadores con
   etiqueta de confianza explícita por modelo. Casi nadie mide esto; menos aún
   lo mide con esta honestidad sobre lo que es medición y lo que es estimación.
3. **Testing de orquestación y concurrencia inusualmente profundo.** Creación
   concurrente, contención de locks, mutex, reconciliación, property tests y e2e
   de transiciones.
4. **Guard de force-push con autorización auditada.** Exige `by` + `reason` no
   vacíos, resuelve el refspec real y conserva registro acotado. Más de lo que
   hacen la mayoría de herramientas comerciales.
5. **DX y visión de plataforma.** CLI con doctor, VS Code con 34 comandos,
   artefactos generados con drift check, scaffolding y AGENT.md por paquete.
   Plugins + proposals + MCPs externos + políticas + observabilidad forman un
   sistema coherente, no una colección.

### Top 5 riesgos

1. **Ciclo de vida divergente entre eager y lazy** (`E01`): opciones sin parsear,
   registro sin timeout y `dispose` perdido, justo en la ruta por defecto.
2. **Nadie posee el teardown** (`E02`, `D05`, `E01.c`): la cadena está rota en
   los tres niveles simultáneamente, y los subprocesos huérfanos son de terceros.
3. **El enforcement de efectos es voluntario** (`D01`, `D02`): `dryRun` detecta
   después de ejecutar, y la puerta que debería vigilarlo reporta `51/51` verde.
4. **Controles de autonomía inertes** (`D04`, `D03`, `C02`, `A07`): opciones de
   seguridad y de memoria que el usuario configura y que no hacen nada.
5. **Superficie nativa creciendo contra sus propios umbrales** (`B01`, `B03`):
   `minimal` y `lean` ya están por encima del aviso, con el 66% del coste en
   esquemas de salida.

---

## 5. Track A — CI/CD y gobernanza

> Cada hallazgo lleva: **ID · Clasificación · Severidad · Área**, y después
> comportamiento actual, evidencia, por qué es un problema, impacto, riesgo,
> reproducción, solución mínima, solución arquitectónica, tests a añadir,
> criterios de aceptación, dependencias, impacto en tokens y en compatibilidad.

### AUD-A01 — Asimetría de gobernanza: `develop` es la rama de integración y no está protegida

> ✅ **El *drift* que existía en `ff289141` está RESUELTO por #49**: la política
> ahora declara `develop: { protected: false, required_checks: [] }` y ambos
> verificadores consumen el campo. Lo que queda es la decisión de fondo, que
> se reclasifica de BUG a **RIESGO DE DISEÑO** y sigue abierta.

- **Clasificación:** RIESGO DE DISEÑO (antes BUG, ya resuelto el drift) · **Severidad:** ALTA · **Área:** gobernanza
- **Propuesta:** `d00013` (ADR que fije el modelo) + `x00273` (guard de push directo)

**Comportamiento actual.** `.github/branch-protection.ts` declara `develop` como
rama que DEBE tener protección con `required_checks: ['ci-complete']`. En GitHub
`develop` no tiene ninguna regla de protección.

**Evidencia.**
```
$ gh api repos/CartagoGit/mcp-vertex/branches/develop/protection
{"message":"Branch not protected","status":"404"}

$ gh api repos/CartagoGit/mcp-vertex/branches/main/protection
{"required_status_checks":{"strict":true,"contexts":["ci-complete"]}, "enforce_admins":{"enabled":true}, ...}
```
- Config: `.github/branch-protection.ts:55-68` — `branches: [{name:'develop', required_checks:['ci-complete']}, {name:'main', ...}]`
- Doc: `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md`

**Por qué es un problema.** La rama de integración —donde aterriza el trabajo de
múltiples agentes concurrentes— acepta push directo sin checks, sin historia
lineal y con force-push permitido. Toda la maquinaria de gobernanza (propuestas,
lints de citación, discipline hooks) presupone que `develop` es un punto de
convergencia estable.

**Impacto.** Pérdida silenciosa de trabajo entre agentes concurrentes; `develop`
puede quedar (y está) roja indefinidamente; `main` sólo se salva porque su
`ci-complete` bloquea, pero eso significa que la rama de release nunca puede
avanzar mientras `develop` esté roja.

**Riesgo.** Alto y ya materializado: 5 commits consecutivos rojos en `develop`.

**Reproducción.** `gh api repos/CartagoGit/mcp-vertex/branches/develop/protection`
→ 404.

**Solución mínima.** Decidir explícitamente la política y hacerla verdad:
o (a) proteger `develop` con `ci-complete` + `allow_force_pushes: false`, o
(b) si el modelo real es "develop = laboratorio, main = publicación" (lo que
sugieren `q00010` y el commit `20c699a9` en `wip`), **quitar `develop` de
`.github/branch-protection.ts`** y dejar la política declarada acorde con la
realidad deseada.

**Solución arquitectónica ideal.** Política bifurcada y declarativa por rama con
`enforcement: 'required' | 'advisory'` en el propio config, de modo que el
verificador sepa distinguir "esta rama debe estar protegida" de "esta rama es
deliberadamente flexible" — y falle sólo en el primer caso. La ambigüedad actual
(un único array donde toda rama listada es obligatoria) es la causa raíz.

**Tests a añadir.**
- Spec de `verify-branch-protection` con fixture `develop` sin protección y
  política `required` → exit 1 con `kind: 'MISSING'`.
- Spec con política `advisory` → exit 0 pero con línea de aviso.

**Criterios de aceptación.**
1. `gh api .../branches/develop/protection` y `.github/branch-protection.ts`
   concuerdan.
2. Existe un test que falla si vuelven a divergir.
3. `docs/mcp-vertex/GOVERNANCE-BRANCH-PROTECTION.md` describe el estado real.

**Dependencias.** Bloqueante para `AUD-A05` (el verificador debe poder demostrar
esto) y `AUD-A06` (bug de campo).

**Tokens:** ninguno. **Compatibilidad:** ninguna ruptura de API.

---

### AUD-A02 — ✅ RESUELTO por #49 — `develop` estuvo 5 commits en rojo

- **Clasificación:** BUG CONFIRMADO · **Severidad:** CRÍTICA · **Área:** integración
- **Propuesta:** `x00274`

**Comportamiento actual.** `ci-complete` = `failure` en `ff289141`. Los 5 commits
más recientes de `develop` tienen `CI` y/o `tier3` en `failure`/`cancelled`. La
rama `wip` (PR #49) ya arregla parte de las causas y tiene CI verde, pero no está
mergeada.

**Evidencia.**
```
$ gh api repos/.../commits/ff289141.../check-runs
ci-complete        completed  failure
lint-governance    completed  failure
develop-health     completed  failure

$ gh api "repos/.../actions/runs?branch=develop"
CI       ff289141  completed  failure  2026-08-27T13:24:25Z
tier3    ff289141  completed  failure
CI       ace26074  completed  failure
tier3    ace26074  completed  failure
CI       051b12d5  completed  cancelled
CI       391426c2  completed  failure
```

**Por qué es un problema.** El rojo permanente destruye la señal: cuando la rama
lleva días roja, nadie distingue una regresión nueva de las dos puertas
crónicamente rotas. Es el mecanismo por el que un equipo pierde su CI.

**Impacto.** `main` no puede avanzar (su required check es `ci-complete`).
Ninguna release es posible.

**Riesgo.** Normalización de la desviación.

**Reproducción.** Ver evidencia.

**Solución mínima.** Cerrar `AUD-A03`, `AUD-A04`, `AUD-A05`, `AUD-A08` y mergear
PR #49; verificar que `ci-complete` pasa a verde en el merge commit.

**Solución arquitectónica ideal.** Un job `develop-guard` que, al detectar
`ci-complete` rojo en `develop`, abra/actualice automáticamente un issue con el
job y la línea de log culpable, y lo cierre al volver a verde. Convierte el rojo
crónico en un ítem con dueño.

**Tests a añadir.** Test de integración del script de salud que, dado un
`check-runs` fixture con `ci-complete: failure`, devuelve exit != 0 y nombra el
job.

**Criterios de aceptación.** `ci-complete` verde en el HEAD de `develop`;
verificado con `gh api` y citado en la propuesta.

**Dependencias.** A03, A04, A05, A08.

**Tokens:** ninguno. **Compatibilidad:** ninguna.

---

### AUD-A03 — ✅ RESUELTO por #49 — `closed-frozen-guard` usaba `mtime`

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** gobernanza
- **Propuesta:** `x00275` *(ya resuelto en `wip@65fcd88e`; pendiente de integrar)*

**Comportamiento actual.** El lint compara el `mtime` del fichero de cada
propuesta archivada contra su campo `archived-on`. Git **no preserva `mtime`**:
en un checkout limpio todos los ficheros reciben la hora del checkout, por lo que
los 129 ficheros de `legacy/closed/` aparecen siempre como "modificados".

**Evidencia** (log literal del job `lint-governance`, run `33076654689`):
```
2026-08-27T13:24:53Z a00033: [mtime-drift] file mtime (2026-08-27T13:24:32.701Z) is newer than
  archived-on (2026-08-24) — fix: revert the body to the archived state
  ... (129 líneas idénticas) ...
✗ closed-frozen-guard: 129 drifts in legacy/closed/
error: script "lint:closed-frozen-guard" exited with code 1
```
- Script: `tools/scripts/lint/closed-frozen-guard.script.ts`
- Lib: `tools/scripts/lint/lib/closed-frozen-guard.lib.ts`
- Ficheros afectados: `docs/mcp-vertex/proposals/legacy/closed/` (130 `.md`)

**Por qué es un problema.** Es una puerta que **no puede pasar nunca** en CI. Su
rojo no aporta información; sólo enmascara los rojos reales del mismo job
(`lint-governance` agrupa 15 lints y aborta en el primero que falla con
`set -euo pipefail`).

**Impacto.** `lint-governance` rojo permanente → `ci-complete` rojo permanente →
`main` bloqueada.

**Riesgo.** Ya materializado.

**Reproducción.** `git clone` limpio + `bun run lint:closed-frozen-guard` → 129
drifts.

**Solución mínima.** Congelar por **hash de contenido**, no por `mtime`:
mantener `legacy/closed/.frozen-hashes.json` con el `sha256` del cuerpo de cada
propuesta archivada y comparar contra él.

**Solución arquitectónica ideal.** Regla general del repo: **ningún gate puede
depender de metadatos del sistema de ficheros que git no versiona** (`mtime`,
`ctime`, permisos más allá del bit x, orden de directorio). Añadir un
meta-lint que detecte `statSync(...).mtime` en `tools/scripts/lint/**` y lo
rechace.

**Tests a añadir.**
- Spec: fichero con contenido intacto pero `mtime` reescrito → **0** drifts.
- Spec: fichero con un byte cambiado → 1 drift, nombrando el id.
- Meta-lint spec: un lint que lea `mtime` es rechazado.

**Criterios de aceptación.** `bun run lint:closed-frozen-guard` verde en clone
limpio; `touch` masivo sobre `legacy/closed/` no produce drift; editar un cuerpo
sí lo produce.

**Dependencias.** Ninguna. **Tokens:** ninguno. **Compatibilidad:** añade
`.frozen-hashes.json` (nuevo artefacto versionado).

---

### AUD-A04 — `verify-develop-health` explota con 403 en cada ejecución

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** CI / gobernanza
- **Propuesta:** `x00276`

**Comportamiento actual.** El script pide `/branches/{branch}/protection` con el
`GITHUB_TOKEN` del workflow. Ese token **no puede** leer branch protection
(requiere scope `administration`, que no es un `permissions:` válido de workflow).
`fetchProtection` sólo trata el 404; cualquier otro `!res.ok` lanza.

**Evidencia** (log del job `develop-health`, run `33076654604`):
```
error: GitHub API 403 on develop: {"message":"Resource not accessible by integration", ...}
  at .../tools/scripts/ci/verify-develop-health.script.ts:95:13
  at async .../verify-develop-health.script.ts:150:22
##[error]Process completed with exit code 1.
```
- `tools/scripts/ci/verify-develop-health.script.ts:93-101` (sin rama 401/403)
- Workflow: `.github/workflows/tier3.yml`, job `develop-health`, con
  `permissions: contents: read` y `GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}`

**Por qué es un problema.** Segunda puerta que no puede pasar nunca. Además es
inconsistente con su gemela `verify-branch-protection`, que **sí** trata el 403
(`UnverifiableProtectionError`) — dos scripts que consultan exactamente el mismo
endpoint con lógicas de error opuestas.

**Impacto.** `tier3` rojo permanente en cada push a `develop` y en cada nightly.

**Riesgo.** Ya materializado.

**Reproducción.** Ejecutar el job, o localmente con un token sin scope admin.

**Solución mínima.** Reutilizar `UnverifiableProtectionError` de
`verify-branch-protection.script.ts` (exportarla y compartirla), y devolver un
estado `unverified` distinguible de `unhealthy`.

**Solución arquitectónica ideal.** Extraer **un** cliente compartido
`tools/scripts/ci/lib/github-protection.lib.ts` con una única política de
errores, consumido por ambos verificadores; y hacer que el workflow acepte un
`BRANCH_PROTECTION_TOKEN` opcional: con él, verificación real; sin él, estado
`unverified` **explícito y visible en el job summary** (nunca verde silencioso —
ver `AUD-A05`).

**Tests a añadir.**
- Spec: fetch → 403 ⇒ salida `unverified`, exit 0, mensaje que nombra la rama.
- Spec: fetch → 404 ⇒ `protected: false`, exit 1.
- Spec: fetch → 200 con drift ⇒ exit 1.
- Spec de paridad: ambos verificadores producen el mismo veredicto para el mismo
  fixture.

**Criterios de aceptación.** `tier3/develop-health` verde (o `unverified`
explícito) sin token admin, y rojo con token admin si hay drift real.

**Dependencias.** Comparte solución con `AUD-A05` y `AUD-A06`.

**Tokens:** ninguno. **Compatibilidad:** ninguna.

---

### AUD-A05 — `verify-branch-protection` es un **falso verde** permanente

- **Clasificación:** BUG CONFIRMADO · **Severidad:** CRÍTICA · **Área:** gobernanza / CI
- **Propuesta:** `x00277`

**Comportamiento actual.** Cuando ninguna rama es legible (el caso real, siempre,
con el `GITHUB_TOKEN` del workflow), el script imprime "nothing verified, nothing
asserted" y **devuelve 0**. El job `branch-protection` de `tier3` aparece en
verde en todas las ejecuciones sin haber comprobado jamás nada.

**Evidencia.**
```ts
// tools/scripts/ci/verify-branch-protection.script.ts
if (res.status === 401 || res.status === 403) {
    throw new UnverifiableProtectionError(branch);
}
...
if (unverifiable.length === config.branches.length) {
    out('verify-branch-protection: no branch could be read with the token in use — nothing verified, nothing asserted.');
    return 0;   // ← verde
}
```
Y en el snapshot: `branch-protection  completed  success` (run `33076654604`),
mientras `develop` **no está protegida**.

**Por qué es un problema.** Es el patrón más peligroso de todos: una puerta que
informa éxito precisamente porque es ciega. La intención del código
("no puedo testificar, luego no acuso") es razonable en abstracto, pero el
resultado observable —un check verde— es indistinguible de "verificado y
correcto", y es exactamente lo que un revisor humano lee.

**Impacto.** La única puerta automática que vigila la gobernanza de ramas nunca
ha detectado nada, incluido el fallo real `AUD-A01` que ocurría delante de ella.

**Riesgo.** Crítico: falsa confianza en un control de seguridad.

**Reproducción.** Ver la ejecución de `tier3` sobre `ff289141`: job verde,
`develop` sin proteger.

**Solución mínima.** "No verificado" **no puede ser verde**. Emitir estado
neutro (`exit 0` + `::warning::` + job summary explícito) sólo si el workflow no
tiene token admin, y **fallar** si el token está presente pero la lectura falla.
Añadir el estado al `job summary` para que sea visible sin abrir el log.

**Solución arquitectónica ideal.** Modelo de tres estados en toda la familia de
gates: `pass` / `fail` / `unverified`, con `unverified` renderizado como un check
distinto (`branch-protection (unverified)`) y **excluido** de los required
checks. Un check que no puede fallar no debe ser un check.

**Tests a añadir.**
- Spec: todas las ramas 403 sin token ⇒ exit 0 **y** `status: 'unverified'` en la
  salida estructurada.
- Spec: todas las ramas 403 **con** token proporcionado ⇒ exit != 0.
- Spec: una rama legible con drift ⇒ exit 1 (no puede quedar tapado por otra
  ilegible).

**Criterios de aceptación.** Es imposible que el script devuelva "verde
verificado" sin haber leído al menos una rama; existe un test que lo demuestra.

**Dependencias.** A01, A04, A06.

**Tokens:** ninguno. **Compatibilidad:** cambia el nombre del check → actualizar
required checks si se añade.

---

### AUD-A06 — `allow_deletion` vs `allow_deletions`: drift falso garantizado

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** gobernanza
- **Propuesta:** `x00278`

**Comportamiento actual.** Los dos verificadores leen `live.allow_deletion`
(singular) de la respuesta de GitHub. La API REST devuelve **`allow_deletions`**
(plural). El campo leído es siempre `undefined`.

**Evidencia.**
- Respuesta real de la API para `main`:
  `"allow_deletions":{"enabled":false}` ← plural
- `tools/scripts/ci/verify-branch-protection.script.ts`, interfaz
  `IGitHubBranchProtectionResponse`: `readonly allow_deletion?: {...}` ← singular
  y comparación `if (live.allow_deletion?.enabled !== false)` → `undefined !== false` → **siempre drift**
- `tools/scripts/ci/verify-develop-health.script.ts`, `inspectBranch`:
  `allow_deletion: live?.allow_deletion?.enabled === false` → **siempre `false`**
  → `isHealthy()` devuelve siempre `false`
- La política declarada usa el nombre correcto:
  `.github/branch-protection.ts:47` → `readonly allow_deletions: boolean`

**Por qué es un problema.** Aunque se arreglen A04 y A05 y se proporcione un
token con scope admin, **ambos verificadores seguirían reportando drift falso en
todas las ramas para siempre**. Es un bug latente que se manifestará justo cuando
alguien intente hacer las cosas bien.

**Impacto.** Bloquearía la solución de A01/A04/A05.

**Riesgo.** Alto por efecto retardado: se descubriría después de invertir en el
token y la política.

**Reproducción.** Ejecutar cualquiera de los dos scripts con un PAT con scope
`repo` + admin contra `main` (que sí cumple la política) → reportará
`allow_deletion must be false (got undefined)`.

**Solución mínima.** Renombrar el campo a `allow_deletions` en ambas interfaces y
en las dos comparaciones.

**Solución arquitectónica ideal.** Tipar la respuesta de GitHub con un esquema
Zod derivado de la documentación oficial y **parsear** (no castear) la respuesta;
un campo desconocido o ausente se convierte en error de parseo explícito en vez
de en un `undefined` silencioso. El `as IGitHubBranchProtectionResponse` actual
es la causa raíz de que un typo sobreviva a la compilación.

**Tests a añadir.**
- Spec con un fixture que es **la respuesta literal de la API para `main`**
  (copiada de esta auditoría) ⇒ `0 drifts`. Este test habría atrapado el bug.
- Spec de contrato: el parser rechaza una respuesta sin `allow_deletions`.

**Criterios de aceptación.** Fixture de `main` real ⇒ sin drift; fixture con
`allow_deletions.enabled = true` ⇒ drift.

**Dependencias.** Debe entrar **antes** que A01/A05.

**Tokens:** ninguno. **Compatibilidad:** ninguna.

---

### AUD-A07 — `BRANCH_PROTECTION.defaults` declarado y nunca consumido

- **Clasificación:** BUG CONFIRMADO · **Severidad:** MEDIA · **Área:** gobernanza
- **Propuesta:** `x00279`

**Comportamiento actual.** El config expone `defaults.{enforce_admins,
required_linear_history, allow_force_pushes, allow_deletions}` como "booleanos
que aplican a cada rama". Los verificadores **hardcodean** las expectativas
(`if (live.enforce_admins?.enabled !== true)`) y sólo usan `config.defaults` para
imprimir en `--dry-run`.

**Evidencia.**
- `.github/branch-protection.ts:41-48` (declaración) y `:57-62` (valores)
- `verify-branch-protection.script.ts` → `diffBranch()` no recibe `defaults`; el
  único uso es la línea de `--dry-run`:
  `enforce_admins=${config.defaults.enforce_admins}`
- `verify-develop-health.script.ts` → `isHealthy()` exige los cuatro valores
  hardcodeados

**Por qué es un problema.** Poner `allow_force_pushes: true` en el config no
cambiaría nada: el verificador seguiría exigiendo `false`. Es configuración
decorativa, y erosiona la confianza en el resto del fichero, que sí es real.

**Impacto.** Bajo funcionalmente, alto en confianza. Impide la política
bifurcada que pide `AUD-A01`.

**Riesgo.** Medio: alguien "configura" la política y no se aplica.

**Reproducción.** Cambiar `defaults.enforce_admins` a `false` y ejecutar el
verificador contra una rama sin `enforce_admins`: sigue reportando drift.

**Solución mínima.** Pasar `config.defaults` a `diffBranch`/`inspectBranch` y
comparar contra ellos.

**Solución arquitectónica ideal.** Permitir override por rama
(`branches[].overrides`) para soportar el modelo "main estricto / develop
flexible" sin duplicar el fichero, y añadir `enforcement: 'required' | 'advisory'`
(ver `AUD-A01`).

**Tests a añadir.** Spec: `defaults.allow_force_pushes = true` + rama con
force-push habilitado ⇒ 0 drifts.

**Criterios de aceptación.** Todo campo de `defaults` cambia el veredicto en al
menos un test.

**Dependencias.** A01, A06. **Tokens:** ninguno. **Compatibilidad:** ninguna.

---

### AUD-A08 — ✅ RESUELTO por #49 — `tier2` invocaba un script inexistente

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** CI
- **Propuesta:** `x00280` *(ya resuelto en `wip@e6670e8f`; pendiente de integrar)*

**Comportamiento actual.** `.github/workflows/tier2.yml`, job `lint-full`, paso
"Run biome and architecture lints", ejecuta `bun run lint:architecture`. Ese
script **no está definido** en el `package.json` raíz (existen
`lint:architecture-readfile-via-safe-reader` y otros, pero no `lint:architecture`).
Con `set -eu`, el job aborta.

**Evidencia.** Comprobación programática sobre el snapshot de `develop`:
```
scripts referenced in workflows via 'bun run X' that DO NOT exist in root package.json
MISSING: lint:architecture -> tier2.yml
```
Y el histórico de runs de `tier2` en `wip`: `failure` en `d4a5ac11`, `65fcd88e`,
`37c0a580` — hasta que `e6670e8f` ("fix(ci): invoke scripts that exist, and gate
that they do") lo corrige.

**Por qué es un problema.** `tier2` es el gate de pre-merge de PR. Estar
permanentemente rojo lo convierte en ruido y entrena al equipo a mergear con
checks rojos — que es exactamente lo que ha pasado.

**Impacto.** Gate de PR inútil.

**Riesgo.** Alto (erosión de la disciplina de merge).

**Reproducción.** `bun run lint:architecture` → `error: Script not found`.

**Solución mínima.** Sustituir por la lista real de lints de arquitectura (la
misma que usa `ci.yml/lint-architecture`), o definir el alias `lint:architecture`
en `package.json`.

**Solución arquitectónica ideal.** Un lint —`lint:referenced-scripts-exist`—
que parsee **todos** los `.github/workflows/*.yml`, `lefthook.yml` y la cadena
`validate`, extraiga cada `bun run <script>` y falle si alguno no existe. La
clase entera de bug desaparece. (Este lint ya existe en el repo para otras rutas;
hay que extenderlo a workflows y añadirlo a `ci.yml`.)

**Tests a añadir.**
- Spec del lint con un workflow fixture que invoca un script inexistente ⇒ falla
  nombrando fichero y script.
- Spec con todos los scripts existentes ⇒ pasa.

**Criterios de aceptación.** `bun run lint:referenced-scripts-exist` cubre
workflows y forma parte de `ci.yml`; `tier2` verde.

**Dependencias.** Ninguna. **Tokens:** ninguno. **Compatibilidad:** ninguna.

---

### AUD-A09 — `bun run lint` sólo cubre `extensions/vscode`: el 97% del monorepo no pasa por Biome

- **Clasificación:** BUG CONFIRMADO · **Severidad:** CRÍTICA · **Área:** CI / calidad
- **Propuesta:** `x00281`

**Comportamiento actual.**
```json
"lint": "bun tools/scripts/lib/with-compute-lock.script.ts lint -- 'biome ci extensions/vscode && bun run --cwd extensions/vscode check:i18n'"
```
`biome.json` incluye `"**"` con exclusiones sensatas — pero la **invocación**
restringe el análisis a `extensions/vscode`. `packages/`, `plugins/`, `apps/` y
`tools/` nunca se analizan. Y `bun run lint` es lo que ejecutan `ci.yml/lint-biome`,
`tier1/affected-lint` y `tier2/lint-full`: **las tres**.

**Evidencia.** Ejecución real de Biome sobre el snapshot con el `biome.json` del
repo:
```
$ biome ci --config-path=<snapshot>/biome.json packages plugins tools apps
Checked 3320 files in 1599ms.
Found 45 errors.
Found 119 warnings.
Found 127 infos.
```
Muestra de ficheros con **errores** (no warnings):
`packages/core/src/lib/scan/catch-swallow.ts` (2), `.../dip-violation.ts` (2),
`.../long-chains.ts` (2), `.../long-chains-fix.ts` (2), `.../magic-numbers.ts` (1),
`packages/cli/src/commands/groups/docs.spec.ts` (2), …
Y 21 ficheros con formato divergente, entre ellos
`plugins/commit-policy/package.json`, `plugins/memory/src/lib/services/store-watcher.ts`,
`tools/scripts/ci/verify-branch-protection.script.ts`.

**Por qué es un problema.** El proyecto invierte mucho en lints propios y ratchets
de convención, y sin embargo el linter estándar —el que atrapa los errores
baratos— cubre el 3% del árbol. `affected-lint` en `tier1` incluso documenta
"Run biome on affected paths" mientras llama al lint global recortado; la
intención y la implementación divergen en el comentario mismo.

**Impacto.** 45 errores reales acumulados, invisibles; formato divergente en 21
ficheros; ninguna barrera contra que crezcan.

**Riesgo.** Alto y creciente.

**Reproducción.** Ver el comando de la evidencia.

**Solución mínima.** `biome ci .` en la raíz, con una **baseline** temporal
(`--changed` o una lista de supresiones con fecha de caducidad) para no bloquear
en el primer día; y arreglar los 45 errores en un PR aparte.

**Solución arquitectónica ideal.** Adoptar el patrón de ratchet que el repo ya usa
en `lint:file-conventions` y `lint:solid`: fichero `biome.baseline.json` con el
recuento actual por regla, que **sólo puede bajar**. Permite activar el lint
completo hoy sin un PR gigante, y garantiza convergencia monótona.

**Tests a añadir.**
- Spec del ratchet: introducir una violación nueva ⇒ falla; quitar una ⇒ la
  baseline debe actualizarse (falla si no se actualiza).
- Test de cobertura: el comando de lint incluye todos los workspaces declarados
  en `package.json#workspaces`.

**Criterios de aceptación.** `bun run lint` analiza ≥3300 ficheros; la baseline
tiene ≤ el recuento actual; existe un test que falla si un workspace nuevo queda
fuera.

**Dependencias.** Independiente. **Tokens:** ninguno. **Compatibilidad:** ninguna
(sólo cambios de formato/estilo).

---

### AUD-A10 — Solapamiento y coste redundante entre `ci.yml` y `tier1/2/3`

- **Clasificación:** DEUDA TÉCNICA · **Severidad:** MEDIA · **Área:** CI
- **Propuesta:** `r00035`

**Comportamiento actual.** En un PR a `develop` se disparan `ci.yml` (16 jobs,
cada uno con su propio checkout + `bun install`), `tier1` (3 jobs), `tier2`
(4 jobs) y `affected`. `typecheck` se ejecuta 2 veces, `bun run lint` 3 veces,
la suite de vitest 3 veces (`ci/tests`, `tier1/affected-tests`, `tier2/tests`).
`bun run build` se ejecuta en `pack-smoke`, `metrics-gate` y `tier3/pack-smoke`
por separado.

**Evidencia.** `.github/workflows/{ci,tier1,tier2,tier3,affected}.yml`; los 16
jobs de `ci.yml` repiten el bloque checkout/setup-bun/install.

**Por qué es un problema.** Minutos de CI y latencia de feedback; además,
`tier2` no es un required check (sólo lo es `ci-complete`), así que su valor
marginal sobre `ci.yml` es dudoso.

**Impacto.** Coste y lentitud; contribuye a que se ignoren checks.

**Riesgo.** Medio.

**Reproducción.** Abrir un PR y contar jobs.

**Solución mínima.** Eliminar de `tier2` lo que `ci.yml` ya cubre idénticamente
(`typecheck`, `tests`, `lint`), dejándolo como el gate *ready-for-review* que
añade lo que `ci` no hace.

**Solución arquitectónica ideal.** Un workflow reutilizable
(`.github/workflows/_setup.yml` con `workflow_call`) para checkout+bun+install
con caché compartida, y una matriz declarativa de gates con `tier` como input,
de modo que la pertenencia de cada gate a un tier viva en **un** sitio.
Complementar con `bun run build` una sola vez y compartir `dist/` vía artifact.

**Tests a añadir.** Lint de workflows que detecte el mismo comando en dos tiers
que se disparan en el mismo evento.

**Criterios de aceptación.** Un PR a `develop` no ejecuta el mismo comando dos
veces; tiempo total de feedback documentado antes/después.

**Dependencias.** Hacer después de A08 y A09 (para no mover una diana en
movimiento). **Tokens:** ninguno. **Compatibilidad:** cambia nombres de checks.

---

### AUD-A11 — `tier1/affected-tests` usa dos espacios de nombres distintos: el filtro nunca casa

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** CI
- **Propuesta:** `x00282`

**Comportamiento actual.** `affected.script.ts` emite **nombres de paquete npm**
(`@mcp-vertex/core`, `@mcp-vertex/git`). `tier1.yml` los pasa a
`vitest run --project <ws>`. Vitest identifica proyectos por su `name` de
configuración, que en este repo es **corto** cuando el `vitest.config.ts` local lo
declara (`core`, `git`, `project-health`) y sólo coincide con el nombre de paquete
cuando no lo declara (`@mcp-vertex/cli`). Los dos espacios de nombres se solapan
por accidente, no por contrato.

**Evidencia (ejecutada en vivo).**
```
$ bun tools/scripts/ci/affected.script.ts --base ff289141... --head HEAD --set-file /tmp/a2.set
affected: mode=diff affected=16 ...
$ cat /tmp/a2.set
@mcp-vertex/shared
mcp-vertex-vscode
@mcp-vertex/cli
@mcp-vertex/core
@mcp-vertex/orchestrator-runner
tools
...

$ bunx vitest run --project '@mcp-vertex/core'
Error: No projects matched the filter "@mcp-vertex/core".
$ bunx vitest run --project 'core'          # ok
$ bunx vitest run --project '@mcp-vertex/git'
Error: No projects matched the filter "@mcp-vertex/git".
$ bunx vitest run --project 'git'            # ok
```
Nombres reales declarados: `packages/core/vitest.config.ts` → `name: 'core'`;
`plugins/git/vitest.config.ts` → `name: 'git'`.
Emisión: `tools/scripts/ci/affected.script.ts:219` (`const name = pkg.name`) y
`:399` (`writeFileSync(setPath, result.affected.join('\n'))`).
Consumo: `.github/workflows/tier1.yml`, paso *Run vitest on affected projects*.

Además, en el log real del job `affected-tests` (run `33102685461`) se observan
badges de proyecto `core`, `project-health` y `@mcp-vertex/cli` ejecutándose —
es decir, **la suite completa**, no el subconjunto afectado: el gate "rápido"
tarda minutos y no cumple su contrato documentado ("per-PR feedback loop under a
minute").

**Por qué es un problema.** Doble fallo: (a) cuando el workspace afectado tiene
nombre corto, `vitest` aborta con *No projects matched* y el gate se vuelve rojo
por una razón que no tiene nada que ver con el cambio; (b) cuando cae en el
`else`, ejecuta todo y el ahorro prometido es cero. En ninguna de las dos ramas
hace lo que dice hacer.

**Impacto.** El gate rápido no es rápido ni escogido; y puede fallar por un
error de nomenclatura ajeno al cambio del PR.

**Riesgo.** Alto: es el gate en el que más se confía por ser el primero.

**Reproducción.** Los comandos de la evidencia.

**Solución mínima.** Emitir desde `affected.script.ts` un segundo campo
`vitestProjects[]` resuelto leyendo el `name` del `vitest.config.ts` de cada
workspace (con fallback al `pkg.name`), y consumir ése en `tier1.yml`.

**Solución arquitectónica ideal.** Un artefacto generado
`build/ci/workspace-project-map.json` (workspace path → package name → vitest
project name) producido por un script único, con drift check en `check:generated`.
Elimina de raíz la clase "dos identidades para la misma cosa", que es la misma
causa de `AUD-A08` y `AUD-A06`.

**Tests a añadir.**
- Spec de integración: para **cada** workspace, el nombre emitido por
  `affected.script.ts` casa con un proyecto real de vitest (el test recorre la
  config de vitest, no una lista hardcodeada).
- Guard en el job: con un affected-set no vacío, el número de tests ejecutados
  debe ser > 0 y **menor** que el total (prueba de que hubo scoping real).

**Criterios de aceptación.** Cambiando sólo `plugins/git/**`, el job ejecuta los
specs de `git` y no los de `core`, y lo demuestra en el log.

**Dependencias.** Ninguna. **Tokens:** ninguno. **Compatibilidad:** ninguna.
---

### AUD-A12 — `tools/` no lo typechequea nadie: 95 errores de TypeScript invisibles

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** CI / calidad
- **Propuesta:** `x00294`

**Comportamiento actual.** `bun run typecheck` ejecuta
`tsc --noEmit -p tsconfig.json`, **un solo proyecto**, cuyo `include` no contiene
`tools/**`. Existe un `tools/tsconfig.json` que sí lo cubre — y **nada lo
invoca**.

**Evidencia.**
```
$ node -e 'console.log(require("fs").readFileSync("tsconfig.json","utf8"))'
"include": [ "packages/*/src/**/*", …, "plugins/*/tests/**/*",
             "docs/mcp-vertex/examples/*/…", "scripts/**/*" ]     ← no tools/**

$ cat tools/tsconfig.json
{ "extends": "../tsconfig.json",
  "include": ["scripts/**/*.ts", "scripts/**/*.spec.ts", "vitest.config.ts"] }

$ grep -rn "tools/tsconfig" package.json .github/workflows/ tools/scripts/ lefthook.yml
(sin resultados — nadie lo ejecuta)

$ bunx tsc --noEmit -p tools/tsconfig.json 2>&1 | grep -c "error TS"
95
```
Repartidos en **29 ficheros**. Distribución: 29×TS2322, 13×TS18048,
9×TS2339, 7×TS7006, 7×TS2345, 6×TS2532, 6×TS2352, **4×TS2367**, y una cola.

Nótese además que `tools/tsconfig.json` sólo incluye `scripts/**`: `tools/tests/**`
—donde viven los specs de los verificadores de CI— no lo cubre ni ese proyecto.

**Por qué es un problema.** `tools/` son **303 ficheros y 56.143 líneas**: todos
los lints, generadores, verificadores y scripts de CI del repositorio. Es el
código que decide si el resto del código pasa. Y es el único área grande del
monorepo sin ninguna comprobación de tipos, por la misma razón que `AUD-A09`:
la puerta existe, pero su alcance no es el que todo el mundo supone.

Los `TS2367` son especialmente significativos: son comparaciones que el
compilador demuestra **siempre falsas**. Cada una es una comprobación muerta que
alguien escribió creyendo que protegía algo. Una de ellas es un fallo de
seguridad real — ver `AUD-D07`.

**Impacto.** 95 defectos de tipo acumulados sin barrera, en el código que
gobierna la calidad de todo lo demás.

**Riesgo.** Alto, y ya materializado (`AUD-D07`).

**Reproducción.** Los cuatro comandos de la evidencia.

**Solución mínima.** Añadir `bunx tsc --noEmit -p tools/tsconfig.json` al script
`typecheck` y al job `typecheck` de `ci.yml`, con una baseline si los 95 errores
no se pueden arreglar de golpe.

**Solución arquitectónica ideal.** Que `typecheck` derive los proyectos a
comprobar de `package.json#workspaces` en vez de apoyarse en un `include`
mantenido a mano, y un test que falle si un workspace declarado no queda cubierto
por ningún proyecto de TypeScript. Es la misma corrección de fondo que `AUD-A09`
(alcance del lint) y `AUD-A11` (mapa workspace↔proyecto): **derivar el alcance
del manifiesto, no repetirlo a mano**.

**Tests a añadir.**
- Test de cobertura: para cada entrada de `workspaces`, existe un proyecto de
  TypeScript que la incluye. Falla hoy con `tools`.
- Añadir `tools/tests/**` al `include` de `tools/tsconfig.json` y comprobar que
  los specs de los verificadores compilan.
- Ratchet de la baseline de 95 errores, que sólo puede bajar.

**Criterios de aceptación.** `bun run typecheck` cubre `tools/`; la baseline
arranca en 95 y sólo baja; ningún workspace queda fuera de todo proyecto.

**Dependencias.** Ninguna. **Tokens:** ninguno. **Compatibilidad:** ninguna.

*Hallazgo aportado por el subagente que implementó `AUD-A04`–`AUD-A07`, al
observar que el gate `typecheck` de su propio slice no cubría su territorio.
Verificado de forma independiente antes de incluirse.*

---

### AUD-D07 — El guard que impide sondear herramientas con efectos es siempre falso para 33 de ellas

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** seguridad / verificación
- **Propuesta:** `x00295`

**Comportamiento actual.** `runEmptyInputProbe` protege al arnés `verify:tools` de
invocar con `{}` herramientas que declaran efectos secundarios. El comentario
explica el peligro con precisión: *"invoking them with `{}` would execute real
subprocesses (e.g. `run_quality` running `vitest`, `tsc`, `bun run build`) and
hang the verify harness"*. El guard es:

```ts
// tools/scripts/verify/verify-probes.ts:90-95
tool.effects.some((e) => e === 'spawn' || e === 'fs:write' || e === 'network')
```

El tipo real es
`IToolEffect = 'write' | 'spawn' | 'network' | 'destructive'`
(`packages/core/src/lib/contracts/interfaces/tool-registration.interface.ts:13`).
El guard compara **tres** literales contra un union de **cuatro** miembros:

| Miembro del union | ¿Lo cubre el guard? | Resultado |
| --- | --- | --- |
| `'network'` | sí | protegido |
| `'spawn'` | sí | protegido |
| `'write'` | **no** — el guard escribe `'fs:write'` | **desprotegido** |
| `'destructive'` | **no** — ni siquiera aparece | **desprotegido** |

Es decir: **dos de los cuatro efectos no se saltan**, incluido `'destructive'`,
que es el más peligroso del union y no figura ni como literal mal escrito. El
`'fs:write'` es un typo por `'write'`.

*(Corrección: una versión anterior de esta tabla afirmaba que `'spawn'` tampoco
estaba en el union. Sí está y sí funciona. El error vino de leer literalmente el
mensaje de TS2367 —que nombra sólo `"destructive" | "network" | "write"` porque
el estrechamiento de flujo de `some()` ya había consumido `'spawn'` en la rama
anterior— en vez de leer la definición del tipo. La conclusión práctica no
cambia.)*

**Evidencia.**
```
$ bunx tsc --noEmit -p tools/tsconfig.json | grep TS2367
tools/scripts/verify/verify-probes.ts(93,28): error TS2367: This comparison
  appears to be unintentional because the types
  '"destructive" | "network" | "write"' and '"fs:write"' have no overlap.

$ grep -rn "effects: \['write'\]" plugins/*/src --include='*.ts' | wc -l
33
```
El compilador **ya informa del fallo**. Nadie lo ve porque `tools/` no se
typecheca (`AUD-A12`).

**Por qué es un problema.** El guard sólo cubre `network`. Las **33 herramientas
que declaran `effects: ['write']` a secas** —entre ellas `memory_compact`,
`external-mcps ack` e `issues ingest_issue`— **no se saltan**, y el arnés las
invoca con entrada vacía. Y `'destructive'`, el efecto más peligroso del union,
no está contemplado en absoluto: no aparece ni siquiera como literal mal escrito.

Es el tercer ejemplar del patrón central de esta auditoría: una comprobación que
parece proteger, se lee como si protegiera, y es inerte. Aquí con el agravante de
que el mecanismo que lo habría detectado —el compilador— sí lo detecta, y está
apagado.

**Impacto.** El arnés de verificación invoca con `{}` herramientas que escriben.
Que hoy no haya causado daño depende de que sus `inputSchema` rechacen el
payload vacío antes de llegar al handler — es decir, de una segunda barrera que
nadie eligió como barrera.

**Riesgo.** Alto. Una herramienta `write` con todos sus campos opcionales se
ejecutaría de verdad durante `verify:tools`.

**Reproducción.** Los dos comandos de la evidencia; y añadir una herramienta con
`effects: ['write']` e `inputSchema` de campos opcionales, y correr `verify:tools`.

**Solución mínima.** Comparar contra los cuatro literales reales del union.

**Solución arquitectónica ideal.** Que el guard **no enumere literales**: si
`tool.effects` no está vacío, no se sondea. Enumerar valores de un union en otro
módulo es precisamente lo que permite que se desincronicen. Y tipar el parámetro
con el union importado en vez de con `string`, para que el compilador rechace un
literal inexistente en vez de evaluarlo a `false`.

**Tests a añadir.**
- Spec por cada miembro del union (`destructive`, `write`, `network`) ⇒
  `needs-input`, no invocación. Falla hoy para dos de los tres.
- Spec: herramienta sin efectos declarados ⇒ sí se sondea.
- Test de exhaustividad: un `switch` sobre el union con `never` en el default, de
  modo que añadir un efecto nuevo rompa la compilación hasta contemplarlo.

**Criterios de aceptación.** Ninguna herramienta con efectos declarados se
invoca con entrada vacía; añadir un efecto nuevo al union rompe la compilación
del guard hasta tratarlo.

**Dependencias.** `AUD-A12` es lo que hace visible esta clase de fallo; este
arreglo no debe entrar sin él, o el siguiente volverá a pasar desapercibido.

**Tokens:** ninguno. **Compatibilidad:** ninguna.

**Nota adyacente.** El cuarto y último grupo de `TS2367` está en
`tools/scripts/lint/no-internal-imports.script.ts:164`, donde
`name === 'node_modules' || name === 'dist' || name === 'coverage'` compara
`NonSharedBuffer` con `string` y es siempre falso: el recorrido **desciende a
`node_modules`**. Es de menor gravedad porque ese script es huérfano — no lo
referencia ni `package.json` ni ningún workflow (el gate real es
`no-internal-core-imports.script.ts`, otro fichero). Debe borrarse o conectarse;
un lint muerto en el árbol es una trampa para el siguiente lector.

---

## 6. Track B — economía de tokens

### Análisis cuantitativo: de dónde viene realmente el coste

Todos los números salen de `docs/mcp-vertex/TOKEN-BUDGETS.md` (generado por
`tools/scripts/report/token-budget-dashboard.script.ts` desde el ensamblaje real
de presets a través del loader real) en el snapshot auditado.

**Descomposición de `tools/list` por componente, preset `vertex` (37 plugins, 187 tools):**

| Componente | Bytes | % del total |
| --- | ---: | ---: |
| **outputSchema** | **187.067** | **65,9 %** |
| inputSchema | 55.036 | 19,4 % |
| descriptions | 17.781 | 6,3 % |
| resto (nombres, envelope JSON, annotations) | 24.035 | 8,4 % |
| **Total `tools/list`** | **283.919** | 100 % |

Estimación: ~70.980 tokens (bytes/4). Con `gpt-tokenizer` real sobre el bootstrap
adaptativo el ratio medido es ~4,25 B/token, así que la estimación por bytes es
conservadora pero del orden correcto.

**El mismo desglose para cada preset gobernado:**

| Preset | Plugins | Tools | Bytes | outputSchema | inputSchema | descriptions | % outputSchema |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| minimal | 2 | 33 | 58.634 | 39.715 | 11.915 | 3.029 | 67,7 % |
| lean | 4 | 45 | 69.215 | 44.811 | 15.179 | 3.763 | 64,7 % |
| standard | 19 | 93 | 129.235 | 82.580 | 26.860 | 8.130 | 63,9 % |
| swarm | 27 | 159 | 197.787 | 118.513 | 45.074 | 14.084 | 59,9 % |
| full | 31 | 166 | 206.469 | 122.786 | 48.136 | 14.563 | 59,5 % |
| vertex | 37 | 187 | 283.919 | 187.067 | 55.036 | 17.781 | 65,9 % |
| **adaptive (todos)** | — | **6** | **8.934** | **6.670** | 1.020 | 526 | **74,7 %** |

**Concentración por herramienta** (preset `vertex`, top 5 de 187):

| Herramienta | Owner | Bytes | de los cuales outputSchema | % |
| --- | --- | ---: | ---: | ---: |
| `orchestrator-runner_advise_routing` | orchestrator-runner | 12.992 | 12.157 | 93,6 % |
| `orchestrator-runner_invoke` | orchestrator-runner | 10.191 | 9.127 | 89,6 % |
| `quality-policy_quality_policy` | quality-policy | 8.319 | 7.902 | 95,0 % |
| `usage-tracking_usage_report` | usage-tracking | 6.629 | 5.817 | 87,8 % |
| `plan_mcp_project` | core | 6.486 | 5.184 | 79,9 % |
| **Top 5** | — | **44.617** | **40.187** | **90,1 %** |
| Top 20 | — | ~99.400 | — | ~35 % del preset |

**Concentración por owner** (preset `minimal`, 2 plugins): `core` aporta 24 tools
y **51.786 B — el 88,4 %**, de los cuales 35.996 B son outputSchema. Es decir: el
preset "mínimo" ya cuesta 58,6 KB porque el core registra 24 herramientas
siempre-encendidas.

### AUD-B01 — Los `outputSchema` son el 66% del coste; las descripciones el 6%

- **Clasificación:** MEJORA (máximo ROI) · **Severidad:** ALTA · **Área:** tokens
- **Propuesta:** `v00129` (core) + `v00130` (orchestrator-runner) + `v00131` (quality-policy/usage-tracking)

**Comportamiento actual.** Cada herramienta publica su `outputSchema` Zod
completo, serializado a JSON Schema, en `tools/list`. Nadie lo poda, no hay
`detail level`, y el mismo esquema viaja aunque la respuesta real sea un envelope
compacto.

**Evidencia.** Tablas anteriores; `tool-surface-runtime.service.ts` →
`measureSchemaBytes()` incluye `outputSchema` sin recorte; `toJsonSchema()`
serializa el Zod entero.

**Por qué es un problema.** El `outputSchema` de MCP es **opcional** y su
utilidad para el modelo es marginal comparada con su coste: el modelo casi nunca
necesita el shape exacto de la respuesta *antes* de llamar; lo necesita *después*,
y entonces ya lo tiene en la respuesta. Estamos pagando 187 KB por adelantado
para describir algo que llega después de todos modos.

**Impacto.** ~46.700 tokens del preset `vertex` (66% de ~71k) y ~1.670 tokens del
bootstrap adaptativo (75% de 2.234) son outputSchema. En una ventana de 200k, la
superficie `vertex` consume el 35% antes de leer una línea de código.

**Riesgo.** Bajo al cambiar (el campo es opcional en la spec MCP), medio si algún
host lo usa para validar.

**Reproducción.** `bun tools/scripts/report/token-budget-dashboard.script.ts` y
leer la columna `OutputSchema Bytes`.

**Solución mínima (ROI inmediato, ~40 KB en `vertex`).** Podar los 5 esquemas más
caros: sustituir estructuras profundas por un envelope compacto con
`additionalProperties: true` y un puntero al esquema completo vía recurso MCP.
`advise_routing` sola vale 12,2 KB.

> **CORRECCIÓN (implementación de `v00129`).** Dos números de este hallazgo eran
> míos y estaban mal. (1) `advise_routing` **no** vale 12,2 KB: medida en el
> dashboard son **8.804 B totales, 7.969 B de `outputSchema`**. (2) El «top 5 ≈
> 40 KB» sólo reproduce **mezclando tres propuestas distintas** — `invoke` y
> `advise_routing` son de `orchestrator-runner` (→ `v00130`), `quality_policy` y
> `usage_report` de quality-policy/usage-tracking (→ `v00131`), y sólo
> `plan_mcp_project` cae en el ámbito de `v00129`. Dentro del territorio real de
> `v00129` (core + error-reporting) el top 5 suma **20.972 B**, no 40 KB. Lo que
> sí reproduce exactamente es la tesis del hallazgo: `outputSchema` era el
> **65,5%** del preset `vertex` (184.286 B de 281.138 B), contra el 66% publicado.
>
> Resultado medido tras podar cinco esquemas: `vertex` **281.138 → 260.836 B**
> (−7,2%), y el bootstrap adaptativo —lo que el modelo paga en cada sesión—
> **8.934 → 4.900 B, un −45%**.
>
> Nota de diseño que invalida parte de la arquitectura ideal: `v00128` comprobó
> que zod v4 y el SDK de MCP **no deduplican `$ref`**, así que el «envelope
> compartido como `$defs`» no ahorra nada en esta pila. Por eso la implementación
> usa esquemas compactos por herramienta y no la indirección propuesta arriba.

**Solución arquitectónica ideal — "compact output contract".**
1. **Envelope compartido.** Un único `IToolEnvelope` (`{ ok, summary, data?, diagnostic?, next? }`)
   declarado **una vez** como `$defs` y referenciado con `$ref` por todas las
   tools. Hoy cada tool repite la misma estructura de envelope; el coste se
   multiplica por 187.
2. **Niveles de detalle.** `outputSchema` publicado sólo en el nivel `full`;
   en `compact`/`normal` se omite (la spec lo permite) y se expone bajo demanda
   por `tool_details` (que ya existe: `TOOL_DETAILS_PREFIX`).
3. **Recursos en vez de esquemas.** Publicar los esquemas completos como
   **resources** MCP (`mcp-vertex://schemas/<tool>`), que el cliente lee sólo si
   los necesita. Esto es exactamente para lo que existen los resources.
4. **Presupuesto por modelo.** `modelAwareBudgets: { 'claude-*': 12_000, 'gpt-*': 10_000 }`
   con poda automática de los esquemas más caros hasta entrar en presupuesto,
   ordenando por `bytes / uso_observado` (ver `AUD-B05`).

**Tests a añadir.**
- Test de presupuesto: `tools/list` del preset `vertex` ≤ 120.000 B (objetivo
  tras la poda) — como *hard ceiling nuevo*, no como ratchet hacia arriba.
- Test de invariante: `outputSchemaBytes / totalBytes < 0,35` en todos los
  presets gobernados.
- Test de contrato: para toda tool con `outputSchema` omitido en `tools/list`,
  `tool_details` devuelve el esquema completo.
- Test de no-regresión: el envelope compartido aparece **una** vez en el payload
  serializado (contar ocurrencias del `$defs`).

**Criterios de aceptación.** `vertex` ≤ 120 KB; bootstrap adaptativo ≤ 4.500 B;
ninguna tool pierde capacidad funcional; `metrics-gate` no reporta regresión de
latencia.

**Dependencias.** B02 (dashboard honesto) debe ir antes para poder medir el
progreso.

**Tokens:** −55 % objetivo. **Compatibilidad:** un host que exigiera
`outputSchema` obligatorio se vería afectado → publicar como *breaking* menor y
documentar el `detail` que lo restaura.

---

### AUD-B02 — El dashboard reporta "over hard (0B)" en 4 de 6 presets por un `?? 0`

- **Clasificación:** BUG CONFIRMADO · **Severidad:** MEDIA · **Área:** tokens / observabilidad
- **Propuesta:** `x00283`

**Comportamiento actual.** `marginalPluginHard` sólo está definido para `lean` y
`swarm`. El dashboard hace `hard: toolsListBudget.marginalPluginHard ?? 0`, así
que para `minimal`, `standard`, `full` y `vertex` el techo marginal es **0 bytes**
y cualquier plugin lo supera. La columna `Marginal Status` dice `over hard (0B)`
en el artefacto versionado, mientras `tokens-budget-real` está en verde.

**Evidencia.**
- `tools/scripts/report/token-budget-dashboard.script.ts:167` → `hard: toolsListBudget.marginalPluginHard ?? 0`
- `packages/core/src/lib/contracts/constants/token-budgets.constant.ts` →
  `marginalPluginHard` sólo en `lean` (30_000) y `swarm` (80_000)
- `docs/mcp-vertex/TOKEN-BUDGETS.md`, columna `Marginal Status`:
  `over hard (0B)` para minimal/standard/full/vertex
- `packages/core/tests/src/lib/e2e/token-budget.e2e.spec.ts:360,393` — sólo
  asserta el marginal de `swarm` y `lean`

**Por qué es un problema.** Un documento generado y versionado afirma una
violación permanente que ningún gate comparte. Entrena a leer el dashboard
ignorando su columna de estado, que es justo la que debería mirarse.

**Impacto.** Pérdida de valor del artefacto de observabilidad más importante del
proyecto.

**Reproducción.** Abrir `docs/mcp-vertex/TOKEN-BUDGETS.md` y buscar `over hard (0B)`.

**Solución mínima.** Renderizar `n/a` cuando `marginalPluginHard` es `undefined`.

**Solución arquitectónica ideal.** Hacer `marginalPluginHard` **obligatorio** en
`ITokenBudgetSurface` para todo preset gobernado (el tipo lo fuerza, el
compilador lo detecta) y darle un valor real a los cuatro que faltan. Un techo
opcional en un contrato de presupuesto es una contradicción.

**Tests a añadir.**
- Spec: preset sin `marginalPluginHard` ⇒ estado `n/a`, nunca `over hard`.
- Test de tipo/contrato: los 6 presets gobernados declaran techo marginal.
- Guard: el markdown generado no contiene la cadena `(0B)`.

**Criterios de aceptación.** `TOKEN-BUDGETS.md` no contiene `over hard (0B)`;
los 6 presets gobernados tienen techo marginal explícito.

**Dependencias.** Ninguna. **Tokens:** ninguno. **Compatibilidad:** ninguna.

---

### AUD-B03 — Los techos se han ido subiendo hasta justo por encima de la medición: son descriptivos, no prescriptivos

- **Clasificación:** RIESGO DE DISEÑO · **Severidad:** MEDIA · **Área:** tokens / gobernanza
- **Propuesta:** `r00036`

**Comportamiento actual.** Los comentarios del propio contrato documentan la
subida: *"the current 69,115 B roster needs a small, explicit guard band"* →
`hard: 70_000`; *"the bump covers that cost plus a small safety margin"* →
`swarm.hard: 210_000`. `minimal` mide 58.634 B con `warning: 58_000` (ya
superado) y `hard: 64_000` (9% de margen).

**Evidencia.** `token-budgets.constant.ts:152-205`, comentarios y valores;
`TOKEN-BUDGETS.md` marca `minimal` y `lean` como `over warning`.

**Por qué es un problema.** Existe una `bumpPolicy` con cuatro pasos
(`justify-the-cost`, `show-the-benefit`, `attempt-a-compensation`,
`document-the-decision`) pero **no hay ninguna comprobación automática de que se
haya seguido**: subir un número y commitear pasa el gate. El presupuesto acaba
siendo un registro de lo que ha ocurrido, no un límite de lo que puede ocurrir.

**Impacto.** Deriva monótona al alza; ya se ha materializado dos veces según los
propios comentarios.

**Riesgo.** Medio, acumulativo.

**Solución mínima.** Convertir `warning` en fallo cuando lleva N días superado.

**Solución arquitectónica ideal.** Ratchet **descendente**: el techo no puede
subir sin (a) un fichero `token-budget-exception.md` con los 4 pasos rellenos,
verificado por lint, y (b) una `expires-on` obligatoria tras la cual el techo
vuelve al valor anterior automáticamente. Es el mismo patrón `capabilities-pending`
+ `capabilities-migration-due` que el propio repo ya usa para capabilities: hay
que aplicarlo aquí.

**Tests a añadir.** Spec del lint: subir un `hard` sin excepción documentada ⇒
falla; con excepción caducada ⇒ falla; con excepción válida ⇒ pasa.

**Criterios de aceptación.** Ningún techo puede subir en un PR sin excepción
firmada y con caducidad.

**Dependencias.** Va después de B01 (primero bajar, luego blindar).

---

### AUD-B04 — `measureBootstrapBytes` mide una forma distinta de la que se envía

- **Clasificación:** BUG CONFIRMADO · **Severidad:** MEDIA · **Área:** tokens / métricas
- **Propuesta:** `x00284`

**Comportamiento actual.** El workflow `surface-bootstrap.yml` ("measure-bootstrap")
mide con `measureBootstrapBytes`, que serializa `{name, toolId, summary}` por
descriptor. La carga real de `tools/list` es `{name, description, inputSchema, outputSchema, annotations}`.
Las dos magnitudes no son comparables: 8.934 B reales frente a lo que mide esta
función (sólo nombres y resúmenes).

**Evidencia.** `packages/core/src/lib/surface/bootstrap.ts:11-31`.

**Por qué es un problema.** Una métrica de "bytes de bootstrap" que no mide los
bytes del bootstrap. Puede quedarse plana mientras el coste real se dispara (por
ejemplo si crece un `outputSchema`, que esta función no ve en absoluto).

**Impacto.** El gate `measure-bootstrap` no protege lo que dice proteger.

**Solución mínima.** Medir el mismo objeto que se serializa a `tools/list`,
reutilizando `measureSchemaBytes` del runtime.

**Solución arquitectónica ideal.** Una única función de medición
(`measureToolWireBytes`) compartida por el gate e2e, el dashboard y el bootstrap,
con un test que compara su resultado contra el `tools/list` real de un servidor
arrancado por stdio. Hoy hay al menos tres rutas de medición distintas
(`measureBootstrapBytes`, `measureSchemaBytes`, `measureToolTextBytes`).

**Tests a añadir.** Test e2e: arrancar el servidor, capturar `tools/list`, y
comprobar que el valor medido por la función coincide ±1%.

**Criterios de aceptación.** Una sola función de medición; su resultado casa con
el payload real.

**Dependencias.** Ninguna. **Tokens:** ninguno directo (mejora la medición).

---

### AUD-B05 — Falta la métrica que justifica todo el diseño: precisión de activación y "tokens útiles"

> **CORRECCIÓN (redacción de `f00272`).** Tres de las cuatro métricas que pido
> aquí **ya están propuestas**: `f00198` (precisión/recall/churn de activación) y
> `f00199` (tool-confusion rate), ambas en `ready` bajo `q00006`. Presenté como
> hueco lo que era trabajo ya planificado y no cruzado por mí. `f00272` queda
> reducida a la única métrica que ninguna cubre: **tokens útiles**
> (bytes-invocados / bytes-servidos).


- **Clasificación:** MEJORA · **Severidad:** MEDIA · **Área:** tokens / observabilidad
- **Propuesta:** `f00272`

**Comportamiento actual.** Se mide exhaustivamente el **coste** de la superficie.
No se mide el **rendimiento**: cuántas de las tools expuestas se invocan de hecho,
cuántas activaciones vía `plugin_activate` acaban en una llamada real, cuántas
búsquedas de `tool_search` acaban en invocación, ni cuánta confusión hay entre
tools. Existe `tool-confusion.spec.ts` y `plugin-metrics`, pero no un informe
longitudinal accionable.

**Evidencia.** `packages/core/src/lib/observability/` tiene `plugin-metrics` y
`tool-confusion`; `plugins/usage-tracking` registra uso. Ningún artefacto cruza
"expuesto" con "usado".

**Por qué es un problema.** Sin esta métrica no se puede decidir qué podar. La
poda de `AUD-B01` se puede hacer por tamaño (que es correcto y suficiente para
empezar), pero la siguiente ronda necesita saber **qué no se usa nunca**.

**Solución arquitectónica ideal.** Tres métricas, todas derivables de datos que
ya se recogen:
- **`activation precision`** = invocaciones tras activación / activaciones.
- **`activation recall`** = invocaciones servidas por tools ya visibles /
  invocaciones totales (mide si el bootstrap acierta con lo que expone).
- **`useful tokens`** = bytes de las tools invocadas al menos una vez en la
  sesión / bytes totales de `tools/list`. Es el KPI que resume todo.
- **`activation churn`** = activaciones+desactivaciones por sesión (detecta
  oscilación por falta de histéresis, ver `AUD-C03`).

**Tests a añadir.** Specs de las cuatro fórmulas sobre logs sintéticos;
test e2e que ejecuta una sesión guionizada y comprueba los valores.

**Criterios de aceptación.** `usage_report` incluye las cuatro métricas; hay un
dashboard generado con drift check.

**Dependencias.** Independiente; habilita la segunda ola de B01.

---

### AUD-B06 — Los techos de `overview` miden una superficie y se comparan contra otra

- **Clasificación:** BUG CONFIRMADO · **Severidad:** MEDIA · **Área:** tokens / medición
- **Propuesta:** `x00296`
- **Descubierto por el propio trabajo de este plan**, no por la lectura inicial.

**Comportamiento actual.** Las filas *fixture-gated* del dashboard
(`overview full`, `overview compact`, …) se miden conectando un cliente MCP
sintético:
```ts
// tools/scripts/report/token-budget-report-lib.ts:294-296
const client = new Client(
    options.clientInfo ?? DYNAMIC_SURFACE_CLIENT_INFO,
    { capabilities: options.capabilities ?? {} },   // ← sin capabilities
);
```
Ese cliente **no declara `tools.listChanged`**. Antes de `x00285` daba igual:
`decideSurfaceModeFromCapabilities` devolvía `'managed'` para todo el mundo
(ése era el bug `AUD-C01`), así que la fila medía el bootstrap de 6 tools.
Tras arreglarlo, el mismo cliente resuelve correctamente a `'native'` y la fila
mide **la superficie completa**.

**Evidencia (bisección sobre esta misma rama).** Regenerando el dashboard en
cada commit:

| Commit | `overview full` |
| --- | ---: |
| `2cf17373` (snapshot auditado) | 1.466 B — `within hard` |
| `e94d5639` | 1.466 B |
| `58be8f3a` | 1.466 B |
| `398000a7` | 1.466 B |
| `ab4ec6ff` (entra `x00285`) | **11.484 B — `over hard`** |

El techo (`hard: 11_100`, `warning: 11_000`) no se ha tocado. Lo que cambió es
**qué objeto se mide**.

**Por qué es un problema.** El techo se calibró contra la superficie
*gestionada* y ahora se compara contra la *nativa*: son magnitudes distintas y
la comparación no significa nada. Un techo que compara peras con manzanas no
puede detectar una regresión real ni absolver una falsa, y hoy reporta
`over hard` por un motivo que no es un crecimiento del payload.

Es, además, un caso instructivo: **arreglar un bug hizo visible que una métrica
nunca había medido lo que su nombre decía**. Exactamente lo mismo que `AUD-B04`
encontró en `measureBootstrapBytes`, y por la misma causa — la medición no
declaraba explícitamente su superficie.

**Impacto.** Dos filas del artefacto de tokens no son interpretables hasta
arreglarlo.

**Reproducción.** La tabla de la bisección; `git checkout <sha> && bun
tools/scripts/report/token-budget-dashboard.script.ts`.

**Solución mínima.** Que el cliente del fixture declare explícitamente sus
capabilities en vez de heredar `{}`, de modo que la fila mida
deliberadamente una superficie conocida.

**Solución arquitectónica ideal.** Que toda fila del dashboard **declare su
superficie** igual que ya hacen las tablas de presets, que tienen columnas
`Measurement Surface` y `Runtime Surface` separadas precisamente por esto.
`overview` debe aparecer dos veces —gestionada y nativa— cada una con su propio
techo. Una métrica cuya superficie es implícita acabará midiendo otra cosa en
cuanto cambie un default; eso es lo que acaba de pasar.

**Prohibido:** subir el techo para que pase. `r00036` ya lo impide sin una
excepción documentada y con caducidad.

**Tests a añadir.**
- Spec: la fila declara su superficie y el techo aplicado corresponde a ésa.
- Spec de regresión: cambiar el default de `decideSurfaceModeFromCapabilities`
  no altera la fila gestionada.

**Criterios de aceptación.** Cada fila fixture-gated nombra su superficie; las
dos filas de `overview` (gestionada y nativa) tienen techos propios y
justificados; ninguna se compara contra el techo de la otra.

**Dependencias.** `x00285` (ya en la rama), `r00036` (ratchet, ya en la rama).

---

## 7. Track C — superficie adaptativa

### AUD-C01 — `decideSurfaceModeFromCapabilities` ignora los dos parámetros que le dan nombre

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** superficie adaptativa
- **Propuesta:** `x00285`

**Comportamiento actual.** La función recibe `clientInfo` y `capabilities` y no
los lee: si no hay override explícito devuelve siempre `'managed'`.

**Evidencia** (`packages/core/src/lib/surface/decide-mode.ts:30-45`, literal):
```ts
export const decideSurfaceModeFromCapabilities = (input: {
    clientInfo?: Implementation | undefined;
    capabilities?: ClientCapabilities | undefined;
    explicitMode?: IMcpToolSurfaceMode | undefined;
}): ISurfaceModeDecision => {
    if (input.explicitMode !== undefined) { ... }
    return { mode: 'managed', reason: 'using managed surface as the stable default; client capabilities do not change the stable tools/list contract' };
};
```
Y en la misma línea, `shouldRegisterSurfaceRouter(_explicitMode)` ignora su
argumento y devuelve `true` incondicionalmente.

**Por qué es un problema.** El nombre y la firma prometen adaptación por cliente;
el cuerpo es una constante. Un host que **no** soporte
`notifications/tools/list_changed` recibe exactamente la misma superficie
gestionada que uno que sí — y para el primero la superficie gestionada es
activamente peor (nunca verá aparecer las tools que se activen). Es el caso de uso
que justifica la función.

**Impacto.** Los hosts sin soporte de notificaciones quedan con 6 tools y sin
forma de descubrir el resto salvo que el modelo adivine el router.

**Riesgo.** Alto para la adopción cross-IDE, que es un objetivo declarado
(`docs/mcp-vertex/CROSS-IDE.md`, `host-compatibility-matrix.md`).

**Reproducción.** Conectar un cliente con `capabilities: {}` (sin
`tools.listChanged`) y observar que se sirve `managed`.

**Solución mínima.** Si el cliente no declara `capabilities.tools.listChanged`,
decidir `'native'` y registrar el motivo en `ISurfaceModeDecision.reason`.

**Solución arquitectónica ideal.** Perfiles por host declarativos
(`host-profiles.constant.ts`: `{ match: clientInfo.name, defaultMode, rationale }`)
con fallback por capacidades, y el `reason` propagado al `startup-report` y a
`overview`, de modo que el usuario **vea** por qué está en el modo en el que está.
El repo ya tiene `host-compatibility-matrix.md`: hay que convertirlo en código.

**Tests a añadir.**
- Spec: cliente sin `tools.listChanged` ⇒ `native`.
- Spec: cliente con `listChanged` ⇒ `managed`.
- Spec: `explicitMode` gana siempre sobre ambos.
- Spec: el `reason` nombra la señal usada.
- Test de firma: ningún parámetro de la función queda sin leer (lint `no-unused`
  sobre parámetros no prefijados con `_`).

**Criterios de aceptación.** Cambiar las capacidades del cliente cambia el modo
resuelto en un test; el `reason` lo explica.

**Dependencias.** Ninguna. **Tokens:** puede **subir** para hosts que pasen a
`native` — es correcto: mejor 284 KB usables que 8,9 KB inservibles.
**Compatibilidad:** cambia el modo por defecto para algunos hosts → documentar y
permitir override.

---

### AUD-C02 — El "working set" (`idleTtlMs`, `maxWarmPlugins`) es configuración inerte

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** superficie adaptativa / configuración
- **Propuesta:** `x00286`

**Comportamiento actual.** `evictIdlePlugins()` sólo borra entradas de
`warmAtByPlugin`, un `Map` de bookkeeping. **No** descarga el plugin, **no**
llama a su `dispose`, **no** libera memoria, **no** oculta sus tools, y su valor
de retorno se **descarta** en los dos únicos sitios que la llaman. El único efecto
observable es qué nombres aparecen en `project_context.warmPlugins`.

**Evidencia.**
- `packages/core/src/lib/project/tool-surface-runtime.service.ts:558-582`
  (`evictIdlePlugins` — sólo `this.warmAtByPlugin.delete(pluginId)`)
- `:370` → `this.evictIdlePlugins();` (retorno descartado, dentro de `getProjectContext`)
- `:586` → `this.evictIdlePlugins();` (retorno descartado, dentro de `touchPlugin`)
- Superficie de configuración expuesta al usuario:
  `packages/core/src/lib/plugins/config-file-schema.ts:147-148`,
  `load-config-file.ts:75-76`, `cli/assemble.ts:682-688`
- Reportado como si fuese real: `startup-report/renderer.ts:201`
  → `max warm plugins ${report.runtime.maxWarmPlugins ?? 'unbounded'}`

**Por qué es un problema.** Es la clase más dañina de bug: una opción
documentada, tipada, validada por esquema, mostrada en el informe de arranque —
y sin efecto. El adoptante que ajusta `maxWarmPlugins` para controlar memoria no
obtiene nada, y no tiene forma de saberlo.

**Impacto.** El objetivo declarado del modo `managed` (mantener acotado el
conjunto de plugins calientes) no se cumple: una vez cargado, un plugin sigue
cargado para siempre.

**Riesgo.** Alto: consumo de memoria no acotado en sesiones largas de agente, que
es exactamente el escenario objetivo del proyecto.

**Reproducción.** Configurar `managedSurface.maxWarmPlugins: 1`, activar 5
plugins, invocar tools de los 5, e inspeccionar el proceso: los 5 módulos siguen
en memoria; sólo cambia el array `warmPlugins` de `project_context`.

**Solución mínima.** Al evictar, llamar al `dispose()` del plugin y volver a
marcar sus tools como perezosas (`bindLazyTool`), de modo que la siguiente
invocación las reactive. La maquinaria de reactivación **ya existe**
(`lazyActivate`, `setLazyPluginLoader`), sólo falta el camino de vuelta.

**Solución arquitectónica ideal.** Ciclo de vida completo
`cold → warm → hot → evicted → cold` en el runtime de superficie, con:
- evicción que respeta `inFlightByPlugin` (ya lo hace) y espera a que drene;
- `dispose()` obligatorio e idempotente por contrato de plugin (ya lo es en los
  plugins buenos, ver `commit-policy`);
- un evento observable `plugin.evicted` en los logs;
- y un **test de propiedad**: para cualquier secuencia de invocaciones, el número
  de plugins cargados nunca supera `maxWarmPlugins`.

**Tests a añadir.**
- Spec: con `maxWarmPlugins: 2` y 3 plugins tocados, el tercero provoca `dispose`
  del más antiguo (espiar el `dispose`).
- Spec: un plugin evictado se recarga transparentemente en la siguiente
  invocación y devuelve el mismo resultado.
- Spec: un plugin con invocación en vuelo **no** se evicta.
- Property test (fast-check, ya está en devDependencies): invariante de cota.
- Spec: `idleTtlMs: null` desactiva la evicción por tiempo.

**Criterios de aceptación.** Los dos parámetros cambian comportamiento
observable en un test; `project_context` y los logs lo reflejan.

**Dependencias.** Ninguna. **Tokens:** reduce el coste de sesiones largas.
**Compatibilidad:** un plugin con `dispose` mal implementado podría romperse →
el gate `verify:plugin-wiring` debe exigir `dispose` idempotente.

---

### AUD-C03 — Sin histéresis, ranking ni confianza en la activación

- **Clasificación:** MEJORA · **Severidad:** MEDIA · **Área:** superficie adaptativa
- **Propuesta:** `f00273`

**Comportamiento actual.** `searchTools` filtra por subcadena en
`name/toolId/pluginId/namespace/summary/tags` y devuelve los primeros 20 en orden
de inserción. No hay puntuación, ni ranking por relevancia, ni umbral de
confianza, ni histéresis que evite activar/desactivar el mismo plugin en ciclos
consecutivos.

**Evidencia.** `tool-surface-runtime.service.ts` → `matchesFilter()` (subcadena
`includes`) y `searchTools()` (`.slice(0, limit)` sin ordenar).

**Por qué es un problema.** El descubrimiento es el corazón del modo `managed`:
si `tool_search` devuelve resultados irrelevantes en las primeras posiciones, el
modelo activa el plugin equivocado, paga el coste, y vuelve a buscar. El
`activation churn` de `AUD-B05` mediría exactamente esto.

**Solución mínima.** Puntuar: coincidencia exacta de `toolId` > prefijo de nombre
> tag > subcadena en summary; ordenar descendente; devolver el `score`.

**Solución arquitectónica ideal.** Índice invertido pequeño construido en el
arranque (los datos ya están en `MANAGED_LAZY_PLUGIN_CATALOG`), BM25 ligero sobre
`summary`+`tags`, umbral de confianza por debajo del cual `tool_search` responde
"no encontrado, prueba con X" en lugar de devolver ruido, e histéresis: un plugin
recién activado no puede evictarse durante `minWarmMs`.

**Tests a añadir.** Specs de ranking con consultas conocidas; property test de
histéresis (ninguna secuencia produce activar→desactivar→activar en < `minWarmMs`).

**Criterios de aceptación.** Consultas de referencia devuelven la tool correcta
en la posición 1; `activation churn` medible y acotado.

**Dependencias.** B05 para medir. **Tokens:** ninguno directo.

---

### AUD-C04 — `isToolExposed` es fail-open para nombres desconocidos

- **Clasificación:** RIESGO DE DISEÑO · **Severidad:** MEDIA · **Área:** superficie / seguridad
- **Propuesta:** `x00287`

**Comportamiento actual.** `isToolExposed(name)` devuelve `true` cuando no
encuentra el registro (`record === undefined ? true : ...`).

**Evidencia.** `tool-surface-runtime.service.ts:245-248`.

**Por qué es un problema.** Un fallo abierto en una función de visibilidad: un
nombre mal escrito, un registro que se perdió en una recarga, o una tool
registrada fuera del plan se consideran expuestos. La política correcta en una
decisión de exposición es fail-closed y ruidosa.

**Impacto.** Bajo hoy (los llamantes conocidos pasan nombres registrados), pero
es una trampa para el futuro.

**Solución mínima.** Devolver `false` y emitir un log `warn` con el nombre.

**Solución arquitectónica ideal.** Tipo de retorno tri-estado
(`'visible' | 'hidden' | 'unknown'`) para que el llamante decida explícitamente;
un `boolean` no puede representar "no lo sé".

**Tests a añadir.** Spec: nombre desconocido ⇒ no expuesto + un log de aviso.

**Criterios de aceptación.** Ningún camino trata "desconocido" como "permitido".

**Dependencias.** Ninguna. **Tokens:** ninguno.

---

## 8. Track D — seguridad y efectos

> Este track incorpora y **verifica de forma independiente** hallazgos que
> también reportaron otros dos revisores. Cada uno se ha reconfirmado línea a
> línea contra `2cf17373` antes de incluirse; ninguno se acepta por referencia.

### AUD-D01 — `lint:capabilities` es vacuo: reporta `✓ 51/51` mientras 35 plugins usan builtins con efecto fuera de la capa

- **Clasificación:** BUG CONFIRMADO · **Severidad:** CRÍTICA · **Área:** seguridad
- **Propuesta:** `x00288`

**Comportamiento actual.** El lint detecta uso de capabilities con **tres
expresiones regulares textuales** sobre `*.capabilities.<group>.<action>`. Un
plugin que importe `node:child_process` o `node:fs` directamente es invisible
para el lint, que entonces no encuentra ningún uso, no encuentra ninguna
discrepancia, y reporta éxito.

**Evidencia (ejecutada en vivo).**
```
$ bun tools/scripts/lint/capabilities-declared.script.ts
✓ capabilities-declared: 51 plugin(s), 1162 file(s) — every used capability is declared.

$ grep -rln "node:child_process" plugins/*/src | sed 's#plugins/\([^/]*\)/.*#\1#' | sort -u
auto-agent-selector browser changelog container external-mcps forge git
issues orchestrator-runner proposals quality search security          ← 13 plugins

$ grep -rln "ctx.effects" plugins/*/src | sed 's#plugins/\([^/]*\)/.*#\1#' | sort -u
audit commit-policy git memory proposals rules                        ← 6 plugins
```
Patrones de detección: `tools/scripts/lint/capabilities-declared.script.ts:89-96`.
Además el vocabulario no casa: el manifest declara **dominios**
(`plugins/git/plugin.manifest.ts:47` → `capabilities: ['git','changelog']`)
mientras el lint razona sobre **efectos** `group:action` (`fs:write`,
`network:fetch`). Son dos espacios de nombres distintos compartiendo palabra.

**Por qué es un problema.** La puerta se satisface trivialmente **no usando** la
capa de seguridad. Es el peor incentivo posible: el plugin que enruta sus efectos
correctamente tiene que declararlos y puede fallar el lint; el que los ejecuta
crudos pasa siempre. Y produce una afirmación de cobertura (`51/51`) que un
revisor lee como "todos los efectos están declarados".

**Impacto.** No existe hoy ningún inventario fiable de qué plugin puede escribir,
ejecutar o llamar a la red. Todo el modelo de confianza descansa sobre esa
afirmación falsa.

**Riesgo.** Crítico.

**Reproducción.** Los tres comandos de la evidencia.

**Solución mínima.** Invertir la puerta: en vez de "declara lo que enrutas",
**prohibir el import directo**. Un lint de fronteras que rechace
`node:child_process`, `node:fs`, `node:net`, `node:http(s)` y `fetch` global en
`plugins/*/src/**`, salvo en adaptadores explícitamente autorizados por una
allowlist con fecha de caducidad (el patrón `capabilities-pending` +
`capabilities-migration-due` que el repo ya tiene).

**Solución arquitectónica ideal.** `IMcpPluginContext.effects` como **único**
camino a efectos, con el broker construyendo capacidades reales o denegadas a
partir de `declaración de efectos de la tool × política × dry-run × confianza ×
workspace × ack del usuario`. El lint de fronteras es el mecanismo que hace esa
regla verificable; la migración de los 45 plugins restantes es incremental y
guiada por la allowlist con caducidad.

**Tests a añadir.**
- Spec del lint de fronteras: un fichero de plugin con `import { spawn } from 'node:child_process'` ⇒ violación con path+línea.
- Spec: el mismo import dentro de un adaptador autorizado ⇒ pasa.
- Spec: allowlist caducada ⇒ violación.
- **Test de meta-cobertura**: el número de plugins que importan APIs sensibles
  directamente sólo puede bajar (ratchet, valor inicial 104).

**Criterios de aceptación.** El ratchet arranca en 104 y está en CI; ningún plugin
nuevo puede añadirse a la lista; existe un informe generado de "efectos por
plugin" que no depende de regex sobre `ctx.capabilities`.

> **CORRECCIÓN (implementación de `x00288`).** El «13» de este hallazgo estaba mal
> medido y el error era mío, no una estimación conservadora. 13 es el número de
> plugins que importan **`node:child_process` y sólo ese módulo**, encontrados con
> un grep restringido a la forma `from '...'`. La superficie real que el hallazgo
> describe —los siete builtins con efecto (`child_process`, `fs`, `fs/promises`,
> `net`, `http`, `https`, `dgram`), en forma prefijada o desnuda— es de
> **104 importaciones en 100 ficheros de 35 plugins**, con `fs`/`fs/promises` como
> las dominantes. Además, un grep por `from` es ciego a la carga dinámica: tres
> ficheros de `plugins/proposals` (`index-reader-fs.ts`, `locate-fs.ts`,
> `proposal-id-allocator-fs.ts`) cargan `node:fs/promises` vía `require(...)` y no
> aparecen en ninguna búsqueda por `from`. Es, literalmente, el mismo punto ciego
> que este hallazgo le reprocha a `lint:capabilities`: medir la declaración en vez
> del comportamiento. El ratchet se calibra sobre el número medido, no sobre el
> publicado.

**Dependencias.** Es la base de `AUD-D02`. **Tokens:** ninguno.
**Compatibilidad:** ninguna en runtime; sí obliga a los plugins a migrar.

---

### AUD-D02 — `dryRun` es advisory, no una frontera: detecta después de ejecutar

> **CORRECCIÓN (implementación de `r00037`).** La premisa de este hallazgo ya
> era falsa cuando fijé el snapshot. Cité verbatim la cabecera de
> `effect-guard.helper.ts` —«`IMcpPluginContext` no entrega a los plugins ningún
> objeto de capacidades»— como evidencia. El commit `8f05b5d2` («inject a
> dry-run-gated effects capability into plugins») aterrizó a las **13:15 del
> 2026-08-27**; mi snapshot `2cf17373` es de las **20:31 del mismo día**. El
> mecanismo llevaba siete horas en el árbol que estaba auditando, y yo me creí un
> comentario en lugar de leer el código — el mismo error que en `AUD-F02`, donde
> me creí el motivo escrito en un `skip` en vez de correr el test. Es,
> literalmente, el defecto que este hallazgo denuncia: confiar en la declaración
> en vez de en el comportamiento.
>
> El hueco real era más estrecho: una capacidad (`git`) ya estaba prevenida en
> producción; lo que faltaba era una primitiva de composición reutilizable en vez
> de una factoría cableada a mano, y un rastro de auditoría para lo no migrado.
> Eso es lo que `r00037` construye. La cabecera mentirosa queda corregida en el
> propio fichero.
>
> Alcance honesto tras `r00037`: la prevención es **real para `git`**; para
> filesystem, spawn y red sigue siendo **detección**, porque
> `IPluginEffectsCapability` aún no tiene miembro `fs`. Está escrito así en
> `docs/mcp-vertex/security/dry-run-contract.md` en vez de venderse como una
> garantía uniforme.

- **Clasificación:** RIESGO DE DISEÑO · **Severidad:** CRÍTICA · **Área:** seguridad
- **Propuesta:** `r00037`

**Comportamiento actual.** El runtime abre un scope ambiental de dry-run **antes**
de llamar al handler (`runWithDryRunScope`) y valida la respuesta **después**
(`applyDryRunContract` → `enforceDryRunReturnContract`). El propio comentario del
código lo declara: *"this is DETECTION (the handler already ran), not
prevention"*. La prevención real (`guardEffectCapability`, `runWithDryRunGate`)
existe pero es **opt-in**: sólo protege a los plugins que obtuvieron su capacidad
de `ctx.effects` — 6 de 51 (ver `AUD-D01`).

**Evidencia.** `packages/core/src/lib/project/tool-surface-runtime.service.ts:485-506`
(scope antes del handler) y `:594-613` (contrato aplicado al valor de retorno, con
el comentario citado). `packages/core/src/lib/dry-run/effect-guard.helper.ts`
(primitiva de prevención, no obligatoria).

**Por qué es un problema.** `dryRun: true` significa hoy *"el plugin debería no
escribir"*, no *"el runtime hace imposible escribir"*. Son contratos radicalmente
distintos, y el usuario que pasa `dryRun` razonablemente asume el segundo. Un
plugin que ignore el flag ya ha hecho `git push`, `rm -rf` o el `fetch` cuando la
detección se dispara: el error que devuelve el runtime es un informe forense, no
una barrera.

**Impacto.** El dry-run no es utilizable como control de seguridad; sólo como
convención de buena fe entre plugins first-party.

**Riesgo.** Crítico si alguna vez se cargan plugins de terceros — que es el
objetivo declarado del proyecto (`plugin:create`, `create_project`, external MCPs).

**Reproducción.** Escribir un plugin de prueba cuyo handler ignore `args.dryRun`
y haga `writeFileSync`; invocarlo con `dryRun: true`; el fichero se escribe y
además el runtime devuelve el error de contrato.

**Solución mínima.** Que la detección sea, además, **ruidosa y persistente**:
registrar toda violación del contrato en el log de auditoría con el plugin
responsable, y exponer un `report_status` que las liste. Convierte la detección
en presión de migración medible.

**Solución arquitectónica ideal — el `EffectBroker`.**
```
tool effect declaration × policy × dryRun × trust × workspace × user ack
                              ↓
                        EffectBroker
                              ↓
      ctx.effects.{fs,git,process,network,database,browser}
                              ↓
              capacidad real  |  capacidad denegada
```
Combinado con el lint de fronteras de `AUD-D01`, el plugin **no puede** alcanzar
un efecto salvo por el broker, y el broker conoce el dry-run. Entonces —y sólo
entonces— `dryRun: true` significa "imposible escribir".

**Tests a añadir.**
- Spec: plugin sintético que ignora `dryRun` y usa `ctx.effects.fs.write` ⇒ el
  fichero **no** se escribe y el error es `EffectDeniedByDryRun`.
- Spec: el mismo plugin usando `node:fs` directo ⇒ **rechazado por el lint de
  fronteras en CI** (no en runtime).
- Property test: para cualquier combinación de política × dryRun × trust, el
  broker nunca concede un efecto mutador con `dryRun: true`.

**Criterios de aceptación.** Documentar explícitamente en `docs/mcp-vertex/security/`
qué garantiza `dryRun` hoy y qué garantizará tras el broker; el spec del plugin
sintético pasa.

**Dependencias.** D01 primero. **Tokens:** ninguno.
**Compatibilidad:** cambio mayor para plugins de terceros → ventana de migración.

---

### AUD-D03 — `external-mcps`: `eager` está implementado pero es inexpresable en la config

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** external MCPs / configuración
- **Propuesta:** `x00289`

**Comportamiento actual.** El registry soporta `entry.eager === true`
(`server-registry.ts:297,420-423`) e `index.ts` llama a `registry.bootEager()`.
Pero `ServerEntrySchema` es **`.strict()`** y no declara la clave `eager`: un
usuario que la escriba en `mcp-vertex.config.json` recibe un error de validación
y el plugin no carga.

**Evidencia (verificada independientemente).**
- `plugins/external-mcps/src/lib/options-schema.ts` → `ServerEntrySchema` con
  claves `enabled, version, command, args, namespacePrefix, detect, env` y
  `.strict()` al cierre. **No hay `eager`.**
- `plugins/external-mcps/src/lib/subprocess/server-registry.ts:297`
  → `readonly eager?: boolean;`
- `plugins/external-mcps/src/index.ts:80-81` → `registry.bootEager();`
- Comentario en `server-registry.ts:282`: *"`eager` is registry-level"* — el
  propio código reconoce el desacople.

**Por qué es un problema.** Funcionalidad implementada, documentada en comentarios
y ejecutada en cada arranque, que **ningún usuario puede activar** por el camino
soportado. `bootEager()` es hoy un no-op garantizado.

**Impacto.** Código muerto en producción; y peor, un lector del código concluye
que el arranque eager está disponible.

**Riesgo.** Medio funcionalmente, alto como señal de deriva contrato/implementación.

**Reproducción.** Añadir `"eager": true` a un servidor en la config ⇒
`invalid-key` por `.strict()`.

**Solución mínima.** Añadir `eager: z.boolean().default(false)` a
`ServerEntrySchema` con documentación de sus implicaciones de seguridad (arrancar
un subproceso de terceros en el init del servidor, sin llamada del usuario).

**Solución arquitectónica ideal.** Un test de contrato que compare, por
construcción, las claves del schema Zod con las del tipo del registry
(`IRegistryServerEntry`) y falle ante cualquier divergencia. La clase entera
"el runtime acepta un campo que el schema rechaza" desaparece.

**Tests a añadir.**
- Spec: `eager: true` valida y el servidor arranca en init (spawner falso).
- Spec: `eager` ausente ⇒ arranque perezoso (comportamiento actual).
- Spec de contrato schema↔registry (el test genérico anterior).

**Criterios de aceptación.** `eager: true` es configurable, probado y documentado
con su nota de seguridad.

**Dependencias.** Ninguna. **Tokens:** ninguno. **Compatibilidad:** aditiva.

---

### AUD-D04 — `llmDecidesActivation` es un control de autonomía inerte

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA (seguridad) · **Área:** external MCPs
- **Propuesta:** `x00290`

**Comportamiento actual.** La opción se declara con semántica explícita —
*"cuando es `true` (por defecto) el LLM puede activar servidores dentro del
conjunto declarado; cuando es `false` sólo puede sugerir y un humano activa"* —
se parsea en `register()`… y **no la consume nadie**. El proxy de llamada recibe
`registry`, `requireHumanAckWhenLlmDecides` y `hasRecordedAck`, pero no
`llmDecidesActivation`.

**Evidencia (verificada independientemente).**
```
$ grep -rn "llmDecidesActivation" plugins/external-mcps/src --include='*.ts' | grep -v spec
src/index.ts:57:                    llmDecidesActivation: true,          ← sólo el configExample
src/lib/detect/detect-rules.ts:8:  * governed by the autonomy knobs (…)  ← sólo un comentario
src/lib/options-schema.ts:17: …                                          ← sólo un comentario
src/lib/options-schema.ts:155:  llmDecidesActivation: z.boolean().default(true),  ← la declaración
```
Cero consumidores. El control efectivo de ejecución sólo comprueba el ack
registrado y que el servidor esté declarado.

**Por qué es un problema.** Es una **opción de seguridad** que el usuario pone a
`false` esperando que el LLM no pueda activar servidores MCP de terceros, y que
no hace absolutamente nada. Es la misma clase que `AUD-C02` y `AUD-A07`, pero con
consecuencias de seguridad: aquí lo inerte es la barrera entre el modelo y el
arranque de subprocesos externos.

**Impacto.** El proyecto no puede convertirse en router autónomo de MCPs externos
—su mejor idea de producto— hasta que este control sea real.

**Riesgo.** Alto.

**Reproducción.** Configurar `llmDecidesActivation: false`, registrar un ack, y
observar que la activación por el LLM sigue funcionando exactamente igual.

**Solución mínima.** Pasar `llmDecidesActivation` al proxy y rechazar la
activación iniciada por el modelo cuando sea `false`, con un error tipado que
indique la vía humana.

**Solución arquitectónica ideal.** Modelar la autonomía como una matriz explícita
`(quién activa) × (qué exige)` en un módulo `activation-policy.ts` puro y testeado:
`{ actor: 'llm' | 'human', requiresAck, allowed }`. Hoy la política está repartida
entre un booleano no leído, un ack persistente y una comprobación de declaración.

**Tests a añadir.**
- Spec: `llmDecidesActivation: false` + activación por LLM ⇒ **denegada**.
- Spec: `false` + activación humana ⇒ permitida.
- Spec: `true` + `requireHumanAckWhenLlmDecides: true` sin ack ⇒ denegada.
- Spec: matriz completa 2×2×2 de la política.
- **Guard genérico**: test que enumera las claves de `OptionsSchema` y falla si
  alguna no tiene al menos un consumidor fuera del schema y los ejemplos.

**Criterios de aceptación.** Los cuatro cuadrantes de la matriz probados; el guard
genérico en CI.

> **CORRECCIÓN DE ALCANCE (implementación de `x00290`).** La arquitectura ideal
> que propongo arriba pivota sobre una matriz `actor: 'llm' | 'human'`, y esa
> distinción **no es observable en este código**: no hay ninguna herramienta que
> sepa quién la invocó — toda llamada MCP llega del modelo. Pedir un `actor` es
> pedir un dato que el runtime no tiene. La distinción real y observable es otra,
> y es la que el propio doc-comment del schema ya describía: *activar un servidor
> frío* frente a *llamar a uno ya activo*. El camino "humano" no es un actor
> paralelo en runtime, es configuración (`eager: true` + reinicio). La
> implementación usa esa distinción; la matriz por actor queda descartada, no
> pendiente.

**Dependencias.** Ninguna. **Tokens:** ninguno. **Compatibilidad:** endurece un
default → documentar.

---

### AUD-D05 — `external-mcps` no devuelve `dispose`: los subprocesos hijos sobreviven

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** external MCPs / ciclo de vida
- **Propuesta:** `x00291`

**Comportamiento actual.** `ExternalServerRegistry.closeAll()` existe
(`server-registry.ts:524`) y cierra cada subproceso. El `register()` del plugin
devuelve `{ activation, tools, … }` y **no incluye `dispose`**: `grep -n "dispose"
plugins/external-mcps/src/index.ts` no devuelve **ninguna** línea.

**Evidencia.** Los dos hechos anteriores, verificados sobre `2cf17373`.

**Por qué es un problema.** Los subprocesos que este plugin arranca son
**servidores MCP de terceros**: procesos ajenos, con sus propios sockets y
ficheros abiertos. Que sobrevivan al servidor es la fuga de recursos de mayor
impacto del repo, y es específica de este plugin: aunque el core arreglase su
teardown global (`AUD-E02`), sin este `dispose` no habría a quién llamar.

**Impacto.** Procesos huérfanos acumulándose en sesiones largas y en reinicios de
servidor desde la extensión VS Code (`server restart` es un comando existente).

**Riesgo.** Alto.

**Reproducción.** Arrancar con un servidor externo declarado, invocarlo (arranca
el hijo), cerrar el servidor MCP, y comprobar con `ps` que el hijo sigue vivo.

**Solución mínima — con una trampa que hay que nombrar.** El snippet obvio
**no funciona**:
```ts
return { tools, activation, dispose: async () => registry.closeAll() };  // ✗ pierde el dispose
```
El loader identifica un `IPluginRuntime` por la presencia de la clave
`registrations` (`packages/core/src/lib/plugins/load-plugins-runtime.helper.ts:22`
→ `isObject(value) && 'registrations' in value`). Un objeto plano con `dispose`
al lado de `tools`/`activation` se trata como registros normales y **el `dispose`
se descarta en silencio** — reproduciendo `AUD-E01.c` dentro de la propia
corrección. La forma correcta envuelve la superficie:
```ts
return { registrations: { tools, activation }, dispose: async () => registry.closeAll() };
```
*(Corrección aportada por el subagente que implementó este arreglo: detectó la
trampa probando antes y después, en vez de fiarse del snippet de esta auditoría.
La versión anterior de este párrafo era incorrecta.)*

**Solución arquitectónica ideal.** Que el contrato de plugin **exija** `dispose`
cuando el manifest declare la capability `process`, verificado por
`verify:plugin-wiring`. Un plugin que arranca procesos y no declara cómo pararlos
no debería poder registrarse.

**Tests a añadir.**
- Spec con spawner falso: `dispose()` envía exactamente un `SIGTERM` por hijo y
  un `SIGKILL` **sólo** tras el grace period.
- Spec: `dispose()` es idempotente (segunda llamada, cero señales).
- Spec: `dispose()` con una llamada en vuelo espera a que drene.
- Gate: `verify:plugin-wiring` falla si un plugin con capability `process` no
  devuelve `dispose`.

**Criterios de aceptación.** Ningún proceso hijo sobrevive a un `dispose()`;
el gate está en CI.

**Dependencias.** Se potencia con `AUD-E02`. **Tokens:** ninguno.

---

### AUD-D06 — `protectedBranches` sin default en core: el guard de force-push es fail-open

- **Clasificación:** RIESGO DE DISEÑO · **Severidad:** MEDIA · **Área:** seguridad / git
- **Propuesta:** `x00292`

**Comportamiento actual.** `gitPush` sólo rechaza forzar contra las ramas que el
llamante le pase en `options.protectedBranches`. El core no aporta ningún valor
por defecto — decisión documentada como "el core es agnóstico del proyecto".

**Evidencia.** `packages/core/src/lib/shared/git-write.ts:139-152`, comentario:
*"Core stays project-agnostic: there is no built-in default here, callers supply
their own resolved list"*.

**Por qué es un problema.** El resto del guard es excelente (autorización con
`by` + `reason`, resolución del refspec real, registro auditado acotado a 200).
Pero un llamante que olvide el parámetro obtiene **cero** protección, en silencio.
En una primitiva de seguridad, el default debe ser el caso seguro.

**Impacto.** Un plugin nuevo que use `gitPush` sin pasar la lista puede forzar
sobre `main`.

**Solución mínima.** Default `['main', 'master']` cuando el parámetro se omite, y
`protectedBranches: []` explícito para renunciar conscientemente.

**Solución arquitectónica ideal.** Hacer el parámetro **obligatorio** en el tipo
(sin `?`), de modo que el compilador obligue a cada llamante a decidir. Es la
única forma de que "olvidarlo" deje de ser posible.

**Tests a añadir.** Spec: `gitPush` sin `protectedBranches` y con `force` ⇒
rechazado. Spec: `protectedBranches: []` explícito + autorización ⇒ permitido.

**Criterios de aceptación.** Ningún llamante puede forzar sin haber declarado su
lista.

**Dependencias.** Ninguna. **Compatibilidad:** cambio de firma → breaking menor
en la API pública del core.

---

## 9. Track E — arquitectura y fronteras

### AUD-E01 — La activación *eager* y la *lazy* no son equivalentes: opciones, timeout y `dispose` divergen

- **Clasificación:** BUG CONFIRMADO · **Severidad:** CRÍTICA · **Área:** core / ciclo de vida
- **Propuesta:** `r00038` (primitiva común) + `t00029` (tests de equivalencia)

Éste es el hallazgo arquitectónico más importante del informe. Son **tres
divergencias en el mismo punto**, todas verificadas línea a línea sobre
`2cf17373`.

**E01.a — Las opciones parseadas se descartan en la ruta lazy.**

*Eager* (`packages/core/src/lib/plugins/load-plugins.ts:299-315`):
```ts
const parsed = plugin.optionsSchema.safeParse(ctx.options);
if (!parsed.success) { errors.push(...); continue; }
const parsedOptions = 'data' in parsed ? parsed.data : ctx.options;
ctx = { ...ctx, options: parsedOptions };      // ← usa parsed.data
```
*Lazy* (`packages/core/src/lib/plugins/managed-lazy-runtime.ts:180-187`):
```ts
if (plugin.optionsSchema && !plugin.optionsSchema.safeParse(context.options).success) {
    throw new Error(`plugin "${pluginId}" rejected its configured options`);
}
const registered = await plugin.register(context);   // ← context.options SIN parsear
```
La ruta lazy sólo comprueba `.success` y **tira `parsed.data`**. Todo lo que Zod
aporta en el parseo —`.default()`, `.coerce`, `.transform()`, `.preprocess()`—
se aplica en eager y **no** en lazy. El mismo plugin, con la misma config, recibe
opciones distintas según cómo se haya cargado.

**E01.b — La ruta lazy no tiene timeout ni cancelación.**

*Eager* pasa por `registerResolvedPluginsWithLifecycle({ resolvedPlugins,
timeoutMs, signal })` (`load-plugins.ts:320-324`), que aplica `registerTimeoutMs`
y un `AbortController` (`load-plugins-runtime.helper.ts:141`).
*Lazy* hace `await plugin.register(context)` desnudo. Un plugin cuyo `register()`
no resuelva deja **colgada indefinidamente la invocación del usuario que provocó
la activación** — y el modo `managed`, que es el default silencioso, ejecuta el
registro precisamente durante llamadas de usuario.

**E01.c — La ruta lazy pierde el `dispose` del runtime.**

*Lazy* (`managed-lazy-runtime.ts:188-213`) toma
`registrationPayload(registered)`, captura las tools, y devuelve `{ tools }`.
El `dispose()` que el plugin devolvió **nunca se retiene**. Timers, listeners,
subprocesos, sockets, watchers y conexiones de un plugin activado
perezosamente sobreviven mientras viva el proceso, sin referencia que permita
liberarlos.

**Por qué es un problema.** El proyecto invierte fuertemente en que el modo
`managed` (lazy) sea el camino por defecto — es la decisión que produce los
8.934 B de bootstrap y toda su ventaja competitiva. Y ese camino es el que tiene
las tres garantías de ciclo de vida degradadas. Cuanto mejor funciona la
superficie adaptativa, más plugins pasan por la ruta débil.

**Impacto.** Comportamiento no determinista según ruta de carga (E01.a); cuelgues
de invocación sin diagnóstico (E01.b); fuga no acotada de recursos en sesiones
largas de agente (E01.c) — el escenario objetivo del producto.

**Riesgo.** Crítico y creciente con la adopción del modo managed.

**Reproducción.**
- E01.a: plugin sintético con `z.object({ timeout: z.coerce.number().default(500) })`;
  cargarlo eager ⇒ `options.timeout === 500`; activarlo lazy ⇒ `undefined`.
- E01.b: plugin cuyo `register()` devuelve una promesa que nunca resuelve;
  invocar una tool suya ⇒ la llamada nunca vuelve.
- E01.c: plugin que abre un `setInterval` sin `unref` y devuelve `dispose`;
  activarlo lazy y comprobar que el intervalo sigue vivo tras cerrar el proyecto.

**Solución mínima.** Tres arreglos puntuales en `managed-lazy-runtime.ts`:
usar `parsed.data`; envolver `register()` con el mismo timeout+signal; retener y
propagar el `dispose`.

**Solución arquitectónica ideal — `PluginActivationSession`.** No parchear cada
divergencia: extraer **una** primitiva por la que pasen obligatoriamente ambas
rutas.
```
PluginActivationSession
 ├── normalizeOptions()      // safeParse → parsed.data, siempre
 ├── createAbortController()
 ├── applyRegisterTimeout()  // registerTimeoutMs, siempre
 ├── register()
 ├── retainRuntime()         // conserva dispose, siempre
 ├── dispose()               // idempotente
 └── rollback()              // registro parcial ⇒ deshacer
```
La razón por la que estas tres divergencias existen es que hay **dos
implementaciones del mismo concepto**. Mientras las haya, volverán a divergir.

**Tests a añadir.**
- **Test de equivalencia parametrizado**: la misma batería de aserciones se
  ejecuta dos veces, una por ruta (`describe.each(['eager','lazy'])`), sobre un
  plugin sintético con `default`/`coerce`/`transform`. Éste es el test que
  impide la regresión estructural.
- Spec: `register()` que no resuelve ⇒ error estructurado tras `registerTimeoutMs`,
  señal abortada, y una resolución tardía **no** reactiva el plugin.
- Spec: `dispose` se llama exactamente una vez por activación lazy.
- Spec: fallo a mitad de registro ⇒ `rollback` deja el runtime sin restos.
- Property test: para cualquier secuencia activar/invocar/evictar, `dispose` se
  invoca exactamente una vez por activación.

**Criterios de aceptación.** El test de equivalencia pasa para las dos rutas sin
ramas condicionales por ruta; `managed-lazy-runtime.ts` no contiene ya su propia
lógica de opciones/timeout/dispose.

**Dependencias.** Habilita `AUD-C02` (evicción real) y `AUD-E02` (teardown).

**Tokens:** ninguno. **Compatibilidad:** interna; ningún plugin bien escrito se ve
afectado.

---

### AUD-E02 — Nadie es dueño del teardown: `createMcpProject` no devuelve forma de cerrar

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** core / host / ciclo de vida
- **Propuesta:** `r00039`

**Comportamiento actual.** La ruta eager sí conserva los runtimes con su
`dispose()`, pero `createMcpProject()` expone esencialmente `{ server,
registrationOrder, start }`, y la ruta normal de `runCli()` arranca el proyecto
sin un `try/finally` que cierre esos runtimes. Existe infraestructura de graceful
shutdown, pero el host normal no la usa como propietario efectivo del ciclo de
vida.

**Evidencia.** Superficie de retorno de `packages/core/src/lib/project/create-mcp-project.ts`;
ausencia de un `dispose`/`stop` propagado a `runCli`. Combinado con `AUD-E01.c`
(lazy ni siquiera retiene el `dispose`) y `AUD-D05` (external-mcps ni lo
devuelve), el resultado es una arquitectura donde **el plugin sabe destruirse y
nadie tiene la responsabilidad de pedírselo**.

**Por qué es un problema.** Los tres niveles de la cadena están rotos a la vez:
el plugin no expone (`D05`), el activador no retiene (`E01.c`), el host no llama
(`E02`). Arreglar sólo uno no produce ninguna mejora observable — por eso deben
ir en el mismo tramo del roadmap.

**Impacto.** Reinicios de servidor (comando existente en la extensión VS Code) que
dejan procesos, watchers y timers del ciclo anterior; consumo creciente en
sesiones largas.

**Riesgo.** Alto.

**Reproducción.** Arrancar, activar plugins con timers/subprocesos, cerrar el
servidor, e inspeccionar el proceso/`ps`.

**Solución mínima.** `createMcpProject()` devuelve `dispose()`; `runCli()` lo
envuelve en `try/finally`.

**Solución arquitectónica ideal — `McpHostSession`.**
```ts
McpHostSession { server, transports, PluginActivationManager, plugins,
                 start(), stop(), dispose() /* idempotente */ }

try { await session.start(); } finally { await session.dispose(); }
```
con teardown en **orden inverso de dependencias** (el grafo ya existe:
`registrationOrder`).

**Tests a añadir.**
- Spec: `dispose()` llama al `dispose` de cada plugin exactamente una vez, en
  orden inverso a `registrationOrder`.
- Spec: `dispose()` es idempotente.
- Spec: un `dispose` de plugin que lanza no impide el de los demás, y el error se
  agrega.
- Spec: `SIGTERM`/`SIGINT` desembocan en `session.dispose()`.
- Test de fugas: tras `dispose()`, cero handles activos (`process._getActiveHandles`
  o equivalente) atribuibles a plugins.

**Criterios de aceptación.** Test de fugas verde; el ciclo `start → dispose →
start` no acumula handles.

**Dependencias.** E01 (primitiva de activación) y D05 (el plugin debe exponerlo).

**Tokens:** ninguno. **Compatibilidad:** aditiva.

---

### AUD-E03 — Barrel público del core: 287 exports en un único fichero de 1.347 líneas

> **CORRECCIÓN (redacción de `r00040`).** Escribí la solución ideal como si no
> existiera ningún subpath. Existen cuatro y funcionan: `./contracts`,
> `./runtime`, `./plugin` y `./node`, con ficheros reales y un ADR (`d00012`).
> Lo que pasa es que sólo cubren 59 de los 288 exports, y los 287 re-exports del
> barrel siguen saliendo todos de `../lib`, ninguno de los directorios de
> subpath. No es «construir subpaths»: es **terminar una migración ya empezada**,
> que es un problema distinto y bastante más barato.


- **Clasificación:** DEUDA TÉCNICA · **Severidad:** ALTA · **Área:** arquitectura / API pública
- **Propuesta:** `r00040`

**Comportamiento actual.** `packages/core/src/public/index.ts` exporta 287
símbolos desde un único fichero.

**Evidencia.** `grep -c "^export" packages/core/src/public/index.ts` → **287**;
`wc -l` → **1347**.

**Por qué es un problema.** Cada símbolo exportado es un compromiso de
compatibilidad. Con 287 en un barrel plano no hay forma de razonar sobre
"¿qué rompe un cambio?", el `compat-window` lint tiene que cubrir todo por igual,
y el tree-shaking de los consumidores se degrada.

**Impacto.** Versionado semántico difícil de sostener; el coste de mantener la
API pública crece con cada plugin.

**Solución mínima.** Anotar cada export con su nivel de estabilidad
(`@stable` / `@experimental` / `@internal`) y que `verify:stable-manifest` sólo
gobierne los `@stable`.

**Solución arquitectónica ideal.** Subpaths por dominio —el repo ya tiene el
precedente `@mcp-vertex/core/contracts` y el ADR correspondiente—:
`core/contracts`, `core/plugin`, `core/node`, `core/scaffold`, `core/testing`.
El barrel raíz queda como re-export deprecado con ventana de compatibilidad.

**Tests a añadir.** Snapshot de la superficie pública por subpath, con drift
check (ya existe la maquinaria en `verify:stable-manifest`).

**Criterios de aceptación.** Ningún subpath supera ~60 exports; el barrel raíz
está marcado como deprecado con fecha.

**Dependencias.** Ninguna. **Compatibilidad:** aditiva si el barrel se conserva.

---

### AUD-E04 — `@mcp-vertex/client` depende de `@mcp-vertex/core` en runtime

- **Clasificación:** RIESGO DE DISEÑO · **Severidad:** ALTA · **Área:** arquitectura / portabilidad
- **Propuesta:** `r00041`

**Comportamiento actual.** `packages/client/package.json` declara
`"@mcp-vertex/core": "workspace:*"` en **`dependencies`** (no `peerDependencies`,
no `devDependencies`), y el código importa valores en tiempo de ejecución, no
sólo tipos: `import { createFileSystemBatchWriter } from '@mcp-vertex/core/public'`
(`packages/client/src/lib/scaffold/write-scaffolded-files.ts:25`).

**Evidencia.** El `package.json` y el import citados.

**Por qué es un problema.** Un cliente MCP debería poder hablar con **cualquier**
servidor MCP sin instalar ese servidor. Aquí, instalar el cliente arrastra las
87.900 líneas del core, con sus dependencias de Node (`node:fs`, `node:child_process`),
lo que además cierra la puerta a un futuro cliente para navegador — un objetivo
plausible dado que el proyecto ya tiene `apps/web` y `packages/ui-extension`.

**Impacto.** Peso de instalación, acoplamiento de versiones (el cliente no puede
evolucionar sin el core), e imposibilidad de portar a runtimes sin Node.

**Solución mínima.** Mover los imports de tipos a `import type` (borrado en
compilación) y duplicar/mover `createFileSystemBatchWriter` al propio cliente o a
un `@mcp-vertex/client/node` separado. Degradar la dependencia a
`peerDependencies` opcional.

**Solución arquitectónica ideal.** Partir el cliente en subpaths por entorno,
como propone también el revisor externo:
`client/contracts` (puro), `client/transport` (stdio/http), `client/node`
(scaffolding, fs), `client/scaffold`. Sólo `client/node` puede tocar el core.
Añadir un lint de fronteras que prohíba imports de `node:*` fuera de
`client/node` — el repo ya tiene el patrón (`lint:architecture-readfile-via-safe-reader`).

**Tests a añadir.**
- Test de frontera: ningún fichero fuera de `client/node` importa `node:*` ni
  `@mcp-vertex/core` como valor.
- Smoke: `client/contracts` + `client/transport` compilan con `"lib": ["ES2022","DOM"]`
  sin `@types/node`.

**Criterios de aceptación.** El bundle de `client/transport` no contiene código
del core; el test de frontera está en CI.

**Dependencias.** Se beneficia de E03. **Compatibilidad:** aditiva si se mantienen
los exports actuales como re-export.

---

### AUD-E05 — Concentración de complejidad: `proposals` es el 17% de todo el código de plugins

- **Clasificación:** DEUDA TÉCNICA · **Severidad:** MEDIA · **Área:** arquitectura
- **Propuesta:** `r00042`

**Comportamiento actual.** Módulos donde se concentra la complejidad que **más
cambia** (ciclo de vida, política, registro, orquestación):

| Módulo | Líneas | Tools |
| --- | ---: | ---: |
| `plugins/proposals` (todo el plugin) | 37.167 | 26 |
| `plugins/proposals/src/lib/tools/authoring.tool.ts` | 1.654 | — |
| `plugins/proposals/src/lib/locks/agent-lock-engine.ts` | 1.262 | — |
| `plugins/proposals/src/lib/tools/auto-work.tool.ts` | 1.230 | — |
| `plugins/proposals/src/lib/tools/proposal-transition.tool.ts` | 1.014 | — |
| `packages/core/src/public/index.ts` | 1.347 | — |
| `packages/core/src/lib/scaffold/scaffold-host.ts` | 1.165 | — |
| `packages/core/src/lib/cli/assemble.ts` | 1.038 | — |
| `packages/core/src/lib/scaffold/extract-plugin.ts` | 1.024 | — |

`proposals` son 168 ficheros y 37.167 líneas: el **16,7%** de las 222.815 líneas
de todos los plugins juntos, y aporta 45.277 B a `tools/list` en el preset
`vertex` (el mayor contribuyente individual).

**Por qué es un problema.** El tamaño por sí solo no es un bug — `proposals` tiene
135 specs y una profundidad de pruebas de concurrencia notable. Es deuda porque
**es exactamente donde el ciclo de vida y la política cambian más**, y por tanto
donde una divergencia semántica como `AUD-E01` puede esconderse más tiempo.

**Solución mínima.** Extraer `locks/` y `agents/` (motor de colas y detector de
bucles) a paquetes internos con su propia superficie y sus propios tests.

**Solución arquitectónica ideal — event-sourcing explícito.**
```
Proposal Event Log → State Machine canónica → Transitions → Effects/workers → Projections
```
con `transitionId`, `agentId`, `correlationId`, `idempotencyKey`, `expectedVersion`
y `costBudget` en **toda** transición mutadora. Y reducir la superficie MCP con
*workflow front doors* (una tool que orquesta) en lugar de eliminar capacidades.
Es la vía que baja los 26 tools y los 45 KB sin perder funcionalidad.

**Tests a añadir.** Property tests de la máquina de estados (toda secuencia de
transiciones válidas termina en un estado válido); tests de idempotencia por
`idempotencyKey`.

**Criterios de aceptación.** Ningún fichero de `proposals` supera 600 líneas;
la superficie MCP del plugin baja de 26 tools sin pérdida funcional.

**Dependencias.** Posterior a los P0. **Tokens:** reducción esperada ~20 KB.

---

## 10. Track F — producto, DX y superficies cliente

### AUD-F01 — Umbrales de cobertura con 2 puntos de holgura: un trinquete que no trinca

- **Clasificación:** DEUDA TÉCNICA · **Severidad:** MEDIA · **Área:** testing
- **Propuesta:** `t00030`

**Comportamiento actual.**

| Métrica | Umbral | Real | Holgura |
| --- | ---: | ---: | ---: |
| Statements | 80 | 82,27 | +2,27 |
| Branches | **67** | **69,04** | +2,04 |
| Functions | 79 | 82,94 | +3,94 |
| Lines | 81 | 83,94 | +2,94 |

El propio `vitest.config.ts` lo confiesa: *"thresholds are a no-regression gate
set a few points under the current numbers — tighten them as coverage grows"*.
Nunca se apretaron.

**Por qué es un problema.** La cobertura puede caer dos puntos enteros sin que
nada se queje: no es un trinquete, es un suelo blando. Y el número que importa es
**branches al 69%**: casi un tercio de las ramas condicionales no se ejercita — y
las ramas son los `catch`, los fallbacks y los casos límite. **Todos** los bugs
de esta auditoría viven ahí: el dry-run que detecta en vez de prevenir, el
`parsed.data` descartado, el `dispose` perdido, el 403 no tratado, el `?? 0`, el
`allow_deletion` mal escrito. Ninguno estaba en el camino feliz.

**Solución mínima.** Apretar los cuatro umbrales a los valores reales
(80→82, 67→69, 79→82, 81→83).

**Solución arquitectónica ideal.** Trinquete automático: un script que, tras una
suite verde, actualice los umbrales al valor medido menos 0,5 puntos y falle si
el fichero quedó desactualizado. Igual que `file-conventions.baseline.json`.
Además, **umbral de branches por paquete** para los módulos de ciclo de vida y
efectos (core/plugins, core/dry-run, core/project), donde el 69% global esconde
las zonas peores.

**Tests a añadir.** El propio trinquete; y una batería de caminos de error para
los módulos tocados por los P0 (E01, E02, D02, D05).

**Criterios de aceptación.** Umbrales = medida − 0,5; branches ≥ 80% en
`core/plugins`, `core/dry-run` y `core/project`.

**Dependencias.** Va a la vez que los P0 (los tests de error los suben solos).

---

### AUD-F02 — El e2e de dogfooding de `commit-policy` lleva desactivado desde `x00258`

- **Clasificación:** DEUDA TÉCNICA · **Severidad:** MEDIA · **Área:** testing
- **Propuesta:** `t00031`

**Comportamiento actual.**
`plugins/commit-policy/tests/src/e2e/dogfood.spec.ts:77`:
```ts
it.skip('commits a slice with the global user + audit trailer + pushes it (x00258: skipped, pre-x00258 behavior tested pre-change)', …)
```
Se desactivó cuando `x00258` cambió el comportamiento (bloquear push directo) y
**nunca se reescribió** para el comportamiento nuevo.

**Evidencia.** La línea citada. De los 10 `skip` del repo, **éste es el único que
es deuda**: los otros nueve son condicionales de entorno legítimos y correctos —
`fs-tools-windows.spec.ts` corre sólo en Windows y su gemelo
`process-tree-kill.spec.ts` hace lo inverso; `shim-invocation.spec.ts` se salta
sin Go instalado y se compila al vuelo cuando lo hay; los `hasGit`/`BUN_AVAILABLE`
sí se ejecutan aquí y en CI.

**Por qué es un problema.** El camino de dogfooding completo de `commit-policy`
—commit + trailer de auditoría + push— está sin cobertura desde entonces, en el
plugin que **escribe en el repositorio**. El motivo quedó escrito en el nombre del
test para que se viera. Se vio, y no se arregló.

> **CORRECCIÓN (redacción de `t00031`).** El *diagnóstico* de este hallazgo es
> mío y es falso. Yo leí el motivo escrito en el nombre del skip —«x00258»— y me
> lo creí, en vez de quitar el skip y correr el test. Al correrlo: **el push
> funciona** (`{ok:true, pushed:true, branch:'topic/e2e-test'}`) y el commit
> aterriza correctamente en el remoto. El test falla por otra cosa: la aserción de
> la línea 145 hace `git log --oneline` sobre el remoto **bare sin argumento de
> rama**, así que resuelve contra `HEAD` —la rama por defecto, `develop`— y no
> contra `topic/e2e-test`, que es donde está el commit. Es un bug de aserción
> **anterior e independiente** de `x00258`.
>
> Que el hallazgo sea «deuda técnica» sigue en pie, y la solución prescrita abajo
> sigue siendo la correcta; lo que estaba mal era la causa. La lección es la del
> propio hallazgo aplicada a mí: *el motivo quedó escrito para que se viera; se
> vio, y se creyó sin comprobarlo.*

**Solución mínima.** Reescribir el test para el comportamiento post-`x00258`:
push a una rama permitida, y un caso adicional que verifique el rechazo del push
directo a rama protegida.

**Solución arquitectónica ideal.** Prohibir `it.skip` sin un `@skip-reason` con
issue/propuesta y fecha de caducidad, verificado por lint (existe ya
`lint:user-markers`, se extiende).

**Tests a añadir.** El propio test reescrito, más el caso de rechazo.

**Criterios de aceptación.** Cero `it.skip` incondicionales sin caducidad
declarada; el e2e de dogfood corre en CI.

**Dependencias.** Ninguna.

---

### AUD-F03 — La extensión VS Code no arranca en el caso de uso que más importa

- **Clasificación:** MEJORA · **Severidad:** MEDIA · **Área:** VS Code / producto
- **Propuesta:** `f00274`

**Comportamiento actual.** 34 comandos, 1 vista, **3 settings**, y un único
`activationEvents`: `workspaceContains:**/mcp-vertex.config.json`.

**Evidencia.** `extensions/vscode/package.json#contributes`.

**Por qué es un problema.** La extensión sólo se activa en repos que **ya**
adoptaron mcp-vertex. En un repo nuevo —el momento en que un usuario decidiría
adoptarlo— la extensión está inerte: no hay comando de "adoptar este proyecto"
disponible porque la extensión no se ha cargado. Es un embudo de adopción cerrado
sobre sí mismo. Además, 34 comandos frente a 3 opciones sugiere que casi nada de
ese comportamiento es configurable.

**Solución mínima.** Añadir `onCommand:mcp-vertex.adopt` (y los comandos de
arranque) a `activationEvents`, de modo que la paleta pueda invocarlos siempre.

**Solución arquitectónica ideal.** La siguiente capa de valor **no son más
comandos, es explicabilidad**: una vista que responda *¿por qué esta tool es
visible? ¿por qué se activó este plugin? confianza, coste estimado vs. real en
tokens, último uso, efectos declarados, frontera de confianza, decisión de
enrutado del MCP externo*. Eso convierte la extensión en un diferenciador de
producto real y consume exactamente las métricas de `AUD-B05`.

**Tests a añadir.** Test de activación: en un workspace sin config, el comando de
adopción está disponible.

**Criterios de aceptación.** La extensión se activa por comando; el flujo de
adopción es alcanzable desde un repo virgen.

**Dependencias.** La vista de explicabilidad depende de B05.

---

### AUD-F04 — `mcpv doctor` existe y es bueno; le faltan los fallos que esta auditoría encontró

- **Clasificación:** MEJORA · **Severidad:** MEDIA · **Área:** CLI / DX
- **Propuesta:** `f00275`

**Comportamiento actual.** `packages/cli/src/commands/groups/doctor.ts` ya
implementa un doctor sólido: puntuación 0–100, clasificación P0/P1/P2, salida
JSON, códigos de salida aptos para CI, y comprobaciones de workspace, config,
manifests, git, docs obsoletos, permisos y runtime.

**Por qué es una mejora y no un bug.** La pregunta del encargo era si *tendría
sentido* un `mcpv doctor`. La respuesta es que ya existe y está bien planteado.
Lo que falta es que cubra los modos de fallo reales que este informe documenta.

**Solución propuesta.** Tres modos:
- `mcpv doctor --offline` — sin red, para entornos cerrados.
- `mcpv doctor --ci` — códigos de salida y salida estructurada para pipelines.
- `mcpv doctor --deep` — el verificador transversal, comprobando:
  ciclo de vida y disposers (`E01`/`E02`), drift de artefactos generados,
  presupuestos de tokens, estado de la superficie adaptativa, salud de MCPs
  externos, desalineación de versiones package/manifest/runtime (`F05`),
  discrepancias capability↔efectos (`D01`), branch protection, estado de CI del
  SHA integrado, procesos huérfanos y locks huérfanos.

**Restricción de diseño.** `--fix` debe ser siempre explícito; `doctor` por
defecto nunca debe modificar nada.

**Tests a añadir.** Un spec por comprobación de `--deep` con fixture sano y
fixture roto.

**Criterios de aceptación.** `mcpv doctor --deep` detecta, sobre un repo
sintético, cada uno de los hallazgos P0 de este informe.

**Dependencias.** Se construye sobre los arreglos, no antes.

---

### AUD-F05 — 41 de 51 plugins publican una versión y declaran otra al host

- **Clasificación:** BUG CONFIRMADO · **Severidad:** MEDIA · **Área:** manifests / release
- **Propuesta:** `x00293`

**Comportamiento actual.** El `version` que un plugin declara en su `register()`
—el que viaja al host MCP— está desincronizado del que se publica en npm.
Verificado sobre los 51 plugins de `2cf17373`:

```
$ for d in plugins/*/; do
    pkg=$(node -e "console.log(require('./$d/package.json').version)")
    mf=$(grep -oE "version: '[^']+'" $d/plugin.manifest.ts | head -1)
    rt=$(grep -oE "version: '[^']+'" $d/src/index.ts   | head -1)
    …
  done

PLUGIN                   PKG      MANIFEST RUNTIME
api                      0.1.1    0.1.1    0.1.0    ✗
audit                    0.1.1    0.1.1    0.1.0    ✗
…
web-fetch                0.1.1    0.1.1    0.1.0    ✗

Plugins con drift package↔runtime: 41 de 51
```

`package.json` y `plugin.manifest.ts` van sincronizados en `0.1.1` — hay un lint
(`lint:manifest-vs-package`) que lo garantiza. El tercer sitio, el `version:` del
objeto que devuelve `src/index.ts`, **no lo cubre ningún gate** y se quedó en
`0.1.0` en 41 plugins.

Como síntoma adyacente, `plugins/changelog/src/index.ts:24` conserva un comentario
`// S3 will wire tsconfig/vitest/plugin-defaults/publish-order/preset-catalog.`
cuando el manifest ya describe un estado posterior.

**Por qué es un problema.** No es sólo cosmético, y es más grande de lo que
parece a plugin único: **el host MCP recibe `0.1.0` para 41 plugins que se
publican como `0.1.1`**. Cualquier lógica que razone sobre la versión reportada
en runtime —`compat-window`, diagnóstico de `doctor`, telemetría, la matriz de
compatibilidad de hosts, o el propio soporte al usuario— está trabajando con un
número falso. Y demuestra que hay **tres fuentes de verdad parcialmente
independientes**: dos con gate y una sin él.

**Impacto.** Diagnóstico erróneo en todo el ecosistema de adopción; un adoptante
que reporte "estoy en 0.1.0" habiendo instalado 0.1.1 hace imposible reproducir.

**Riesgo.** Medio. Bajo hoy porque el delta es un patch; alto en cuanto las
versiones diverjan de verdad.

**Reproducción.** El bucle de la evidencia.

**Solución mínima.** Corregir los 41 `version:` y borrar el comentario obsoleto de
`changelog`.

**Solución arquitectónica ideal.** Eliminar la tercera fuente: que el `version`
del plugin **se derive** del `package.json` en build en vez de escribirse a mano.
Si eso no es viable por el modo en que se empaquetan los plugins, extender
`lint:manifest-vs-package` para comparar **las tres** fuentes — el gate ya existe
y ya compara dos, sólo le falta la tercera. Una constante duplicada a mano en 51
sitios volverá a divergir; la única corrección duradera es que no haya nada que
sincronizar.

**Tests a añadir.**
- Extensión de `lint:manifest-vs-package` que compare `package.json` ↔
  `plugin.manifest.ts` ↔ `src/index.ts` en los 51 plugins y falle nombrando cada
  divergencia. Este test falla hoy con 41 violaciones: es la prueba de que sirve.
- Spec del lint con un plugin fixture cuyas tres versiones coinciden ⇒ pasa; con
  una divergente ⇒ falla nombrando el fichero.

**Criterios de aceptación.** Las tres fuentes coinciden en los 51 plugins,
verificado en CI; el gate está en `manifests-check`.

**Dependencias.** Ninguna. **Tokens:** ninguno. **Compatibilidad:** ninguna.

---

### AUD-F06 — Duplicación de payload: `content[0].text` y `structuredContent` llevan lo mismo

- **Clasificación:** DEUDA TÉCNICA · **Severidad:** MEDIA · **Área:** tokens / contratos
- **Propuesta:** `v00132`

**Comportamiento actual.** El helper de resultados serializa el mismo objeto dos
veces: `content[0].text = JSON.stringify(value)` y `structuredContent = value`.

**Por qué es un problema (con matiz honesto).** A nivel de **wire** la
duplicación es real y medible. El efecto sobre los **tokens del modelo** depende
de cómo cada host MCP transforme el resultado antes de inyectarlo en el contexto:
algunos usan sólo `structuredContent`, otros sólo el texto, otros ambos. Por eso
**no** afirmo que duplique la factura de tokens en todos los clientes — afirmo
que duplica el contenido semántico en el wire y que, en los hosts que usan ambos,
sí la duplica.

**Solución mínima.** Emitir `content[0].text` con un **resumen** compacto y
`structuredContent` con los datos, en lugar del mismo JSON dos veces.

**Solución arquitectónica ideal.** Medir tres magnitudes separadas —`wire_bytes`,
`model_context_tokens`, `useful_tokens`— por host, y elegir la representación en
función del perfil del cliente (que ya se conoce en `initialize`, ver `AUD-C01`).

**Tests a añadir.** Spec: `content[0].text` no es igual a
`JSON.stringify(structuredContent)`; test de tamaño del payload de respuesta para
las 10 tools más usadas.

**Criterios de aceptación.** Ninguna respuesta lleva el mismo JSON dos veces.

**Dependencias.** C01 (perfil de cliente) para la versión ideal.

---

### AUD-F07 — Documentación: páginas manuales que duplican las auto-generadas

- **Clasificación:** DEUDA TÉCNICA · **Severidad:** BAJA · **Área:** docs
- **Propuesta:** `d00014`

**Comportamiento actual.** Los 51 plugins tienen página en
`docs/mcp-vertex/plugins/auto-generated/`. Además existen tres páginas manuales
—`context-for-change.md`, `error-reporting.md`, `impact-analysis.md`— en el
directorio padre, sin drift check.

**Por qué es un problema.** Dos páginas para el mismo plugin, una gobernada por
drift check y otra no. `DOCS-MANUAL-VS-GENERATED.md` existe precisamente para
evitar esto.

**Solución mínima.** Fusionar el contenido manual en el generador (como sección
de "notas") o mover las tres a `plugins/authoring/`.

**Criterios de aceptación.** Un plugin, una página canónica; `lint:content-integrity`
lo verifica.

---

## 10bis. Track G — confianza y control (uso real del autor)

> Este track no sale de leer el repositorio, sino de **preguntas concretas del
> autor sobre su propio uso diario**, y de una conversación paralela con otro
> revisor. Todo lo que sigue está verificado por mí contra el estado real de
> `.cache/mcp-vertex/` y del código en `2cf17373`.
>
> Contexto que cambia la lectura del proyecto: **un solo autor, tres meses, en
> ratos libres, y con dogfooding real** — las features nuevas nacen de fricción
> vivida, no de una lista. Eso hace que estos cuatro dolores sean, con
> diferencia, el backlog de mayor valor: no son features nuevas, son la
> capacidad de *saber si lo que ya existe está funcionando*.

### AUD-G01 — `error-reporting` no está muerto: falló 27 veces en silencio y abrió un cortacircuitos hace tres días

- **Clasificación:** BUG CONFIRMADO · **Severidad:** ALTA · **Área:** observabilidad / error-reporting
- **Propuesta:** `f00276`

**La duda del autor.** *"El plugin de enviar issues de errores… o no está habiendo
errores, cosa que dudo muchísimo, o no funciona."*

**La respuesta, con datos.** El plugin **sí funciona**. Su estado persistido lo
demuestra:

```
$ cat .cache/mcp-vertex/error-reporting/reported.json
{
  "25e689a8…": { "classification": "BUG", "attemptCount": 27,
                 "lastAttemptAt": "2026-08-25T09:31:09.742Z",
                 "lastFailureCode": "GH_NOT_INSTALLED",
                 "consecutiveFailureCount": 7,
                 "circuitOpenUntil": "2026-08-25T10:22:16.179Z" },
  "fa222edd…": { … idéntico … }
}
$ stat -c '%y' .cache/mcp-vertex/error-reporting/reported.json
2026-08-25 11:31:09 +0200          ← sin tocar desde hace 3 días
```

Es decir: observó los fallos, los clasificó como `BUG`, y **intentó despacharlos
27 veces**. Las 27 fallaron en el **transporte**, no en la lógica. Tras 7 fallos
consecutivos abrió el cortacircuitos y se calló.

Y el diagnóstico está además **obsoleto**:
```
$ which gh && gh --version
/usr/bin/gh
gh version 2.4.0

$ gh auth status
✓ Logged in to github.com as CartagoGit
✓ Token: ***

$ gh issue create --help    → exit 0 (el subcomando existe)
```
`gh` está instalado y autenticado ahora. `GH_NOT_INSTALLED` viene de
`run-command.ts:239` (`error.code === 'ENOENT' ? 127 : 126`) → `run-external-tool`
(`unavailable: outcome.code === 127`) → `reporter.service.ts:82`. Era cierto el
25 de agosto; hoy ya no lo es. Nada reevaluó ni informó.

**Y el log no puede corroborarlo.** El histórico completo de eventos:
```
$ python3 … .cache/mcp-vertex/results/logs/*.jsonl
total eventos: 856
  456  server-started
  200  tool-started
  200  tool-completed
outcome:  {'ok': 856}        ← 100 %
severity: {'info': 856}      ← 100 %
```
856 eventos, **todos `ok`**, 200 `tool-started` contra 200 `tool-completed`, cero
`tool-failed`. El tipo existe y hay quien lo emite
(`packages/core/src/lib/tools/with-incident-logging.ts:103`), simplemente no ha
ocurrido en la ventana registrada. Así que los dos subsistemas están callados y
**ninguno puede decirte cuál de los dos silencios estás mirando**.

**Por qué es un problema.** El defecto no es la lógica del plugin —es correcta y
está bien probada (15 specs). El defecto es que un fallo de clase P0 corrió
**27 intentos y 3 días** sin que nada lo hiciera visible: ni un log, ni una
notificación, ni una comprobación de `doctor`, ni un aviso al arrancar. El único
sitio donde vive la verdad es un JSON en `.cache/` que hay que saber que existe.

Y el coste real no es el issue no creado: es que el autor pase a **desconfiar de
un subsistema que funciona**. Eso es más caro que el bug.

**Impacto.** Los bugs que el dogfooding descubre —el activo más valioso del
proyecto ahora mismo— se están perdiendo silenciosamente.

**Riesgo.** Alto, y ya materializado durante tres días.

**Reproducción.** Los cuatro comandos de la evidencia.

**Solución mínima.** Que `report_status` muestre siempre, sin argumentos:
`lastFailureCode`, `consecutiveFailureCount`, `circuitOpenUntil` y la antigüedad
del último intento; y que un cortacircuitos abierto se registre en el log como
`severity: 'warn'` en vez de sólo en el JSON.

**Solución arquitectónica ideal — el embudo como contadores observables.** El
autor no debería tener que razonar sobre nueve etapas invisibles. Bastan
contadores locales (ningún dato sensible):

```
observedFailures       184     lastObservedAt    2026-08-27T…
ignoredNonFailures      37     lastClassifiedAt  2026-08-27T…
notVertexInternal      121     lastSubmittedAt   2026-08-25T…
privacyBlocked           2     lastFailureCode   GH_NOT_INSTALLED
deduplicated            11     circuitOpenUntil  —
rateLimited              3
submissionAttempted     10
submissionSucceeded      9
submissionFailed         1
```

Con eso, la pregunta se responde sola: *"ha visto 184 fallos, 121 no eran de
Vertex"* frente a *"500 llamadas fallidas y `observedFailures = 0`: el hook está
roto"*. Y un cortacircuitos abierto debe **reevaluarse**, no quedarse fijado: el
código de fallo es un hecho fechado, no una propiedad permanente.

Añadir además un auto-test que no cree ningún issue:
```
mcpv doctor --deep error-reporting
  ✓ plugin loaded        ✓ privacy validation working
  ✓ hook registered      ✓ report store writable
  ✓ synthetic failure observed
  ✓ classification pipeline working
  ✓ gh installed         ✓ gh authenticated
  ✓ target repo reachable ✓ issue-create permission available
```
con `--live` opcional para probar el transporte de verdad.

**Tests a añadir.**
- Spec: con `gh` ausente, tras N fallos el estado es visible en `report_status`
  **sin argumentos**.
- Spec: un cortacircuitos cuyo `circuitOpenUntil` ya pasó se reevalúa en el
  siguiente fallo observado (hoy el fichero lleva 3 días sin tocarse).
- Spec por cada etapa del embudo: incrementa su contador y sólo el suyo.
- Spec: `doctor --deep error-reporting` detecta cada modo de fallo con un
  `gh` falso, y **no crea ningún issue**.
- Spec de conciliación: `observedFailures` casa con los `tool-failed` del log en
  la misma ventana. Es el test que hace que los dos subsistemas se vigilen.

**Criterios de aceptación.** Responder *"¿está funcionando error-reporting?"* no
requiere abrir ningún fichero de `.cache/`; un fallo de transporte es visible en
el primer intento, no en el vigésimo séptimo.

**Dependencias.** Ninguna. **Tokens:** ninguno (los contadores no van a
`tools/list`). **Compatibilidad:** aditiva.

---

### AUD-G02 — Los agentes en worktrees son invisibles: no hay forma de saber si hacen lo que se les pidió

- **Clasificación:** IDEA DE PRODUCTO (dolor real del autor) · **Severidad:** ALTA · **Área:** orquestación / producto
- **Propuesta:** `f00277` (control plane) + `f00278` (WorkIntent y completion gates)

**El dolor.** *"Cuando varios agentes trabajan en worktrees es imposible saber si
lo que están haciendo es lo que queremos de verdad, y no voy a estar cambiando de
ramas."*

**Comportamiento actual.** Git aísla perfectamente cada worktree; el proyecto ya
tiene `agentWorktree`, `agent-branch-naming`, locks de fichero, cola de tareas y
detector de bucles. Lo que **no** existe es una proyección legible del estado de
todos los agentes sin cambiar de checkout — ni, más importante, ninguna
representación de **lo que se pidió** frente a **lo que se está haciendo**.

**Por qué es un problema.** Un diff no responde la pregunta. La pregunta es de
*alineación*: el agente iba a arreglar el ciclo de vida lazy, ¿por qué ha tocado
`package.json` y `plugins/proposals/`? Sin un objetivo declarado, no hay nada
contra lo que comparar, y la supervisión recae enteramente en la cabeza del
autor.

**Solución arquitectónica ideal — dos piezas, en este orden.**

**1. `WorkIntent`, un contrato de trabajo previo.** Antes de arrancar, un agente
declara: objetivo, `proposalId`, `agentId`, worktree, `baseCommit`,
`expectedAreas` (globs, no lista exacta de ficheros), `forbiddenAreas`,
`acceptanceCriteria[]`, `requiredChecks[]`, `allowedEffects[]`. Con eso, el
sistema puede calcular de forma **determinista y sin LLM**:
`ALIGNED` / `MINOR_DRIFT` / `DRIFTED` / `VIOLATION`. Comparar globs con el diff
real es aritmética, no juicio.

**2. `AgentSession` como entidad de primera clase** — no "hay una ruta por ahí":
`{ id, agent, proposal, worktree, branch, baseCommit, currentCommit, intent,
status, lastActivity, modifiedFiles, checks, violations, drift, cost }`, y
`mcpv agents` como proyección:
```
agent-7   #183 External MCP teardown   ████████░░ 82%  aligned      12 files  0 violations
agent-9   #186 Adaptive eviction       ██████░░░░ 61%  ⚠ drift       3 files fuera de alcance
agent-11  #191 Docs                    █████████░ 94%  ready for review
```
Git permite inspeccionar otro worktree sin tocar el checkout propio, así que esto
es leer, no coordinar.

**Y un supervisor barato.** El análisis de deriva es determinista y gratis; sólo
cuando detecta `DRIFTED` merece la pena gastar un LLM en preguntar *"el agente
arreglaba lifecycle lazy pero tocó proposals y package.json, ¿es coherente?"*.
Barato y más fiable que vigilar con un modelo permanentemente.

**Por qué esto y no otro plugin.** Es la pieza que hace supervisable todo lo que
ya existe. Y la extensión de VS Code —que hoy tiene 34 comandos y poca
explicabilidad (`AUD-F03`)— tendría por fin algo que merece una vista.

**Criterios de aceptación.** Responder *"¿qué están haciendo mis tres agentes y
cuál se ha desviado?"* sin cambiar de rama y sin leer un diff.

---

### AUD-G03 — Las reglas dependen de la obediencia del modelo: faltan las otras dos categorías

- **Clasificación:** RIESGO DE DISEÑO · **Severidad:** ALTA · **Área:** reglas / enforcement
- **Propuesta:** `f00279`

**El dolor.** *"Muchas reglas no las cumplen del todo bien."*

**Comportamiento actual.** El plugin `rules` (185 ficheros) detecta stack, prioriza
la configuración del proyecto y resuelve comandos — y su salida final es texto
para el modelo. El modelo responde "vale" y a veces no lo hace. Eso va a ocurrir
siempre, y **no se arregla con prompts más insistentes**.

**Por qué es un problema.** Hay una confusión de categoría: *regla mostrada al
agente* ≠ *regla aplicada*. Hoy todas las reglas viven en la primera categoría,
incluidas las que no deberían.

**Solución arquitectónica ideal — tres categorías con tres mecanismos distintos.**

| Categoría | Ejemplos | Mecanismo | Incumplirla es… |
| --- | --- | --- | --- |
| **Guidance** | preferir `readonly`, funciones pequeñas, inyección de dependencias | prompt al LLM | aceptable a veces |
| **Verification** | tsc, biome, fronteras de dependencias, imports prohibidos, cobertura | **completion gate** | permitido mientras trabaja, **prohibido al declarar hecho** |
| **Enforcement** | escribir fuera del workspace, push a `main`, tocar rutas protegidas, red, procesos prohibidos | **runtime / EffectBroker** | imposible |

```
guidance     → LLM
verification → completion gate
enforcement  → runtime
```

**La consecuencia potente: que `COMPLETED` signifique algo.** Para pasar
`ACTIVE → COMPLETED`, `proposal_transition` debería exigir: criterios de
aceptación con evidencia **and** checks requeridos en verde **and** sin diff
prohibido **and** verificación de reglas en verde **and** sin deriva sin resolver
**and** base no invalidada. Entonces el agente no puede decir "Done": el sistema
responde
```
Cannot complete proposal.
  2 acceptance criteria have no evidence.
  1 unexpected file was modified.
  architecture check is failing.
```
Eso es control agentic real, y encaja exactamente con la máquina de estados que
`proposals` ya tiene. Conecta además con `AUD-D01`/`AUD-D02`: el `EffectBroker`
es el mecanismo de la tercera categoría.

**Criterios de aceptación.** Toda regla del catálogo está etiquetada con su
categoría; ninguna regla de `enforcement` se implementa como texto en un prompt.

---

### AUD-G04 — Adoptar el proyecto en un repo grande exige que el usuario entienda Vertex

> **CORRECCIÓN (redacción de `f00280`).** La «solución ideal» que describo aquí
> —`mcpv adopt` con descubrimiento read-only, perfil recomendado y confirmación
> antes de aplicar— **ya existe y funciona**: herramienta `adopt_project`,
> comando `mcpv adopt` (cableado en `packages/cli/src/commands/groups/core.ts`),
> dry-run por defecto y un `IAdoptionAssessment` completo con justificación por
> plugin y estimación de coste. Prescribí construir algo construido. Lo que sí
> falta, y es a lo que queda reducida `f00280`: un `ProjectProfile` persistido y
> un desglose por workspace, porque hoy `chooseCandidatePreset` colapsa cualquier
> monorepo a un único preset `'swarm'` sin analizar áreas.


- **Clasificación:** IDEA DE PRODUCTO · **Severidad:** ALTA · **Área:** adopción / DX
- **Propuesta:** `f00280`

**El dolor.** *"Para implementarlo en otro proyecto es complejo si el proyecto es
grande; si es pequeño es sencillo."*

**Por qué ocurre.** En un repo pequeño el stack se detecta y la configuración es
evidente. En un monorepo con varias apps, varios lenguajes, CI heredado, código
generado, paths especiales y paquetes internos, el conocimiento requerido escala
— y hoy lo aporta el usuario. **Debería ser al revés: cuanto más grande el repo,
más trabajo debería hacer Vertex.** El adoptante no debería tener que entender 51
plugins para instalar 51 plugins.

**Solución arquitectónica ideal — tres piezas.**

**1. `mcpv adopt`, descubrimiento en sólo lectura** que informa antes de tocar
nada: tipo de repo, gestor de paquetes, workspaces, áreas y su framework,
política de ramas, workflows de CI, runners de test, directorios generados,
migraciones y rutas vendorizadas. Termina con un perfil **recomendado** y
`No files have been changed. Apply?`.

**2. `ProjectProfile` persistido** (`.mcp-vertex/project-profile.json`), generado
y actualizado incrementalmente. Hoy da la impresión de que varios plugins
redescubren por su cuenta partes del proyecto; un perfil central sería contexto
común y eliminaría duplicación real. Conecta con `AUD-A09`/`AUD-A11`/`AUD-A12`:
la misma cura de fondo, **derivar el alcance de una fuente y no repetirlo**.

**3. Adopción por etapas**, para que el repo funcione desde el minuto uno:
`core+git+search+doctor` → `rules+testing+quality` → `proposals+agents` →
plugins especializados → external MCP y políticas avanzadas.

**Criterios de aceptación.** Adoptar Vertex en un monorepo de 27 workspaces no
exige leer documentación de plugins; `mcpv adopt` produce una configuración
funcional y explica cada decisión.

---

### AUD-G05 — La arquitectura del sistema incluye la cabeza del autor

- **Clasificación:** RIESGO DE DISEÑO · **Severidad:** ALTA · **Área:** mantenibilidad / gobernanza
- **Propuesta:** `d00015`

**Comportamiento actual.** Un solo autor sabe por qué existe cada pieza, qué es
experimental, qué contrato pretendía, qué reemplaza a qué, qué caso límite motivó
cada helper y qué comportamiento no debe tocarse. El repositorio todavía no
contiene ese contexto.

**Por qué es el riesgo más importante a medio plazo.** Por encima de varios de los
bugs de este informe. Y hay evidencia empírica en la propia auditoría: `AUD-E01`
(eager ≠ lazy), `AUD-D07` (el guard que compara literales inexistentes) y
`AUD-C02` (el working set inerte) son exactamente lo que ocurre cuando un
invariante vive en la cabeza de alguien y no en un test.

**Solución.** Convertir ese conocimiento en **invariantes explícitos** por
subsistema, cada uno con su test:

```
Plugin lifecycle
- register ocurre exactamente una vez
- dispose ocurre como máximo una vez
- eager y lazy tienen semántica idéntica          ← hoy FALSO (AUD-E01)
- timeout y AbortSignal funcionan en ambos        ← hoy FALSO (AUD-E01)
- un fallo parcial revierte en orden inverso

Effects
- ningún efecto real evita el policy engine       ← hoy FALSO (AUD-D01)
- dry-run no puede producir efectos               ← hoy FALSO (AUD-D02)
- las capacidades concedidas son observables

Adaptive
- visible ≠ loaded ≠ active ≠ callable            ← hoy CIERTO (y bien diseñado)
- una herramienta nunca desaparece mientras esté in-flight
- activación y desactivación tienen histéresis    ← hoy no existe (AUD-C03)

External MCP
- todo proceso tiene propietario                  ← hoy FALSO (AUD-D05)
- todo propietario tiene teardown                 ← hoy FALSO (AUD-E02)
- toda ejecución tiene timeout
- la autonomía del modelo se aplica de verdad     ← hoy FALSO (AUD-D04)
```

Nótese que **la mitad de los invariantes que el autor daría por ciertos son
falsos hoy**, y que esta auditoría los encontró uno a uno. Escribirlos es lo que
convierte cada bug del dogfooding en una propiedad permanente del sistema en vez
de en una corrección puntual.

**Criterios de aceptación.** Cada subsistema mayor tiene un documento de
invariantes, y cada invariante tiene un test que falla si se rompe.


---

## 11. Inventario del monorepo

Snapshot `2cf17373`. 4.783 ficheros versionados, 3.230 `.ts`, 1.054 `.spec.ts`.

| Área | Ficheros (ts/tsx/astro) | Líneas | Nota |
| --- | ---: | ---: | --- |
| `plugins/` (51) | 1.692 | 222.815 | 47% del código |
| `packages/core` | 570 | 87.896 | El runtime |
| `tools/` | 303 | 56.143 | ~130 scripts de lint/gen/verify/ci |
| `apps/web` | 277 | 29.056 | Astro + Pagefind + i18n |
| `extensions/vscode` | 138 | 20.394 | 34 comandos |
| `packages/cli` | 120 | 18.169 | `mcpv` |
| `apps/shared` | 50 | 11.015 | i18n 12 idiomas |
| `packages/client` | 72 | 10.499 | Cliente TS |
| `packages/ui-extension` | 94 | 9.399 | UI compartida IDE |
| **Total** | **~3.300** | **~465.400** | |

**Workspaces:** `packages/*`, `plugins/*`, `apps/*`, `extensions/*`,
`docs/mcp-vertex/examples/*`, `tools`, `tools/docs-api`.

**Artefactos generados con drift check (11):** `agent-catalog.generated.json`,
`agent-instructions.generated.md`, `plugin-catalog.generated.md`,
`plugin-manifests.generated.{md,json}`, `plugin-manifest-catalog.generated.ts`,
`catalog.generated.ts`, `unicode-emoji-names.generated.ts`,
`managed-lazy-catalog.generated.ts`, `first-party-manifest-entries.generated.ts`,
`preset-metadata.generated.ts`.

**CI:** 14 workflows — `ci`, `tier1`, `tier2`, `tier3`, `affected`, `drift`,
`pack-smoke`, `pages`, `release`, `codeql`, `surface-bootstrap`,
`quality-gate`, `verify-develop-health`, `rotate-npm-token`.

**Gobernanza:** 351 propuestas en `done/`, 74 en `ready/`, 17 en `in-progress/`,
130 congeladas en `legacy/closed/`, 1 en `review/`, 2 en `retired/`, 1 en `paused/`.

**Deuda declarada:** 74 `TODO/FIXME/HACK`, 88 `any` explícitos, 17
`@ts-ignore`/`biome-ignore`, 10 `skip` (9 condicionales legítimos + 1 deuda real).

---

## 12. Inventario de plugins

51 plugins. Columnas: ficheros de fuente (sin specs), líneas, ficheros `*.tool.ts`,
specs. `Tools` cuenta ficheros de herramienta, no herramientas registradas (varios
plugins registran varias por fichero o inline; el conteo canónico vive en
`agent-catalog.generated.json`).

| Plugin | Ficheros | Líneas | `*.tool.ts` | Specs | Efectos observados |
| --- | ---: | ---: | ---: | ---: | --- |
| proposals | 168 | 37.167 | 26 | 135 | spawn·10 write·27 |
| rules | 185 | 10.078 | 0 | 15 | write·1 fetch·1 |
| orchestrator-runner | 47 | 5.900 | 11 | 22 | spawn·12 write·6 fetch·1 |
| audit | 30 | 5.675 | 4 | 14 | write·7 fetch·1 |
| commit-policy | 24 | 4.481 | 0 | 15 | spawn·2 write·1 |
| forge | 34 | 4.080 | 4 | 24 | spawn·4 write·2 |
| error-reporting | 32 | 3.709 | 1 | 15 | spawn·1 write·1 |
| usage-tracking | 28 | 3.573 | 3 | 18 | write·5 fetch·1 |
| search | 25 | 3.370 | 4 | 17 | spawn·2 write·1 |
| external-mcps | 16 | 3.159 | 6 | 9 | spawn·4 write·1 fetch·1 |
| memory | 30 | 3.094 | 3 | 13 | write·1 |
| agent-orchestrator | 23 | 2.758 | 3 | 15 | spawn·11 |
| issues | 20 | 2.721 | 6 | 13 | spawn·3 write·5 |
| logs | 19 | 2.614 | 0 | 10 | write·1 |
| security | 25 | 2.330 | 4 | 14 | spawn·1 write·3 |
| observability | 23 | 2.339 | 4 | 11 | fetch·1 |
| auto-agent-selector | 30 | 2.267 | 5 | 14 | spawn·3 write·2 |
| git | 15 | 2.266 | 1 | 6 | spawn·2 |
| deps | 13 | 2.132 | 0 | 6 | spawn·3 fetch·1 |
| database | 14 | 2.113 | 3 | 7 | spawn·1 |
| container | 25 | 1.931 | 3 | 14 | spawn·2 write·2 |
| refactor | 11 | 1.894 | 3 | 7 | write·2 · **sin README** |
| quality | 15 | 1.675 | 2 | 9 | spawn·5 |
| browser | 14 | 1.440 | 3 | 5 | spawn·3 write·3 |
| auto-plugin-selector | 15 | 1.357 | 1 | 9 | — |
| status-marker | 9 | 1.304 | 0 | 3 | — |
| test-convention | 14 | 1.294 | 0 | 6 | — |
| env | 15 | 1.188 | 2 | 7 | — |
| diagram | 13 | 1.146 | 2 | 5 | — |
| perf | 14 | 1.111 | 3 | 7 | write·1 |
| notification | 11 | 1.111 | 0 | 3 | — |
| issues-triage | 14 | 1.037 | 0 | 4 | write·1 |
| docs | 10 | 985 | 1 | 5 | — |
| adaptive-optimizer | 12 | 964 | 2 | 4 | — |
| quality-policy | 11 | 874 | 1 | 2 | — |
| impact-analysis | 11 | 824 | 2 | 2 | — |
| i18n | 11 | 823 | 2 | 4 | — |
| context-for-change | 10 | 800 | 1 | 2 | — |
| conventions | 15 | 790 | 2 | 7 | — |
| changelog | 11 | 771 | 2 | 3 | spawn·2 · **version drift** |
| project-health | 10 | 763 | 1 | 2 | — |
| prompt-eval | 9 | 757 | 2 | 6 | spawn·4 |
| test-policy | 8 | 595 | 2 | 3 | write·1 |
| completion | 7 | 530 | 0 | 2 | write·1 |
| prompts-pack | 11 | 521 | 0 | 1 | — |
| link-check | 8 | 515 | 1 | 1 | — |
| cache | 8 | 427 | 0 | 1 | — |
| tech-debt | 8 | 345 | 1 | 1 | — |
| skills-pack | 5 | 202 | 0 | 1 | — |
| api | 16 | 2.420 | 3 | 9 | spawn·1 fetch·1 |
| web-fetch | 9 | 735 | 0 | 3 | — |

**Observaciones del inventario.**
- **31 de 51 plugins ejecutan efectos** (spawn, escritura o red); sólo **6** usan
  `ctx.effects` (ver `AUD-D01`).
- **13 plugins tienen 0 ficheros `*.tool.ts`**: unos son *data packs* (`rules`,
  `prompts-pack`, `skills-pack`, `completion`), otros registran inline
  (`commit-policy`, `logs`, `deps`, `notification`, `status-marker`,
  `test-convention`, `issues-triage`, `cache`, `web-fetch`). No es un defecto,
  pero la ausencia de una convención única dificulta el inventario automático.
- **2 plugins sin README**: `external-mcps` (el de mayor superficie de riesgo) y
  `refactor`.
- **Solapamiento funcional detectado**: `quality` / `quality-policy` /
  `test-policy` / `test-convention` cubren territorio adyacente;
  `auto-agent-selector` / `auto-plugin-selector` / `adaptive-optimizer` también.
  No propongo fusionarlos ahora (ver §16), pero sí documentar la frontera.

---

## 13. Top 10 cambios por ROI

Ordenados por (impacto × certeza) / esfuerzo. Los cinco primeros son los que
cambian la naturaleza del proyecto; el resto son multiplicadores.

| # | Cambio | Hallazgos | Esfuerzo | Por qué está aquí |
| --- | --- | --- | --- | --- |
| 1 | **`PluginActivationSession`**: unificar activación eager/lazy (opciones, timeout, cancelación, `dispose`) | `E01` | M | Cierra tres bugs críticos de una vez y elimina la causa estructural de que vuelvan |
| 2 | **`McpHostSession.dispose()`** + `dispose` en `external-mcps` | `E02`, `D05` | M | Sin él, el nº 1 no produce mejora observable: la cadena está rota en tres niveles |
| 3 | **Podar los 5 `outputSchema` más caros** + envelope compartido `$ref` | `B01` | S | ~40 KB inmediatos de 284 KB; el mayor ahorro por hora invertida de todo el informe |
| 4 | **Lint de fronteras de efectos** (prohibir `node:*` sensible en plugins) con ratchet desde 104 | `D01`, `D02` | M | Convierte la seguridad de declarativa en verificable; sin esto `dryRun` no puede ser real |
| 5 | **Arreglar los tres gates ciegos/rotos**: `allow_deletions`, 403 de `develop-health`, falso verde de `branch-protection` | `A04`, `A05`, `A06` | S | Tres arreglos pequeños que devuelven la señal a toda la gobernanza |
| 6 | **`biome ci .`** con baseline-ratchet | `A09` | S | Pasa la cobertura de lint del 3% al 100% del monorepo en un PR |
| 7 | **`llmDecidesActivation` + `eager`** conectados y probados en `external-mcps` | `D03`, `D04` | S | Requisito previo para el router de MCPs externos, que es la mejor idea de producto |
| 8 | **Evicción real del working set** (dispose + rebind lazy) | `C02` | M | Convierte dos opciones inertes en control de memoria real en sesiones largas |
| 9 | **Métricas de superficie útil**: precision / recall / churn / useful-tokens | `B05` | M | Es lo que permite decidir la segunda ola de poda con datos, no con intuición |
| 10 | **Mapa único workspace→proyecto vitest** + arreglo de `affected` | `A11` | S | Devuelve el feedback rápido que el tier1 promete y hoy no da |

---

## 14. Roadmap P0 / P1 / P2

### P0 — contratos de runtime (bloquean cualquier release)

1. `E01` — `PluginActivationSession`: equivalencia eager/lazy en opciones,
   timeout, cancelación y `dispose`, con test parametrizado por ruta.
2. `E02` — `McpHostSession.dispose()` idempotente, teardown en orden inverso,
   `try/finally` en `runCli`.
3. `D05` — `dispose` en `external-mcps` (SIGTERM → grace → SIGKILL, idempotente).
4. `D04` — `llmDecidesActivation` conectado al proxy de activación.
5. `A06` — `allow_deletions` (bloquea A04 y A05).
6. `A05` — "no verificado" deja de ser verde.
7. `A04` — `develop-health` deja de explotar con 403 (**es el único check rojo
   del snapshot actual**).
8. `D01` — lint de fronteras de efectos con ratchet inicial 104 (medido; el 13 publicado contaba sólo `child_process`).
9. `A09` — Biome sobre todo el monorepo con baseline.

### P1 — coste, superficie y verificabilidad

10. `B01` — compact output contracts: envelope `$ref`, `detail` compact/normal/full,
    esquemas pesados como *resources*, poda de los 5 más caros.
11. `B02` — dashboard honesto (`n/a` en vez de `over hard (0B)`); techos marginales
    obligatorios en los 6 presets gobernados.
12. `C01` — decidir el modo por capacidades reales del cliente + perfiles por host.
13. `C02` — evicción real del working set.
14. `D02` — `EffectBroker`: dry-run como prevención, no detección.
15. `A11` — mapa workspace→proyecto vitest.
16. `D03` — `eager` en el schema + test de contrato schema↔registry.
17. `F01` — apretar umbrales de cobertura + branches ≥80% en los módulos de P0.
18. `F02` — reescribir el e2e de dogfood de `commit-policy`.
19. `F05` — versión única por plugin (extender `lint:manifest-vs-package`).
20. `A01`/`d00013` — ADR que fije el modelo de ramas y el guard de push a `main`.
21. `B03` — ratchet descendente de presupuestos con excepción caducable.
22. `A10` — desduplicar `ci.yml` vs `tier2`, workflow reutilizable de setup.

### P2 — plataforma

23. `B05` — telemetría de superficie útil (precision/recall/churn/useful-tokens).
24. `C03` — ranking, confianza e histéresis en `tool_search`.
25. `E03` — subpaths del core por dominio; barrel raíz deprecado.
26. `E04` — `client/{contracts,transport,node,scaffold}` + lint de fronteras.
27. `E05` — `proposals` como event log + máquina de estados + *workflow front doors*.
28. `F04` — `mcpv doctor --deep` / `--ci` / `--offline`.
29. `F03` — explicabilidad en VS Code (por qué esta tool, este plugin, este coste).
30. Router de MCPs externos con enrutado por coste/calidad/latencia, salud y
    fallback, colgando del `EffectBroker` (no como segunda frontera de seguridad).
31. `F06` — separar `wire_bytes` / `model_context_tokens` / `useful_tokens` y
    elegir representación por perfil de host.

---

## 15. Arquitectura objetivo propuesta

```
                              McpHostSession
                     start() · stop() · dispose() [idempotente]
                                    │
        ┌───────────────────────────┼───────────────────────────┐
        │                           │                           │
 PluginActivationManager      PolicyEngine                 Telemetry
        │                           │                           │
 PluginActivationSession       EffectBroker              usage · tokens
  normalizeOptions()                │                    churn · confusion
  createAbortController()    ┌──────┼──────┐             precision/recall
  applyRegisterTimeout()     fs   git   process
  register()                 net   db    browser
  retainRuntime()                  │
  dispose() · rollback()      capacidad real | denegada
        │                     (tool effects × policy × dryRun
   ┌────┴────┐                 × trust × workspace × user ack)
 eager     lazy
   └────┬────┘
        │
   PluginRuntime  ── dispose() obligatorio si declara capability `process`
        │
  ┌─────┼──────────────┬────────────┐
tools  resources   knowledge     agents
        │
 ToolSurfaceController
  estados ortogonales: {visible|hidden|deactivated} × {cold|warm|hot|in-flight}
  histéresis (activation > deactivation threshold, minWarmMs)
  presupuestos por modelo · perfil de host
```

**Cuatro invariantes que esta arquitectura hace ciertos por construcción:**

1. **Una sola ruta de activación.** Eager y lazy son parámetros de la misma
   sesión, no implementaciones distintas. `AUD-E01` no puede volver a ocurrir.
2. **Un solo dueño del teardown.** `McpHostSession` posee el ciclo de vida; nada
   se libera "por su cuenta". `AUD-E02` y `AUD-D05` dejan de ser posibles.
3. **Un solo camino a los efectos.** El `EffectBroker` es la única fuente de
   capacidades; el lint de fronteras lo hace verificable. `dryRun: true` pasa a
   significar *imposible*, no *inadvisable*.
4. **Visibilidad y autorización son ortogonales.** El diseño actual ya acierta
   aquí y **no debe tocarse**: `hidden` significa deliberadamente "no listado
   pero invocable" — es el mecanismo del router adaptativo, no un fallo de
   seguridad. `deactivated` es el estado no autorizado.

**Sobre external MCPs:** deben colgar del `EffectBroker`, no convertirse en una
segunda frontera de seguridad independiente con sus propias reglas.

---

## 16. Qué NO hacer

- **No reescribir el core.** La arquitectura es correcta; los bugs son de
  contrato, no de estructura. Una reescritura destruiría 1.054 specs de valor
  demostrado para arreglar lo que se arregla con una primitiva compartida.
- **No perseguir las descripciones.** Son el **6%** del coste. Un trimestre
  acortando prosa mientras el 66% vive en `outputSchema` sería el peor uso
  posible del esfuerzo. Está cuantificado en §6.
- **No tratar `hidden` como un fallo de seguridad.** Es semántica intencionada y
  correcta (`visible` = listado+invocable, `hidden` = no listado+invocable,
  `deactivated` = ninguna). "Arreglarlo" rompería el router adaptativo, que es la
  mejor pieza del proyecto.
- **No añadir superficie *especulativa*.** Matiz importante, porque el proyecto
  es de un solo autor haciendo dogfooding real: una capacidad descubierta usando
  Vertex y sufriendo la fricción tiene mucha más legitimidad que una añadida
  porque "podría ser útil algún día". La regla no es congelar features, es que
  cada una tenga una fricción vivida detrás. Lo que sí conviene es que **toda
  herramienta nueva pague su coste**: `minimal` y `lean` ya están por encima de
  su umbral de aviso, así que una tool nueva en esos presets debe venir con su
  compensación (ver `AUD-B03`). El ratio que sostiene la velocidad sin perder el
  terreno conquistado sería aproximadamente 60% necesidades surgidas del uso,
  25% endurecimiento derivado de ellas, 15% experimentos.
- **No hacer refactors preventivos grandes** sobre los hotspots (`AUD-E05`). Con
  tres meses de vida las abstracciones definitivas todavía se están descubriendo;
  conviene esperar a que dos o tres problemas reales indiquen dónde cortar. El
  criterio para los 51 plugins no es el número, es si cada uno resuelve una
  necesidad recurrente y si el core sigue siendo pequeño conceptualmente.
- **No intentar que el proyecto parezca hecho por un equipo de veinte personas.**
  Una de sus ventajas actuales es poder cambiar una decisión arquitectónica en
  una tarde sin RFCs. Lo que sí hay que hacer es que **cada decisión que
  sobreviva varias iteraciones quede grabada en un test o un invariante**
  (`AUD-G05`) — eso conserva la velocidad y elimina el riesgo.
- **No implementar descarga agresiva de plugins sin seguimiento de llamadas en
  vuelo.** `inFlightByPlugin` ya existe y la evicción actual lo respeta:
  cualquier implementación real de `AUD-C02` debe mantener esa garantía.
- **No añadir reintentos automáticos a operaciones mutadoras sin claves de
  idempotencia.** El repo ya tiene `mutations/idempotency.ts`: úsese, no se
  reinvente.
- **No fusionar todavía los plugins solapados** (`quality`/`quality-policy`,
  `auto-agent-selector`/`auto-plugin-selector`). Documéntese la frontera primero;
  fusionar sin datos de uso (`AUD-B05`) es adivinar.
- **No ampliar el catálogo de proveedores de MCPs externos** antes de cerrar
  `D03`/`D04`/`D05`. Más proveedores sobre una política de autonomía inerte
  multiplica el riesgo.
- **No proteger `develop` "porque sí".** Primero decidir formalmente el modelo
  (§`AUD-A01`); la protección es la consecuencia, no la decisión.
- **No subir ningún techo de tokens** para acomodar trabajo nuevo mientras
  `B03` no esté en su sitio.

---

## 17. Métricas a instrumentar

**Coste (ya existen, mantener).** `toolsListBytes` por preset y por owner,
desglose name/description/inputSchema/outputSchema/annotations/envelope,
tokens reales por modelo con etiqueta de confianza.

**Rendimiento (faltan, `AUD-B05`).**

| Métrica | Fórmula | Para qué |
| --- | --- | --- |
| `activation_precision` | activaciones seguidas de uso real / activaciones totales | ¿acierta el router al activar? |
| `activation_recall` | necesidades satisfechas sin fallback / necesidades reales | ¿basta el bootstrap? |
| `activation_churn` | (activaciones + desactivaciones) / sesión | detecta oscilación (falta de histéresis) |
| `unused_activation_tokens` | bytes de tools activadas y nunca usadas | el desperdicio directo |
| `surface_utilization` | bytes de tools usadas / bytes expuestos | el KPI resumen |
| `useful_token_ratio` | tokens de payload usados / tokens transmitidos | eficiencia extremo a extremo |
| `response_amplification` | bytes wire de respuesta / bytes de la representación compacta | detecta `AUD-F06` |
| `tools_list_hash_stability` | nº de mutaciones de `tools/list` por sesión | mutar la superficie invalida la caché de prompt: puede costar más de lo que ahorra |

**Ciclo de vida (faltan, P0).** `plugins_activated`, `plugins_disposed`
(deben cuadrar), `dispose_duration_ms`, `orphan_child_processes`,
`active_handles_after_dispose` (debe ser 0).

**Salud.** Estado de CI del SHA **integrado** (no del de la rama de trabajo),
drift de artefactos generados, desalineación de versiones, ratchet de efectos
directos (debe bajar monótonamente desde 13).

---

## 18. Plantilla de propuesta

Para que un agente convierta cada hallazgo de este informe en una propuesta
conforme a `docs/mcp-vertex/proposals/`.

```markdown
---
id: <x|f|c|r|t|d|v><NNNNN>
title: "<verbo en infinitivo> <qué> — <por qué en una línea>"
kind: fix | feat | chore | refactor | test | docs | perf
status: ready
type: <mismo que kind>
track: <track del plan padre>
date: <YYYY-MM-DD>
parent-plan: q00011
audit-source:
    file: docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md
    finding: AUD-XNN
    snapshot: 2cf17373f32b536e0c5154892ceddbb5d490ab37
priority: P0 | P1 | P2
related: [<ids>]
---

# <id> — <título>

## Problema

<Comportamiento actual, con la evidencia literal del informe: path:línea,
salida de comando o respuesta de API. Nunca "parece que"; si no se puede
demostrar, decir qué falta para demostrarlo.>

## Por qué importa

<Impacto y riesgo concretos. Quién se ve afectado y cómo.>

## Solución

### Mínima
<El cambio más pequeño que elimina el problema.>

### Arquitectónica
<La que elimina la CLASE de problema. Si coinciden, decirlo.>

## Slices

- [ ] **S1** — <cambio> · ficheros: `<paths>` · test: `<spec>`
- [ ] **S2** — …

## Tests

- <spec nuevo 1 — qué demuestra>
- <spec nuevo 2 — por qué habría atrapado este bug>

## Criterios de aceptación

1. <verificable por comando, no por opinión>
2. <…>

## Dependencias

<ids que deben ir antes, y por qué.>

## Impacto

- **Tokens:** <+/-/ninguno, con cifra si aplica>
- **Compatibilidad:** <breaking / aditivo / interno>
- **Riesgo de la corrección:** <qué podría romper y cómo se mitiga>
```

---

## 19. Definition of Done global

Un release candidato debe cumplir **todo** lo siguiente, simultáneamente y
verificado por comando:

```
✓ eager y lazy producen semántica idéntica (test parametrizado por ruta)
✓ cero fugas: sin runtimes, plugins ni subprocesos huérfanos tras dispose()
✓ dispose() se invoca exactamente una vez por activación, y es idempotente
✓ timeout y cancelación de register() probados en AMBAS rutas
✓ dry-run hace IMPOSIBLE el efecto, no sólo lo desaconseja
✓ los knobs de autonomía de external-mcps están conectados y probados
✓ ningún plugin importa APIs de efecto directamente fuera de un adaptador autorizado
✓ CI verde en el SHA EXACTAMENTE integrado (no en la rama de trabajo)
✓ cero drift de artefactos generados
✓ cero drift de versión package / manifest / runtime
✓ minimal y lean por debajo de su umbral de aviso, con margen de crecimiento declarado
✓ gate de regresión de tokens por plugin, no sólo por preset
✓ precision/recall/churn de activación medidos y publicados
✓ tests de concurrencia, property y e2e en verde
✓ smoke de empaquetado e instalación desde tarball bajo Node en verde
✓ mcpv doctor --deep en verde
✓ tests de salud, fallback y seguridad de MCPs externos en verde
✓ efectos documentados Y forzados por el runtime
✓ superficie pública y ventana de compatibilidad revisadas
✓ Biome en verde sobre el monorepo completo, con baseline que sólo baja
✓ cobertura de branches ≥80% en core/plugins, core/dry-run y core/project
✓ ningún it.skip incondicional sin caducidad declarada
```

---

## 20. Prompt reutilizable para la próxima auditoría

> Copiar tal cual para una futura revisión independiente. Está afinado con lo
> aprendido en ésta: exige fijar el snapshot **al final** además de al principio
> (la rama se movió a mitad de auditoría), exige ejecutar los artefactos en vez de
> leerlos, y exige distinguir "puerta verde" de "puerta que no puede fallar".

```
Quiero una auditoría técnica EXHAUSTIVA y completamente independiente de:

  REPOSITORIO: CartagoGit/mcp-vertex
  RAMA:        develop

REGLAS DE PARTIDA
- No asumas nada de auditorías anteriores ni de conversaciones previas.
- Trabaja como si fuera la primera vez que ves el proyecto.
- Fija el commit exacto de develop al EMPEZAR y vuelve a fijarlo al TERMINAR.
  Si la rama se ha movido, revalida cada hallazgo contra el snapshot final y
  marca explícitamente los que se resolvieron mientras auditabas.
- No modifiques el repositorio salvo que te lo pida después.
- No te fíes de README, docs ni comentarios: contrasta docs, configuración,
  manifests, código, tests, CI y estado real en la API de GitHub.
- Si algo está documentado pero no conectado funcionalmente, es un hallazgo.
- EJECUTA los artefactos, no sólo los leas: arranca el servidor por stdio,
  lanza los lints, corre los generadores, descarga los logs de los jobs
  fallidos. Los hallazgos de mayor impacto salen de ejecutar, no de leer.

CLASIFICACIÓN OBLIGATORIA
  BUG CONFIRMADO / BUG PROBABLE / RIESGO DE DISEÑO / DEUDA TÉCNICA /
  MEJORA / IDEA DE PRODUCTO
Si una conclusión no se puede demostrar del todo, márcala como PROBABLE y di
exactamente qué falta para confirmarla.

ALCANCE MÍNIMO (no máximo)
Estado exacto de develop (SHA, fecha, branch protection, último CI, jobs
rojos/verdes, divergencia entre lo que afirma el PR y lo realmente integrado);
estructura del monorepo; arquitectura (boundaries, ciclos, God modules, SDK
pública, fronteras browser/node); core (registry, plugin loading, lifecycle,
rollback, dispose, cancelación, timeout, cache, workspace, config, resources,
tools, knowledge, prompts, agents, proposals, security/effects); TODOS los
plugins (inventario real, drift con docs/manifests, overlap, schemas, efectos,
lifecycle, seguridad, tests, coste en tokens); cualquier plugin o feature
recién integrado, en profundidad (triggers, timers, listeners, cleanup,
retries, idempotencia, staging, branch safety, error paths, concurrencia,
multi-agente); cliente TS; CLI; web; VS Code; tests; CI/CD; seguridad;
tokens; superficie adaptativa; proposals/orchestration; MCPs externos;
observabilidad; DX; producto.

Si no puedes leer literalmente cada fichero de los plugins, prioriza:
cambiados recientemente, más caros en tokens, mayor riesgo, los que escriben
filesystem/git/red/procesos, y los que intervienen en orquestación,
proposals o seguridad. Declara explícitamente tu grado de cobertura real.

BUSCA ESPECIALMENTE (no lint ni estilo)
- opciones declaradas pero no implementadas;
- argumentos ignorados y parámetros que la firma promete y el cuerpo no lee;
- valores de retorno descartados en el único sitio que los produce;
- listeners sin consumidor y timers sin dispose;
- dos implementaciones del mismo concepto que puedan divergir;
- dos espacios de nombres para la misma cosa (fuente frecuente de bugs);
- race conditions, retries no idempotentes, staging incorrecto;
- APIs que prometen una cosa y hacen otra;
- artefactos generados obsoletos y docs que no coinciden con el árbol real;
- gates que NO PUEDEN PASAR NUNCA (rojo crónico indistinguible de rojo real);
- gates que NO PUEDEN FALLAR NUNCA (falso verde: "no verificado" = verde);
- gates que miden lo que no importa (alcance recortado, patrón textual que el
  código real elude);
- CI que puede mergear estado rojo; tools ocultas pero invocables;
- side effects sin enforcement real.

SOBRE TOKENS
No digas "acortar descriptions". MIDE y reparte el coste entre descriptions,
input schemas, output schemas, duplicación de payload, plugins concretos y
presets. Identifica CONCRETAMENTE dónde está el ahorro. Propón: compact output
contracts, resources, paginación, detail compact/normal/full, envelopes
compartidos, lazy loading, bootstrap adaptativo mínimo, presupuestos por
modelo, token ROI, useful tokens, precision/recall de activación y churn.
Distingue wire_bytes de model_context_tokens de useful_tokens.

ENTREGABLES
Para CADA hallazgo importante: ID único, clasificación, severidad, área,
comportamiento actual, evidencia concreta (path:línea, salida de comando, CI,
manifest o test), por qué es un problema, impacto, riesgo, cómo reproducirlo,
solución mínima, solución arquitectónica ideal, tests a añadir, criterios de
aceptación, dependencias, impacto en tokens e impacto en compatibilidad.

Puntuaciones 0–10 justificadas para: idea, producto, arquitectura, core,
plugin system, cada familia de plugins, cada plugin crítico analizado, client,
CLI, web, VS Code, testing, CI, security, observability, tokens native, tokens
adaptive, DX, maintainability, documentation, governance, release readiness y
potencial futuro. Más: nota global, nota global potencial tras P0/P1, top 5
fortalezas, top 5 riesgos, top 10 cambios por ROI, qué NO harías, roadmap
P0/P1/P2 y arquitectura objetivo.

FORMATO FINAL
Genera un fichero Markdown con TODA la auditoría (no un resumen), pensado para
que otro agente del repositorio lo convierta en propuestas y las ejecute punto
por punto. Debe incluir: índice, snapshot exacto (inicial y final), resumen
ejecutivo, puntuaciones, todos los hallazgos, bugs, riesgos, mejoras, ideas,
roadmap, top ROI, tests, criterios de aceptación, métricas, arquitectura
objetivo, "qué no hacer", una plantilla de propuesta reutilizable, un
Definition of Done global, y este mismo prompt para la siguiente auditoría.

Profundidad esperada: senior/staff/principal, con mentalidad de framework y
runtime, seguridad, sistemas agentic, MCP, TypeScript, monorepos, CI/CD,
producto y economía de tokens. No limites el análisis por brevedad.
```

---

*Fin del informe. Snapshot vinculante: `2cf17373f32b536e0c5154892ceddbb5d490ab37`.*

## notes

- Migrated from `docs/mcp-vertex/audits/2026-08-27-develop-independent-audit-claude-opus5.md` by `proposal_adopt`
  (f00116). The original file was left untouched — retire it once
  this proposal is the source of truth.
