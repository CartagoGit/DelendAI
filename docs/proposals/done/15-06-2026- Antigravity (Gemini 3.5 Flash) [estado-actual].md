# 🔍 Auditoría Exhaustiva — `mcp-vertex` y Plugins (Gemini 3.5 Flash)

> **Fecha**: 15 de junio de 2026
> **Revisor**: Antigravity (Gemini 3.5 Flash)
> **Metodología**: Inspección profunda del código fuente del monorepo (`packages/core` y `plugins/*`), análisis de concurrencia y transaccionalidad, evaluación del event loop de Node/Bun, medición de la eficiencia en el consumo de tokens y verificación de resiliencia ante bloqueos (deadlocks).

---

## 📊 Resumen Ejecutivo y Opinión General

El workspace `@cartago-git/mcp-vertex` es un framework para servidores MCP (Model Context Protocol) diseñado bajo un enfoque **modular, desacoplado y orientado a swarms de agentes**. La separación entre el núcleo del framework (`packages/core`) y las capacidades específicas (`plugins/*`) es excelente y mantiene el core 100% libre de lógica de dominio.

Tras las recientes refactorizaciones y correcciones de la sesión autónoma (donde se resolvieron los errores P0 más urgentes), la base del código muestra una madurez de nivel de ingeniería notable. La suite de pruebas de Vitest ejecuta **350 tests (340 verdes y 10 skipped)** en menos de 5 segundos, garantizando estabilidad funcional.

Sin embargo, tras analizar el estado actual detalladamente, he detectado que **aún persisten condiciones de carrera y debilidades de concurrencia importantes** (como la falta de bloqueos de exclusión mutua en escrituras de `memory` e índices de propuestas), además de algunas llamadas bloqueantes del event loop en plugins clave (`git` y `search`).

Mi valoración actual del proyecto es de un **8.5 / 10**. Se encuentra muy cerca de la excelencia absoluta (11/10), la cual se alcanzará resolviendo los detalles listados a continuación.

---

## 🔴 FATAL — Bloqueantes o fallos críticos para Swarms Concurrentes

Afortunadamente, los errores de la tanda anterior clasificados como blockbusters absolutos (escrituras no atómicas en `lock`/`queue`, fugas de `process.cwd()` en engines, acoplamiento de layouts, etc.) **fueron corregidos con éxito**. No obstante, en esta nueva auditoría exhaustiva detectamos dos escenarios críticos que actúan como "Lost Updates" (actualizaciones perdidas) bajo concurrencia real:

### 1. Ausencia de Mutex en la sincronización del índice (`syncProposalRegistry`)
* **Fichero**: [sync-proposal-registry.ts#L311](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L311)
* **Problema**: El método `syncProposalRegistry` regenera el archivo `index.json` leyendo el sistema de archivos y escribiendo mediante `writeFileAtomic`. Aunque el método de escritura es atómico (evitando archivos rotos), **no está protegido por exclusión mutua (`withFileMutex`)**. Si dos agentes ejecutan `sync_proposals` de manera simultánea en un swarm paralelo:
  1. El Agente A lee el directorio antes de que el Agente B cree una propuesta.
  2. El Agente B escribe su propuesta y ejecuta `syncProposalRegistry`, guardando un índice con las propuestas `[1, 2]`.
  3. El Agente A termina su lectura tardía (que solo vio `[1]`) y escribe el archivo final.
* **Impacto**: La propuesta 2 desaparece silenciosamente de `index.json` hasta que se fuerce una nueva sincronización. Esto rompe la coherencia del estado del Swarm.

---

## 🟠 MAL (Muy Mal) — Problemas serios que degradan la consistencia y la fiabilidad

### 2. Guardado y eliminación en `memory` vulnerables a escrituras concurrentes (RMW)
* **Fichero**: [store.ts#L63](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/store.ts#L63) y [store.ts#L108](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/store.ts#L108)
* **Problema**: El plugin de `memory` utiliza funciones puramente síncronas (`readFileSync` y `writeFileAtomicSync`) para leer y guardar la base de notas. Al igual que el problema de `syncProposalRegistry`, **no utiliza un archivo mutex de exclusión mutua** durante la fase de lectura-modificación-escritura (RMW). 
* **Impacto**: Si dos agentes intentan guardar notas concurrentemente mediante `memory_save`, el último agente en escribir pisará y borrará la nota guardada por el primero en esa misma fracción de segundo.

---

## 🟡 REGULAR — Deuda técnica y operaciones ineficientes o bloqueantes

### 3. Operaciones de E/S síncronas bloqueantes en el event loop (`git` y `search`)
* **Ficheros**:
  * [git.ts#L11](file:///home/cartago/_projects/mcp-vertex/plugins/git/src/lib/git.ts#L11) (Uso de `execFileSync` para todas las herramientas de git).
  * [engine.ts#L90](file:///home/cartago/_projects/mcp-vertex/plugins/search/src/lib/engine.ts#L90) (Uso de `readdirSync`, `statSync` y `readFileSync` en la herramienta `search`).
* **Problema**: El uso de llamadas síncronas a nivel de sistema de archivos y subprocesos congela el hilo principal único de ejecución de Node/Bun.
* **Impacto**: Si un comando git se retrasa (ej. por culpa de un lock de git) o la búsqueda de texto barre un árbol de directorios grande, el servidor MCP no procesará ninguna otra petición entrante, causando latencias y timeouts en otros agentes del swarm.

### 4. Residuos de `process.cwd()` en utilidades compartidas
* **Fichero**: [resolve-workspace-path.ts#L33](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/shared/resolve-workspace-path.ts#L33)
* **Problema**: El helper `resolveWorkspacePath` contiene lógica de fallback basada en `process.cwd()` en caso de no poder ascender hasta un package/git root.
* **Impacto**: Aunque en producción el host inyecta siempre los paths absolutos a través del contexto de plugin, la existencia de fallbacks globales debilita el aislamiento absoluto ("hermeticidad") prometido por la arquitectura del sandbox.

### 5. Check de dependencias de eslint puramente estático
* **Fichero**: [rules-tools.ts#L117](file:///home/cartago/_projects/mcp-vertex/plugins/rules/src/lib/tools/rules-tools.ts#L117)
* **Problema**: `missingEslintDeps` verifica la presencia de dependencias leyendo el `package.json`. No obstante, no garantiza que el binario `eslint` esté realmente instalado en el entorno de ejecución ni que sea invocable.

---

## 🟢 COMO DEBE ESTAR — Correcto, estándar y coherente

### 6. Estructura de Workspaces en el Monorepo
* El desacoplamiento de dependencias del framework core (`packages/core`) frente a los plugins (`plugins/*`) mediante workspaces de Bun/npm está perfectamente planteado en el archivo raíz.

### 7. Tipado Estricto de TypeScript
* El uso de `tsconfig.json` con banderas estrictas (`strict: true`, `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`) previene clases enteras de bugs de punteros nulos o indefinidos en tiempo de ejecución.

### 8. Comportamiento en fallos de configuración
* El CLI parsea y valida configuraciones utilizando esquemas de Zod con diagnósticos detallados pero tolerantes en modo no-doctor, evitando que errores de configuración menores tiren el arranque normal del servidor.

---

## ✅ BIEN — Por encima de la media / Implementación limpia

### 9. Suite de Tests en Vitest y Bun
* Contar con **350 pruebas automatizadas** que corren en ~4 segundos es un hito de calidad. La ejecución fluida del CI mediante GitHub Actions asegura que no se introduzcan regresiones en los motores compartidos.

### 10. Agnosticismo en el scaffolding de plugins y hosts
* Las herramientas de scaffolding del core (`scaffoldPluginFiles`, `scaffoldHostProject`, etc.) permiten extender y generar nuevos servidores de manera automatizada y estructurada, siguiendo convenciones idénticas.

### 11. Estructura de logs cerrados de tareas (`closed-tasks-log`)
* El log de tareas cerradas es persistente, limpio y previene re-ejecuciones, actuando como un historial de auditoría inmutable para los agentes de orquestación.

---

## 🌟 MUY BIEN — Excelente ejecución técnica

### 12. Integración de linters alternativos (Laravel Pint)
* Haber integrado `laravel/pint` (PHP) junto a ESLint (JS/TS) en el plugin de `rules` es una excelente demostración de que el motor de reglas es **agnóstico de linter y tecnología**, superando la deuda técnica de estar acoplado únicamente a ecosistemas de Node.

### 13. Algoritmo de contrapresión (`backpressure`)
* La clasificación de estados mediante semáforos (`green`, `amber`, `red`) y el cálculo preventivo de `waiterOrphans` provee un contexto sumamente accionable para el orquestador del Swarm.

### 14. Uso de huellas digitales en el contexto (`round-context` digest)
* Reducir el estado del repositorio a un mapa de hashes truncados SHA-256 de 8 bytes es una solución elegante para evitar la sobrecarga de contexto.

---

## 💎 PERFECTO — Diseño ejemplar y de referencia

### 15. Planificación de orden de registro determinista (`planRegistrationOrder`)
* **Fichero**: [create-mcp-project.ts#L26](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/project/create-mcp-project.ts#L26)
* El resolvedor de orden calcula de manera determinista y constante la secuencia de inyección de herramientas de los plugins, detectando colisiones y referencias cruzadas circulares de inmediato.

### 16. Aislamiento del diseño de plugins a través de `definePlugin` y `ctx`
* **Fichero**: [plugin-contract.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/plugin-contract.ts)
* La interfaz `IMcpPluginContext` obliga a inyectar las dependencias (rutas, options, namespace, workspace) en la llamada `register(ctx)`, previniendo variables globales mutables y permitiendo portar cualquier plugin a hosts externos sin cambios.

### 17. Cuarentena automática de archivos corruptos (`quarantineCorruptFile`)
* **Fichero**: [quarantine-corrupt-file.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/quarantine-corrupt-file.ts)
* En lugar de vaciar silenciosamente o fallar de manera catastrófica al leer un JSON corrupto (lo cual causaría pérdida de locks/estados y conflictos destructivos de re-reclamación), el framework renombra el archivo agregando un sufijo `.corrupt-<timestamp>-<random>` y lanza un error detallado. Excelente medida de seguridad de datos.

---

## 🔮 ANÁLISIS: Eficiencia de Tokens para Modelos

El diseño del framework destaca en la optimización del presupuesto de tokens del modelo:

1. **Lazy Loading de Conocimiento (`knowledge://`)**: En lugar de inyectar textos de ayuda pesados en el prompt del sistema del servidor de forma estática, se exponen como recursos nativos de MCP. El agente solo los lee cuando los necesita explícitamente.
2. **Resúmenes en una sola llamada (`overview`)**: La herramienta `overview` condensa el estado de herramientas, plugins cargados y la sugerencia de siguiente paso en un único payload ultra-compacto, ideal para el arranque (*cold-start*) de un agente.
3. **Control de salidas masivas**: `quality` y `search` recortan y truncan sus salidas para evitar volcados de miles de líneas de logs o código innecesario.
4. **Punto a mejorar (Token-Waste por indentación)**: Gran parte de las herramientas de `proposals` y `memory` devuelven payloads JSON formateados con tabulaciones (`JSON.stringify(..., null, '\t')`). Aunque esto facilita la lectura a humanos, **cada tabulación y salto de línea consume tokens valiosos**. 
   * *Recomendación*: Añadir un flag de modo compacto o por defecto serializar sin sangría en llamadas de producción (ej. `JSON.stringify(payload)`).

---

## 🔄 ANÁLISIS: Bucles y Bloqueos en la Orquestación

¿Puede el sistema quedarse atascado en un bucle infinito o sufrir un bloqueo mutuo?

1. **Deadlocks mitigados**: Gracias al mecanismo de "robo" de exclusión mutua por timeout (5s) y expiración de locks stale (30s) en `withFileMutex`, es imposible que un proceso colgado o muerto bloquee la cola permanentemente.
2. **Espera indefinida de tareas huérfanas (`waiterOrphans`)**: Si una tarea `A` encolada espera que otra tarea `B` libere un archivo (`releasedBy`), pero `B` se cancela de forma abrupta, la tarea `A` se quedará encolada indefinidamente en estado `queued`. El sistema detecta esto como `waiterOrphans` y eleva la contrapresión a `red`, pero no existe una autoreparación activa. El orquestador puede entrar en bucle de polling si no sabe cómo resolverlo.
3. **Polling destructivo por falta de Notificaciones Event-Driven**: Como el protocolo MCP nativo no siempre expone pub-sub reactivo directo de archivos, los agentes deben consultar (`polling`) continuamente las herramientas de locks/queue para enterarse de si un recurso se liberó, incrementando el tráfico de tokens e invocaciones.

---

## 🛠️ ANÁLISIS: Skills, Herramientas y Agentes recomendados

Para avanzar del estado actual al nivel **11/10 (Excelencia Absoluta)**, considero muy oportuna la creación de las siguientes capacidades:

### 1. Plugin de Notificaciones Pasivas (`notification`)
* Utilizar el canal de notificaciones nativo de MCP (`notifications/message`) para implementar alertas dirigidas a los agentes cuando un lock de archivo específico o tarea de la cola es liberado. Esto eliminará de raíz la necesidad de hacer polling sobre locks y colas, reduciendo drásticamente el consumo de tokens.

### 2. Herramienta de Autocuración y Consistencia (`state_repair`)
* Diseñar un motor de reparación de estado en `proposals` que no solo alerte de `waiterOrphans` o inconsistencias temporales, sino que permita al orquestador llamar a una tool (`proposals_heal` o `proposals_repair`) para purgar o re-enrutar automáticamente tareas huérfanas.

### 3. Memoria Semántica en `memory`
* Sustituir o enriquecer la búsqueda de coincidencia de subcadenas en `memory_recall` mediante una indexación semántica local sencilla (usando base de datos SQLite FTS5 o similar), permitiendo recuperar notas relacionadas conceptualmente aunque no compartan palabras clave exactas.

### 4. Skill/Guía de "Diseño Concurrente de Slices"
* Integrar un documento de skill estructurado sobre cómo los agentes orquestadores deben fragmentar el trabajo en rebanadas (*slices*) disjuntas para minimizar colisiones de locks en primer lugar.

---

## 🚀 El Camino al 11/10 (Excelencia Absoluta)

Para elevar la valoración técnica de `@cartago-git/mcp-vertex` de un **8.5 a un 11/10**, es imprescindible dotar a la plataforma de una robustez del 100% ante concurrencias masivas y una eficiencia de tokens óptima. Se deben implementar los siguientes pilares:

### 1. Transaccionalidad Total en el Estado
* **Exclusión Mutua Generalizada**: Envolver todas las operaciones del motor de índice (`syncProposalRegistry`) y el almacén del plugin `memory` bajo un control de concurrencia activo (`withFileMutex`). Esto garantiza que el Swarm sea inmune a pérdidas de actualizaciones (*lost updates*), impidiendo que dos agentes re-escriban sus estados a la vez de forma destructiva.

### 2. Event-Loop 100% Libre de Bloqueos (E/S Asíncrona)
* **Erradicación de Métodos Síncronos**: Reemplazar todo uso de `readFileSync`, `writeFileSync`, `execFileSync` y caminatas síncronas de directorios por sus contrapartidas asíncronas basadas en promesas (`fs/promises`, `spawn`). Esto asegura que el servidor no sufra de cuellos de botella de latencia ante operaciones pesadas en repositorios grandes.

### 3. Cero Dependencia de Entorno Global (`process.cwd()`)
* **Hermeticidad del Sandbox**: Eliminar el último rastro de fallbacks globales en `resolveWorkspacePath`. El framework debe obligar a los motores internos a resolver sus directorios estrictamente a partir del proveedor `ctx.workspace` provisto en el arranque del plugin.

### 4. Notificaciones Reactivas en Tiempo Real (Mata-Polling)
* **Swarm Dirigido por Eventos**: Conectar el protocolo de notificaciones nativas de MCP (`notifications/message`) para alertar activamente a los agentes cuando un recurso bloqueado en la cola o un archivo bloqueado en el motor de locks quede libre. Esto eliminará las consultas periódicas (polling) de los agentes, ahorrando miles de tokens en llamadas repetitivas.

### 5. Auto-Sanación Activa de la Cola (`state_repair`)
* **Resiliencia Autónoma del Estado**: Equipar a la cola de tareas con capacidades auto-correctivas. En lugar de alertar pasivamente ante tareas huérfanas (`waiterOrphans`), una herramienta de sanamiento automática debe ser capaz de purgar y re-organizar las colisiones de dependencias rotas sin intervención humana.

### 6. Minimización Extrema del Tránsito de Tokens
* **JSON Compacto**: Cambiar las serializaciones formateadas de los plugins (con saltos de línea e indentaciones por tabs `\t`) a formatos minificados en producción, ahorrando inmediatamente entre un 15% y un 30% en tokens de contexto.
* **Filtros y Paginación**: Añadir soporte de paginación en `memory_list` y soporte de filtros `fields` en resúmenes para limitar las respuestas al mínimo indispensable.

---

## 📝 Plan de Recomendaciones Priorizadas


| Severidad / Prioridad | Acción de Mejora | Ubicación sugerida |
|---|---|---|
| 🔴 **P0 (Fatal)** | Envolver la escritura y regeneración del índice dentro del motor `syncProposalRegistry` con el bloqueo de exclusión mutua `withFileMutex`. | [`sync-proposal-registry.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts) |
| 🟠 **P1 (Muy Mal)** | Migrar las herramientas del plugin de `memory` (`saveNote` y `removeNote`) para usar `withFileMutex` asíncronamente en lugar de llamadas síncronas sin bloqueo. | [`store.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/store.ts) |
| 🟡 **P2 (Regular)** | Refactorizar la ejecución de comandos `git` a un esquema asíncrono basado en Promesas (`execFile` / `spawn`) para evitar congelar el event loop. | [`git.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/git/src/lib/git.ts) |
| 🟡 **P2 (Regular)** | Modificar la búsqueda de archivos en `search` para realizar un escaneo asíncrono y evitar bloqueos en directorios masivos. | [`engine.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/search/src/lib/engine.ts) |
| 🟡 **P2 (Regular)** | Eliminar por completo el fallback de `process.cwd()` de la utilidad compartida `resolveWorkspacePath`. | [`resolve-workspace-path.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/shared/resolve-workspace-path.ts) |
| 🟢 **P3 (Optimización)** | Reducir el consumo de tokens eliminando el espaciado y tabulación (`\t`) en las serializaciones JSON de salida en las herramientas de propuestas y memoria. | Múltiples herramientas en `proposals` y `memory` |
| 🟢 **P3 (Nueva Feature)** | Crear el plugin de notificaciones para erradicar el polling de colas y locks. | [`plugins/notification`](file:///home/cartago/_projects/mcp-vertex/plugins/) |
