---
id: a013
kind: audit
title: "Auditoría Agnóstica — Codex (GPT-5)"
status: done
date: 2026-06-18T08:39:00Z
track: archive
---

# 18-06-2026 - Codex (GPT-5) [auditoria agnostica 11 de 10]

Auditoria independiente del workspace `mcp-vertex`, hecha sobre el estado real del
repositorio el 18-06-2026. Solo se ha usado la familia de nombres/formato de los
informes previos como referencia de presentacion; las conclusiones salen de leer
codigo, configuracion, plugins, CI, docs, scripts y de ejecutar validaciones.

## Resumen ejecutivo

`mcp-vertex` es un proyecto muy por encima de la media para un framework MCP:
arquitectura limpia, contrato de plugins razonable, tests amplios, build
publicable, buena historia de tokens y un plugin `proposals` bastante avanzado.
No parece un experimento suelto; parece una plataforma.

Lo que impide llamarlo 11/10 hoy no es el core. El core esta muy bien. Lo que
lo baja es la capa de producto y endurecimiento: el lint actual falla por assets
web, algunos plugins read-only permiten rutas que pueden escapar del workspace,
varios tools complejos usan `outputSchema` demasiado abierto, el sitio publico
esta mas cerca de una ficha generada que de una documentacion de adopcion, y no
hay instrucciones/agentes/skills propias del repo al nivel que el proyecto
promete a otros agentes.

Mi nota global actual: **8.4/10**. Si se arregla el bloqueo de lint, rutas
seguras en plugins, schemas cerrados, docs publicas y un paquete minimo de
skills/agentes del propio repo, sube facilmente a **9.4/10**. Para un **11/10**
hace falta ademas observabilidad historica, hardening de release, fixtures e2e
de instalacion desde npm, y una experiencia de contribuidor impecable.

Valoracion de la seccion: ⭐⭐⭐⭐ Muy bien.

## Validacion ejecutada

- `bun run typecheck`: pasa dentro de `bun run validate`.
- `bun run lint`: falla. Biome encuentra 12 errores `lint/a11y/noSvgWithoutTitle`
  en `apps/web/public/flags/*.svg`, por titulos SVG vacios o ausentes.
- `bun run validate`: falla por el lint anterior, antes de llegar a tests.
- `bun run test`: pasa. Resultado: 75 archivos de test, 476 tests pasados, 10
  skipped.
- `bun run build`: pasa. Construye 10 paquetes publicables en `dist`.

Esto es importante: el codigo TypeScript y la suite estan sanos, pero el estado
CI local no es verde porque el lint esta roto por assets web. Un proyecto 11/10
no puede tener `validate` rojo en la rama de trabajo.

Valoracion de la seccion: ⭐⭐⭐½ Regular-Bien.

## Lo que esta perfecto o casi perfecto

### Arquitectura general

La separacion `packages/core` + `plugins/*` + `examples/*` + `apps/web` esta bien
planteada. El core no contiene logica de dominio, los plugins encapsulan
capacidades, y la CLI ensambla tools, prompts, resources, knowledge y metricas
sin acoplarse a un proyecto concreto.

Puntos muy buenos:

- `IMcpPluginContext` entrega `workspace`, `cacheDir`, `docsDir`,
  `pluginCacheDir`, `pluginDocsDir`, `namespacePrefix`, `options` y `args`, lo
  cual evita que los plugins tengan que adivinar rutas.
- `loadPlugins` deduplica specifiers, deduplica por nombre de plugin, no tira
  abajo todo el server si un plugin falla, y aplica timeout por import/register.
- `createMcpProject` registra tools de forma determinista e instrumenta metricas
  antes de exponer herramientas.
- `overview`, `status`, `metrics`, `knowledge`, `validation_matrix`, `scaffold`
  y bootstrap cubren muy bien el ciclo de orientacion de un agente.

Lo que falta para perfecto: un documento `docs/ARCHITECTURE.md` vivo, con un
diagrama de dependencias entre core, plugins, scripts, web y release. El codigo
lo merece; la documentacion de arquitectura aun no esta al mismo nivel.

Valoracion de la seccion: ⭐⭐⭐⭐½ Muy bien.

### Contrato de plugins

El contrato es uno de los puntos mas fuertes. `definePlugin`, `IMcpPlugin`,
`IMcpPluginRegistrations` y `IMcpPluginContext` son pequenos, entendibles y
suficientes. El namespace por plugin evita colisiones reales entre herramientas,
y `optionsSchema` permite rechazar configuracion incorrecta antes de registrar.

Lo que mejoraria:

- Haria `register(ctx)` siempre async en el tipo publico. Hoy acepta sync o
  async, que es comodo, pero una plataforma MCP moderna gana claridad si todo el
  registro es explicitamente asíncrono.
- Añadiria un contrato opcional `capabilities` o `riskLevel` por tool, para que
  `overview` pueda distinguir read-only, write, spawn, network, destructive.

Valoracion de la seccion: ⭐⭐⭐⭐⭐ Perfecta.

### Concurrencia y escrituras criticas

Aqui el proyecto esta muy fuerte. `withFileMutex` usa lock sidecar con
`O_EXCL`, token de ownership, heartbeat, stale detection y liberacion segura.
`writeFileAtomic` escribe temp file en el mismo directorio y renombra. Los
stores importantes no dependen solo de "write atomic"; protegen el ciclo
read-modify-write.

Esto esta especialmente bien en:

- `memory`: guarda con mutex, redaccion de secretos y cuota de notas.
- `proposals`: locks, cola persistente, registro de agentes, reparacion de
  estado, cierre de tareas y tests de caos.
- `quality`: mata process group completo en timeout/cancelacion.
- `notification`: reduce polling con watcher + fallback.

Matiz: en `withFileMutex`, si se supera `timeoutMs`, el codigo roba el lock para
evitar deadlock. Esta bien como ultima red, pero en un swarm grande puede ser
mejor devolver un error de contencion antes de robar si el holder sigue vivo.
Para 11/10, añadiria modo configurable: `steal | fail | waitForNotification`.

Valoracion de la seccion: ⭐⭐⭐⭐½ Muy bien.

### Eficiencia de tokens

El diseño esta claramente pensado para agentes y modelos:

- `overview` da mapa inicial en una llamada.
- `knowledge` se expone como recurso/tool y no obliga a cargar docs enteras.
- `docs_list` lista titulos antes de leer contenido.
- `search` devuelve lineas capadas.
- `memory_list` lista indice barato y `memory_recall` recupera solo notas
  relevantes.
- `auto_work` devuelve un plan compacto, no una explicacion larga.
- Hay test e2e de token budget y output schemas.

Esto probablemente reduce tokens en escenarios reales frente a un agente que
solo usa filesystem + grep + lectura manual. El proyecto empuja al modelo a
orientarse primero, leer poco, actuar por slices y validar.

Lo que falta para 11/10: metricas persistentes de uso por sesion y release. El
registry actual mide en proceso, pero no deja una historia facil de comparar:
"version X devolvia N bytes/tokens, version Y devolvia N+30%". Guardaria snapshots
en `.cache/mcp-vertex/metrics/*.json` y añadiria un gate de regresion.

Valoracion de la seccion: ⭐⭐⭐⭐½ Muy bien.

## Lo que esta mal o regular

### Bloqueo real de lint

`bun run validate` no esta verde. El motivo no es TypeScript ni tests: falla
`biome ci` por 12 SVG de banderas en `apps/web/public/flags/*.svg` sin titulo
accesible. Ademas `biome.json` incluye todo salvo `dist`, `node_modules`,
`coverage` y `*.astro`, asi que esos assets entran en el lint.

Esto es pequeno tecnicamente, pero grande como señal: CI/release no deberia
estar bloqueado por assets generados o copiados. Solucionaria con una de estas:

- añadir `<title>` correcto a cada SVG;
- marcar los SVG decorativos con atributos/ignores adecuados;
- mover flags a un pipeline de assets con validacion propia.

Valoracion de la seccion: ⭐⭐⭐ Regular.

### Seguridad de rutas en plugins read-only

El core resuelve rutas de workspace correctamente, pero algunos plugins aceptan
inputs de ruta y usan `join(root, userInput)` sin comprobar que el resultado
sigue dentro del workspace.

Casos concretos:

- `plugins/search/src/lib/engine.ts`: `roots` entra en `join(workspaceRootAbs,
  root)` y despues se camina el directorio. Un `roots: [".."]` puede catalogar
  fuera del workspace.
- `plugins/docs/src/lib/engine.ts`: `docs_read` si comprueba `within`, pero
  `docs_list` no aplica esa misma proteccion a `roots`.
- `plugins/deps/src/lib/engine.ts`: `manifestRel` se une con `join(rootAbs,
  manifestRel)` y podria leer manifiestos fuera con `../`.

Aunque son tools read-only, en MCP esto importa: un agente menos confiable podria
leer cosas que el host no pretendia exponer. Para 11/10, crearia un helper unico
en core: `resolveWorkspaceContained(root, rel): { ok, abs, reason }`, y lo usaria
en search/docs/deps/git path scopes/proposals path inputs. Tambien añadiria tests
con `../`, rutas absolutas y symlinks.

Valoracion de la seccion: ⭐⭐⭐ Regular.

### Schemas abiertos y drift de contratos

Muchos tools tienen `outputSchema` fuerte, pero los mas complejos de `proposals`
y algunos core/bootstrap usan `z.object({}).catchall(z.unknown())`. Es una buena
muleta para evolucionar, pero reduce el valor del contrato para clientes
tipados, UI generada, documentacion automatica y agentes que quieren validar
resultados sin leer texto.

Tambien `rules` no aparece con el mismo nivel de `outputSchema` que otros
plugins. Si el proyecto presume de "tool outputs generados", todos los plugins
deberian seguir la misma disciplina.

Para 11/10:

- cerrar schemas de todos los resultados estables;
- separar `v1` cerrado de `debug` abierto;
- hacer que `types:generate` falle si un tool publico no declara `outputSchema`;
- publicar tabla generada de tool inputs/outputs en el sitio.

Valoracion de la seccion: ⭐⭐⭐½ Regular-Bien.

### Sitio web y documentacion publica

Hay una app Astro con generacion de capabilities y varios locales, lo cual es
buena base. Pero como producto, aun no transmite "esto es instalable, confiable,
observable y facil de adoptar". Falta profundidad practica:

- guia "primeros 5 minutos";
- pagina por plugin con tools, riesgos, ejemplos y opciones;
- tabla de permisos/riesgo por tool;
- pagina de arquitectura;
- troubleshooting de MCP clients;
- changelog navegable;
- pagina "contribuir un plugin";
- demos con capturas reales del flujo `overview -> auto_work -> validate`.

La doc interna existe y el README esta razonablemente bien, pero un proyecto
11/10 no dependeria de que el usuario lea el repo a mano.

Valoracion de la seccion: ⭐⭐⭐½ Regular-Bien.

### Falta de instrucciones, skills y agentes propios

Para un proyecto que construye infraestructura para agentes, sorprende que el
workspace solo tenga `.claude/settings.local.json` y no tenga `AGENTS.md`,
`CLAUDE.md`, `.github/copilot-instructions.md`, `.github/agents/`, `skills/` o
un paquete equivalente de instrucciones versionadas.

No hace falta llenar el repo de ceremonia. Pero si quieres 11/10, añadiria:

- `AGENTS.md` con reglas del repo, comandos, ownership y politica de cambios;
- `.github/copilot-instructions.md` para GitHub/Copilot;
- `skills/mcp-vertex-plugin-authoring/SKILL.md`;
- `skills/mcp-vertex-release/SKILL.md`;
- `skills/mcp-vertex-audit/SKILL.md`;
- agentes: `plugin_reviewer`, `contract_guardian`, `release_captain`,
  `security_path_auditor`, `docs_cartographer`.

Esto no solo ayudaria a modelos: tambien documentaria las expectativas humanas.

Valoracion de la seccion: ⭐⭐⭐ Regular.

## Auditoria por plugin

### `proposals`

Es el plugin estrella. Tiene coordinacion real: locks de ficheros, queue
persistente, nombres de agentes, auto-work con freno anti-idle, state repair,
sync de propuestas, cierre de slices y tests de caos. Esta bien planteado para
evitar solapamientos y reducir bucles de agentes.

Lo que esta muy bien:

- coordina trabajo concurrente con estado persistente;
- devuelve planes compactos;
- tiene tests profundos, incluyendo caos y corrupcion;
- separa paths de cache/docs;
- evita `process.cwd()` en engines importantes.

Lo que falta:

- schemas cerrados para outputs complejos;
- politicas mas explicitas de lock contention;
- documentacion visual del ciclo multiagente;
- replay/simulador de swarm para reproducir una ronda.

Valoracion del plugin: ⭐⭐⭐⭐½ Muy bien.

### `memory`

Muy buen plugin. Redacta secretos antes de escribir, soporta TTL, cuota de
almacenamiento, recall rankeado, list paginado, mutex y corrupcion preservada.
Es de los mas cercanos a "como debe estar".

Lo que falta:

- export/import de memorias;
- namespaces o scopes por agente/proyecto;
- compactacion/resumen automatico cuando se acerca a cuota;
- test de concurrencia mas agresivo con muchas escrituras paralelas.

Valoracion del plugin: ⭐⭐⭐⭐½ Muy bien.

### `quality`

Buen plugin operativo. Resuelve scopes, ejecuta comandos, capta salida, limita
output, timeout, cancelacion y process group. La policy allow/deny es correcta
como trust boundary.

Lo que falta:

- parser de comandos mas fuerte para policy. Hoy `commandBinary` toma el primer
  token; comandos con `env FOO=bar bun test`, `npx`, wrappers o shell avanzado
  necesitan una politica mas semantica.
- riesgo explicito en `overview`: este plugin ejecuta comandos.
- cache de ultimo resultado por scope para no repetir gates innecesarios.

Valoracion del plugin: ⭐⭐⭐⭐ Bien.

### `rules`

Buena idea: detectar frameworks, materializar presets y exponer reglas para que
el agente no invente convenciones. Encaja muy bien con reducir retrabajo.

Lo que esta regular:

- usa I/O sync al materializar cache. No es dramatico en boot, pero rompe la
  disciplina async del resto.
- falta `outputSchema` visible en sus tools.
- puede crecer mucho si intenta ser autoridad universal de ESLint/TS sin una
  estrategia de versionado de presets.

Valoracion del plugin: ⭐⭐⭐½ Regular-Bien.

### `search`

Util y barato en tokens. Capa resultados, ignora dirs pesados, soporta regex y
globs, y es determinista.

Lo que esta mal:

- falta containment de rutas para `roots`;
- no usa `ripgrep` cuando esta disponible, por lo que en repos grandes sera
  mas lento que la herramienta estandar;
- no hay indice opcional ni cache para repos enormes.

Valoracion del plugin: ⭐⭐⭐ Regular.

### `docs`

Buen complemento de `search`: lista docs por titulo y lee bajo demanda. Tiene
proteccion de traversal en `docs_read`, lo cual esta bien.

Lo que esta mal/regular:

- `docs_list` no aplica la misma proteccion a `roots`;
- no pagina internamente antes de catalogar todo, aunque tiene cap;
- no extrae tabla de contenidos ni headings para lecturas parciales.

Valoracion del plugin: ⭐⭐⭐½ Regular-Bien.

### `deps`

Correcto como chequeo offline: lista dependencias, detecta lockfile, rangos
sueltos y duplicados entre secciones. Es simple y util.

Lo que falta:

- containment de `manifest`;
- soporte monorepo real: workspaces multiples, packages/plugins/apps;
- comparacion lockfile vs manifest;
- modo opcional online para advisories o freshness, separado del modo offline.

Valoracion del plugin: ⭐⭐⭐ Regular.

### `git`

Util para orientacion barata: status, changed, diff stat y log. Es read-only,
async y con timeout.

Lo que falta:

- soporte de renames/copies y porcelain v2;
- `diff --name-only`, `show`, `blame` parcial o lectura de patch capada;
- mejor manejo de paths fuera de repo;
- mas tests con repos reales temporales, no solo runner inyectado.

Valoracion del plugin: ⭐⭐⭐½ Regular-Bien.

### `notification`

Buena idea para bajar tokens: sustituir polling por notificaciones. Usa watcher
de directorio porque los atomic writes cambian inode, y tiene fallback por
intervalo.

Lo que falta:

- pruebas con renames/eventos duplicados en FS reales;
- backoff/debounce configurable;
- canal de evento mas estandarizado que logging message si el cliente MCP lo
  soporta;
- persistencia opcional de ultimos eventos para clientes que se reconectan.

Valoracion del plugin: ⭐⭐⭐⭐ Bien.

## Bucles, bloqueos y autonomia de agentes

No he encontrado un bucle infinito obvio en el diseño. Hay varias defensas:

- timeouts en carga de plugins;
- mutex con heartbeat/stale;
- `auto_work` corta tras 3 idles consecutivos;
- quality runner con timeout y cancelacion;
- notification para evitar polling;
- estado de proposals reparable.

Riesgos que quedan:

- contencion alta: el lock puede robar despues de timeout; conviene modo
  "fail-fast + wait for notification";
- comandos de quality/acceptance pueden tardar mucho aunque no bloqueen el event
  loop; la UX necesita mostrar `activeRunPids` o estado en `status`;
- un agente puede seguir llamando herramientas pese a `stop:true`; esto no se
  soluciona solo con tool design, requiere instruccion/skill/agente wrapper.

Valoracion de la seccion: ⭐⭐⭐⭐ Bien.

## Testing, CI y release

La suite es amplia: 75 archivos de test, 486 tests totales, 476 pasados y 10
skipped en mi ejecucion. Hay tests de core, plugins, e2e MCP, output schemas,
token budget, corrupcion, locks y caos. El build de 10 paquetes funciona.

CI esta bien planteado: lint separado, typecheck + coverage, pack smoke, Node
smoke del CLI compilado, release con version derivada y pack/publish.

Lo que baja nota:

- `validate` local falla por lint.
- No vi e2e de instalacion desde tarball/npm en un proyecto temporal con `npx`
  real.
- Release auto en push a main puede ser correcto, pero para 11/10 pediria
  ambiente protegido, provenance verificada, smoke post-publicacion y rollback
  documentado.
- `dist` esta presente en el repo; si es intencional, hace falta una politica
  clara de drift entre `src` y `dist`.

Valoracion de la seccion: ⭐⭐⭐½ Regular-Bien.

## Que añadiria para ser 11/10

Prioridad maxima:

1. Arreglar lint de SVG y dejar `bun run validate` verde.
2. Crear helper de rutas contenidas en core y aplicarlo a `search`, `docs`,
   `deps` y cualquier input path.
3. Cerrar `outputSchema` de todos los tools publicos o exigir excepcion
   documentada.
4. Añadir `AGENTS.md` + skill de authoring de plugins + skill de release.
5. Crear docs publicas por plugin/tool generadas desde schemas.

Prioridad alta:

6. `riskLevel`/`effects` por tool: read-only, writes-workspace, writes-cache,
   spawn, network, destructive.
7. Metricas persistentes de bytes/tokens/latencia por sesion.
8. E2E de paquete instalado desde tarball: proyecto limpio -> `npm pack` ->
   instalar -> `mcp-vertex --check --plugins=...`.
9. Modo de lock contention configurable.
10. `quality` con cache de resultados y policy de comandos mas robusta.

Prioridad media:

11. Sitio web con "primeros 5 minutos", arquitectura, ejemplos y troubleshooting.
12. Monorepo-aware `deps`.
13. `search` usando `rg` si existe, fallback TS si no.
14. Export/import de `memory`.
15. Simulador/replay de swarm para `proposals`.

Valoracion de la seccion: ⭐⭐⭐⭐ Bien.

## Tabla de calificaciones

| Dimensión | Nota |
|---|---|
| Arquitectura general | ⭐⭐⭐⭐½ Muy bien |
| Contrato de plugins | ⭐⭐⭐⭐⭐ Perfecta |
| Seguridad concurrencia / I/O | ⭐⭐⭐⭐ Muy bien |
| Seguridad de rutas / sandbox de workspace | ⭐⭐⭐ Regular |
| Eficiencia de tokens (LLM) | ⭐⭐⭐⭐½ Muy bien |
| Diseño libre de bucles/bloqueos | ⭐⭐⭐⭐ Bien |
| TypeScript / tipado | ⭐⭐⭐⭐⭐ Perfecta |
| Testing | ⭐⭐⭐⭐ Bien |
| CI / Release | ⭐⭐⭐½ Regular-Bien |
| Documentación (README/docs) | ⭐⭐⭐½ Regular-Bien |
| Sitio web / producto público | ⭐⭐⭐ Regular |
| Output schemas / contratos generados | ⭐⭐⭐½ Regular-Bien |
| Plugin proposals | ⭐⭐⭐⭐½ Muy bien |
| Plugin memory | ⭐⭐⭐⭐½ Muy bien |
| Plugin rules | ⭐⭐⭐½ Regular-Bien |
| Plugin git | ⭐⭐⭐½ Regular-Bien |
| Plugin search | ⭐⭐⭐ Regular |
| Plugin quality | ⭐⭐⭐⭐ Bien |
| Plugin docs | ⭐⭐⭐½ Regular-Bien |
| Plugin deps | ⭐⭐⭐ Regular |
| Plugin notification | ⭐⭐⭐⭐ Bien |
| Scaffold / Blueprint | ⭐⭐⭐⭐ Bien |
| Skills / instrucciones / agentes propios | ⭐⭐½ Regular |
| Extensibilidad / futuro | ⭐⭐⭐⭐ Bien |

## Lo que añadiria y cuanto valor aporta

| Añadido | Valor que aporta |
|---|---|
| `validate` verde arreglando SVG/lint | ⭐⭐⭐⭐⭐ Muchisimo valor |
| Helper core para rutas contenidas + tests traversal | ⭐⭐⭐⭐⭐ Muchisimo valor |
| Schemas cerrados para todos los tools | ⭐⭐⭐⭐⭐ Muchisimo valor |
| Docs generadas por plugin/tool desde schemas | ⭐⭐⭐⭐½ Mucho valor |
| `AGENTS.md` + skills propias del repo | ⭐⭐⭐⭐½ Mucho valor |
| Tool risk/effects metadata | ⭐⭐⭐⭐½ Mucho valor |
| E2E de instalacion desde tarball/npm | ⭐⭐⭐⭐½ Mucho valor |
| Metricas persistentes de tokens/bytes/latencia | ⭐⭐⭐⭐ Mucho valor |
| `search` con `rg` opcional | ⭐⭐⭐½ Valor medio-alto |
| `deps` monorepo-aware y lockfile-aware | ⭐⭐⭐½ Valor medio-alto |
| Replay/simulador de swarm | ⭐⭐⭐½ Valor medio-alto |
| Export/import y compactacion de memory | ⭐⭐⭐ Valor medio |
| Sitio web con demos/capturas y troubleshooting | ⭐⭐⭐⭐ Mucho valor |

## Estado actual

Estado actual: ⭐⭐⭐⭐ **8.4/10 - Muy buen proyecto, aun no 11/10**.

Mi opinion directa: el nucleo esta muy bien diseñado y los mejores plugins
demuestran una comprension real de como trabajan agentes y modelos. Lo que esta
"fatal" ahora mismo es tener `validate` rojo, aunque sea por SVG. Lo que esta
"mal" de verdad es la falta de containment en rutas de algunos plugins. Lo
"regular" es la capa publica, schemas abiertos e instrucciones/agentes propios.
Lo que esta "bien/muy bien" es casi todo el esqueleto tecnico. Lo "perfecto" es
el contrato basico de plugins y el nivel de TypeScript.

Camino corto al 9.5: lint verde, rutas seguras, schemas cerrados, docs por tool,
skills/agentes del repo. Camino al 11: lo anterior mas observabilidad historica,
release endurecido, e2e de instalacion real, y una experiencia de adopcion que
no requiera entender el monorepo entero.
