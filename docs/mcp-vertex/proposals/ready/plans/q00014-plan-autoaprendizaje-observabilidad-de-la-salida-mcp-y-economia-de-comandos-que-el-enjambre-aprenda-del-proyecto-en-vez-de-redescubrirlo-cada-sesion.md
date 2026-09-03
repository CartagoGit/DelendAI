---
id: q00014
title: "Plan autoaprendizaje, observabilidad de la salida MCP y economía de comandos: que el enjambre aprenda del proyecto en vez de redescubrirlo cada sesión"
kind: plan
status: ready
type: proposal
track: quality
date: 2026-09-03
---

# q00014 — Autoaprendizaje, observabilidad de la salida y economía de comandos

## Goal

Cerrar el hueco entre *lo que el sistema ya sabe* y *lo que cada agente
tiene que volver a averiguar por su cuenta en cada sesión*.

Hoy MCP Vertex mide muchísimo (usage-tracking, métricas de confusión,
token budgets, storm detector, validate journal) y no **aprende** nada:
ningún agente arranca sabiendo qué comandos funcionan en esta máquina,
qué tests suelen romperse juntos, qué herramientas se le atragantan al
modelo en este repo, ni qué errores ya se han visto y diagnosticado.

Cuatro capacidades, en orden de dependencia:

1. **Perfil de sistema** — saber en qué máquina estamos para elegir el
   comando más barato, en vez de que cada agente lo descubra a base de
   fallos.
2. **Diario de fallos** — un resultado de test o de validate se lee una
   vez y se consulta después; no se vuelve a lanzar la suite para
   averiguar qué falló.
3. **Lectura de la salida del MCP** — los errores que hoy sólo existen
   en el log de la consola del usuario se convierten en diagnóstico y,
   cuando procede, en issue.
4. **Autoaprendizaje** — un plugin que acumula lo anterior por proyecto
   y lo devuelve como recomendaciones concretas: qué activar, qué
   comando usar, qué suele fallar aquí.

## why

Tres observaciones de esta misma sesión, todas medidas, no supuestas:

- Un agente relanzó `bun run test` (≈6 min, con lock de cómputo
  compartido) sólo para volver a ver un fallo que la primera ejecución
  ya había impreso. La información existía y se tiró.
- La auditoría externa de 2026-09-02 encontró que `develop` avanzó 28
  commits durante la propia revisión, y que uno de los defectos
  señalados ya lo había arreglado otro agente: el enjambre trabaja
  rápido pero **sin memoria compartida** entre sesiones.
- Los cinco bugs de infraestructura más caros de esta ronda (bucle de
  push de 12h, stdout corrompiendo JSON-RPC, `.mutex` en el pathspec,
  fixture reescribiendo `~/.gitconfig`, política no-stash desconectada)
  se encontraron **leyendo el log de la consola del usuario a mano**.
  Ese log es la mejor fuente de defectos reales que tiene el proyecto y
  nada lo lee automáticamente.

El argumento económico: cada una de estas capacidades reduce turnos y
tokens de forma medible. No añaden inteligencia al modelo — le quitan
trabajo redundante.

## non-goals

- **NO** es telemetría hacia fuera. Todo lo que aprende se queda en
  `.cache/mcp-vertex/results/` del proyecto. Lo único que sale del
  equipo es lo que `error-reporting` ya envía, con su validador de
  privacidad intacto.
- **NO** sustituye a `usage-tracking`, `observability` ni
  `auto-plugin-selector`. Los consume.
- **NO** introduce ML ni embeddings. Es estadística sobre eventos
  propios: frecuencias, correlaciones y recencia.
- **NO** cambia el modelo operativo de `q00015` (shared develop,
  eventual settlement). Se apoya en él.

## Slices

- global_gate: lint, types, test

### S1 — Perfil de sistema: elegir el comando más barato para esta máquina

- **Status**: done — 5/5 ficheros en `develop`, incluidos los dos specs
- **Files**:
  - `packages/core/src/lib/platform/system-profile.ts` — detecta y cachea: SO y si es WSL, gestor de paquetes disponible (`bun`/`node`+`fnm`/`npm`), núcleos y memoria, si hay `rg`/`fd`/`jq`, locale utilizable, y si el FS es un montaje cruzado Windows↔Linux (que cambia radicalmente el coste de E/S).
  - `packages/core/src/lib/platform/command-preference.ts` — dado un propósito (`search-text`, `list-files`, `run-tests`, `typecheck`), devuelve el comando preferido para ESTE perfil y por qué. Pura, sin efectos.
  - `packages/core/src/lib/contracts/interfaces/system-profile.interface.ts` — `ISystemProfile`, `ICommandPreference`.
  - `packages/core/tests/src/lib/platform/system-profile.spec.ts` — perfiles sintéticos, sin tocar la máquina real.
  - `packages/core/tests/src/lib/platform/command-preference.spec.ts` — que un perfil sin `rg` nunca recomiende `rg`.
- **Gate**: lint, types, test

### S2 — Diario de fallos de test legible sin relanzar la suite

- **Status**: done — el diario vive en `tools/scripts/test/`, no en `packages/test-kit/` como decía el plan; `bun run test:failures` funciona
- **Files**:
  - `packages/test-kit/src/lib/reporters/failure-journal.reporter.ts` — reporter de vitest que escribe JSONL a `.cache/mcp-vertex/results/logs/test-runs.jsonl`: fichero, nombre, aserción, diff esperado/recibido, primer frame en código propio, duración, id de ejecución. Nunca lanza; un fallo al escribir no puede tumbar la suite.
  - `packages/test-kit/src/lib/reporters/failure-journal.contract.ts` — `ITestFailureRecord`, `ITestRunRecord`.
  - `tools/scripts/test/read-test-failures.script.ts` — imprime los fallos de la ÚLTIMA ejecución, agrupados por fichero, sin banner y sin relanzar nada. Avisa explícitamente si el diario está obsoleto respecto al árbol de trabajo.
  - `packages/test-kit/tests/src/lib/reporters/failure-journal.spec.ts`
- **Gate**: lint, types, test

### S3 — Lector de la salida del servidor MCP: del log al diagnóstico

- **Status**: in-progress — parser, diagnóstico y herramienta existen Y ESTÁN REGISTRADOS (la herramienta era código muerto hasta 2026-09-03); falta el spec con fixtures de log reales anonimizados
- **Files**:
  - `plugins/error-reporting/src/lib/intake/server-log-reader.ts` — parsea el log de stderr del servidor (el que el host escribe: VS Code, Claude Code, Codex) y extrae eventos estructurados: refusals repetidos, `Failed to parse message`, tormentas de reintentos, plugins que no cargaron, fallos de push.
  - `plugins/error-reporting/src/lib/intake/log-diagnosis.ts` — convierte esos eventos en un diagnóstico con causa probable y siguiente acción. Reutiliza `storm-detector` de `commit-policy` en vez de duplicar la detección de bucles.
  - `plugins/error-reporting/src/lib/tools/diagnose-log.tool.ts` — herramienta `error_reporting_diagnose_log`: lee, diagnostica, y SÓLO con confirmación abre issue. El validador de privacidad existente se aplica sin excepción.
  - `plugins/error-reporting/src/lib/contracts/interfaces/log-intake.interface.ts`
  - `plugins/error-reporting/tests/src/lib/intake/server-log-reader.spec.ts` — fixtures con los logs reales de 2026-09-02 (anonimizados) que contenían los cinco bugs.
- **Gate**: lint, types, test

### S4 — Plugin `self-learning`: superficie y almacén

- **Status**: pending — sin empezar; `plugins/self-learning/` no existe
- **Files**:
  - `plugins/self-learning/package.json`
  - `plugins/self-learning/src/index.ts` — registro del plugin, `cacheNamespace: 'self-learning'`, desactivado por defecto (opt-in explícito).
  - `plugins/self-learning/src/lib/store/observation-store.ts` — almacén append-only por proyecto en `.cache/mcp-vertex/results/self-learning/`. Escritura atómica, tamaño acotado, compactación por recencia.
  - `plugins/self-learning/src/lib/contracts/interfaces/observation.interface.ts` — `IObservation` con un `kind` cerrado: `command-outcome`, `test-failure`, `tool-confusion`, `refusal`, `slice-outcome`.
  - `plugins/self-learning/src/lib/collectors/index.ts` — se suscribe a lo que YA existe (usage-tracking, el diario de S2, el storm detector, los refusals del engine). No instrumenta nada nuevo.
  - `plugins/self-learning/tests/src/lib/store/observation-store.spec.ts`
- **Gate**: lint, types, test

### S5 — Plugin `self-learning`: lecciones y recomendaciones

- **Status**: pending — sin empezar; depende de S4
- **Files**:
  - `plugins/self-learning/src/lib/lessons/derive-lessons.ts` — de observaciones a lecciones con evidencia y confianza: "en este proyecto `bun run lint:web` falla tras tocar `packages/core` sin reconstruir dist (visto 6 veces)". Cada lección cita las observaciones que la sostienen y caduca si dejan de reproducirse.
  - `plugins/self-learning/src/lib/lessons/confidence.ts` — soporte, recencia y contraejemplos. Una lección con contraejemplos recientes se degrada sola.
  - `plugins/self-learning/src/lib/tools/lessons-tool.ts` — `self_learning_lessons` (qué sabemos de este proyecto) y `self_learning_advice` (dado un objetivo, qué activar y qué comando usar). Salida compacta por defecto.
  - `plugins/self-learning/tests/src/lib/lessons/derive-lessons.spec.ts` — incluye el caso negativo: una correlación con soporte bajo NO debe convertirse en lección.
- **Gate**: lint, types, test

### S6 — Compactación automática de conversación con criterio de pérdida

- **Status**: in-progress — `preserve-rules.ts` existe y está integrado; faltan `auto-compaction-policy.ts` y hacer la preservación VINCULANTE en compactación automática (hoy es advisory y persiste un resumen que sabe incompleto)
- **Files**:
  - `plugins/memory/src/lib/compaction/auto-compaction-policy.ts` — decide CUÁNDO compactar (presupuesto consumido, antigüedad, saturación de un tema) en vez de que lo pida el agente. Se apoya en `memory_compaction_check`, que ya existe.
  - `plugins/memory/src/lib/compaction/preserve-rules.ts` — qué NO puede perderse nunca en un resumen: decisiones del usuario, restricciones declaradas, causas raíz ya diagnosticadas, identificadores (SHA, ids de propuesta, rutas). Es la parte que hace la compactación segura, y se prueba con casos que antes se perdían.
  - `plugins/memory/tests/src/lib/compaction/preserve-rules.spec.ts` — un resumen que suelta una restricción del usuario debe fallar el test.
- **Gate**: lint, types, test

### S7 — Higiene: que los defectos pequeños no puedan reaparecer

- **Status**: done — ambos lints existen y `noUnusedImports` es `error`
- **Files**:
  - `biome.json` — `noUnusedImports` pasa de warning a error. Un import muerto tras un refactor debe romper la build, no quedarse en un aviso que nadie lee.
  - `tools/scripts/lint/no-silent-gates.script.ts` — un gate que sale con código distinto de cero sin escribir NADA es un fallo del gate. Comprueba que cada script de `validate:run` produce salida en su camino de error.
  - `tools/scripts/lint/no-duplicate-implementation.script.ts` — detecta el patrón que causó el P0 de `commit-policy`: dos definiciones del mismo nombre exportado en el mismo paquete, una de ellas sombreando a la otra. Es exactamente la clase de defecto que ningún test encuentra porque cada copia tiene los suyos.
  - `tools/scripts/lint/tests/no-duplicate-implementation.spec.ts`
- **Gate**: lint, types, test

## acceptance

1. `system-profile` identifica correctamente esta máquina (WSL2, bun,
   fnm, locale no generado) y `command-preference` no recomienda ni una
   sola herramienta ausente.
2. Tras una ejecución de tests con fallos, un agente diagnostica cada
   fallo leyendo el diario, **sin volver a lanzar la suite**. Verificado
   cronometrando ambos caminos.
3. `error_reporting_diagnose_log` sobre el log real de 2026-09-02
   identifica al menos el bucle de push, la corrupción de stdout y el
   fallo de pathspec del `.mutex`, sin que ningún dato del proyecto
   salga en el DTO.
4. Con `self-learning` activo durante una ronda completa, produce
   lecciones con evidencia citada, y ninguna lección sin soporte
   suficiente.
5. La compactación automática conserva el 100% de las restricciones
   declaradas por el usuario en un corpus de conversación de prueba.
6. Reintroducir un import muerto, un gate silencioso o una
   implementación duplicada rompe `validate`. Probado reintroduciendo
   cada uno de los tres.

## risks and mitigations

- **R1**: el autoaprendizaje aprende de un periodo malo y recomienda
  algo peor. Mitigación: toda lección lleva evidencia y caduca; el
  consumidor puede ignorarla; el plugin es opt-in.
- **R2**: el almacén de observaciones crece sin control en un repo con
  enjambre activo. Mitigación: cota de tamaño y compactación por
  recencia desde S4, no después.
- **R3**: `no-duplicate-implementation` produce falsos positivos con
  sobrecargas legítimas y re-exports. Mitigación: empezar acotado a
  definiciones de valor en el mismo paquete, con lista de excepciones
  explícita y justificada.
- **R4**: el lector de logs se acopla al formato de un host concreto.
  Mitigación: parser tolerante que ignora lo que no reconoce, con
  fixtures de más de un host.

### Out of scope

- Enviar observaciones o lecciones fuera del equipo.
- Sustituir `auto-plugin-selector` por el recomendador de S5; S5 le
  aporta señal histórica, no lo reemplaza.
- Reescribir el resumidor de conversación; S6 aporta la política de
  cuándo compactar y el contrato de qué no perder.

## notes

### Estado real frente a este documento

Verificado fichero a fichero contra `develop` el 2026-09-03. Las siete
slices decían `pending` mientras cinco estaban implementadas total o
parcialmente, lo que en un enjambre no es un detalle de forma: otro
agente podía reclamar S1, reimplementar el perfil de sistema, y quemar
una sesión reescribiendo código que ya existía. Una auditoría externa lo
señaló como riesgo de gobernanza, no de código, y tenía razón.

Los `Status` de abajo son ahora observaciones sobre el árbol, no
intenciones. Dos anotan además una divergencia real entre lo planificado
y lo construido (S2 vive en `tools/scripts/`, no en `packages/test-kit/`),
que se deja escrita en lugar de corregirla en silencio.
