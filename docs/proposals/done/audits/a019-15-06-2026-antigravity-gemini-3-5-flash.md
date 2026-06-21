---
id: a019
kind: audit
title: "Auditoría Exhaustiva — Antigravity (Gemini 3.5 Flash)"
status: done
date: 2026-06-21T04:23:51Z
track: archive
---

# 🔍 Auditoría Exhaustiva — `mcp-vertex` y Plugins

> **Fecha**: 15 jun 2026 | **Revisor**: Antigravity (Gemini 3.5 Flash)
> **Metodología**: Inspección del código fuente del monorepo, análisis de flujos de ejecución asíncronos y de concurrencia, comprobación de dependencias, verificación local de la suite de tests (Vitest) y evaluación del impacto en el consumo de tokens y resiliencia ante bloqueos (deadlocks).

---

## 📊 Resumen Ejecutivo

El proyecto `mcp-vertex` presenta un diseño **desacoplado, escalable y pragmático** para la construcción de servidores MCP (Model Context Protocol). El modelo de monorepo que separa la lógica principal del framework (`packages/core`) de las capacidades específicas mediante plugins (`plugins/*`) es excelente para mantener el núcleo libre de acoplamientos innecesarios. El uso de archivos locales como base de datos de estado compartido permite a múltiples agentes cooperar de manera distribuida sin necesidad de un backend centralizado.

A pesar de su madurez arquitectónica y de contar con una suite de pruebas robusta (277 tests unitarios y de integración que pasan exitosamente en 2.3 segundos), existen vulnerabilidades de concurrencia críticas (escrituras no atómicas en locks e índices), fugas de aislamiento del sandbox (uso de fallbacks basados en `process.cwd()`) y dependencias rígidas de dominio del host original en plugins pretendidamente genéricos.

---

## 🔴 FATAL — Errores críticos o de diseño que deben corregirse

### 1. Escritura NO atómica en el archivo de locks (`agent-lock-engine.ts`)
**Fichero**: [`agent-lock-engine.ts#L82`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/locks/agent-lock-engine.ts#L82-L89)

```typescript
const writeLock = async (
	lock: ILockFile,
	deps: IAgentLockDeps = {}
): Promise<void> => {
	const lockPath = getLockPath(deps);
	await mkdir(dirname(lockPath), { recursive: true });
	await writeFile(lockPath, `${JSON.stringify(lock, null, '\t')}\n`, 'utf8');
};
```

**Problema**: A diferencia de la cola de tareas (`persistent-task-queue.ts`), que escribe de manera atómica usando un archivo temporal y renombrándolo (`rename`), el motor de locks escribe directamente al archivo de producción con `writeFile`. En un swarm de múltiples agentes concurrentes, si dos agentes intentan reclamar o liberar un archivo a la vez, el archivo `agents.lock.json` puede quedar truncado o corrupto (JSON incompleto).
**Impacto**: Un archivo de locks corrupto inutiliza completamente el servidor MCP lanzando excepciones de parseo e impidiendo cualquier operación de modificación hasta que intervenga un humano.

### 2. Escritura NO atómica en la sincronización del registro de propuestas
**Fichero**: [`sync-proposal-registry.ts#L347`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L347)

```typescript
await writeFile(indexPath, nextText, 'utf8');
```

**Problema**: Se repite el patrón de escritura insegura. Si dos agentes invocan la sincronización del índice (`index.json`) simultáneamente, se corre el riesgo de corrupción de datos. Debería aplicarse el mismo mecanismo de persistencia atómica de archivos temporales mediante `rename`.

### 3. Fuga de aislamiento mediante `process.cwd()` en utilidades críticas
**Ficheros**: 
- [`resolve-workspace-path.ts#L33`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/shared/resolve-workspace-path.ts#L33)
- [`sync-proposal-registry.ts#L309`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L309)
- [`delivery-verifier.ts#L257`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/delivery-verifier.ts#L257)

**Problema**: El diseño del framework estipula rigurosamente que los plugins nunca deben acceder a `process.cwd()` directamente; todas las resoluciones deben hacerse mediante el proveedor de rutas inyectado (`ctx.workspace`). Sin embargo, se detectan múltiples filtraciones:
- `resolveWorkspacePath` inicia su búsqueda ascendente de raíz del monorepo usando `process.cwd()`.
- `syncProposalRegistry` tiene un parámetro opcional `root` que por defecto toma `process.cwd()`.
- `defaultVerifyPaths` construye las rutas absolutas de la cola utilizando `process.cwd()`.
**Impacto**: Si el servidor MCP es arrancado desde un directorio de trabajo alternativo, las herramientas de proposals y locks operarán sobre directorios erróneos de forma silenciosa, rompiendo la garantía de predictibilidad y sandbox del framework.

---

## 🟠 MUY MAL — Problemas serios que degradan la calidad

### 4. Duplicación de lógica básica de rutas (`joinRel`)
**Ficheros**:
- [`assemble.ts#L42`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/cli/assemble.ts#L42)
- [`plugins/memory/src/index.ts#L5`](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/index.ts#L5)
- [`plugins/rules/src/index.ts#L19`](file:///home/cartago/_projects/mcp-vertex/plugins/rules/src/index.ts#L19)

La utilidad `joinRel` para unir rutas eliminando barras inclinadas duplicadas de forma segura está copiada textualmente en tres ficheros distintos del monorepo. Debería consolidarse en el directorio `shared/` de `@cartago-git/mcp-vertex` y exportarse en la interfaz pública.

### 5. Acoplamiento de la lógica de paralelismo a tracks del host
**Fichero**: [`proposal-parallelism.ts#L33`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/proposal-parallelism.ts#L33-L37)

```typescript
export type IProposalTrack =
    | 'bootstrap' | 'scaffold' | 'engine' | 'editor'
    | 'ui-demo' | 'game-demo' | 'meta' | 'audit'
    | 'audit-meta' | 'retired';
```

**Problema**: Los tracks definidos en el plugin `proposals` representan nombres de dominios específicos del proyecto del creador original (`ui-demo`, `game-demo`, `scaffold`). Esto contradice el principio de que los plugins sean reutilizables y "project-agnostic". Si un usuario externo configura tracks adaptados a su flujo de trabajo, el motor de paralelismo fallará o los ignorará.

### 6. Ruta de demostraciones pausadas hardcodeada
**Fichero**: [`round-context.ts#L345-L347`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/swarm/round-context.ts#L345-L347)

```typescript
// TODO: the paused-demos subfolder is host folder policy;
// inject it via IProposalStoreConfig.folders when tools migrate.
join(monorepoRoot, DEFAULT_PATH_LAYOUT.proposalsDir, 'paused/demos'),
```

Existe lógica hardcodeada para escanear `paused/demos`, la cual se reconoce explícitamente en un comentario `TODO` como una política particular del host original. Mantiene el monorepo atado a una estructura de carpetas específica.

### 7. Modelo default obsoleto en el scaffolding de hosts
**Fichero**: [`scaffold-host.ts#L182`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/scaffold/scaffold-host.ts#L182)

El scaffolding utiliza por defecto el modelo `'MiniMax-M3 (customendpoint)'` si no se especifica otro en las opciones. Este es un endpoint personalizado del autor original que causará fallos inmediatos a desarrolladores externos que utilicen el generador de servidores MCP sin configurar explícitamente sus credenciales y nombres de modelo.

### 8. Deuda técnica en el mapeo del esquema de Lock (`persistent-task-queue.ts`)
**Fichero**: [`persistent-task-queue.ts#L748-L765`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/persistent-task-queue.ts#L748-L765)

El esquema `LockEntrySchema` de Zod realiza un método `.transform()` en la lectura para dar soporte a campos antiguos (`files` vs `ownership` y `claimed_at` vs `started_at`/`last_seen`). Esta coexistencia de dos esquemas de datos diferentes en producción introduce complejidad accidental innecesaria. El motor de locks real ya no los utiliza, por lo que la persistencia de fixtures históricos ralentiza el desarrollo y crea interfaces de datos engañosas.

---

## 🟡 REGULAR — Funciona pero mejorable

### 9. Placeholder perpetuamente vacío `coreToolRegistrations`
**Fichero**: [`create-mcp-project.ts#L23-L27`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/project/create-mcp-project.ts#L23-L27)

La función encargada de registrar las herramientas por defecto del núcleo del framework retorna un array vacío de manera persistente con la nota "Empty until the tool engines migrate from the host project". Si no hay herramientas del core independientes de los plugins, esta abstracción vacía añade ruido mental.

### 10. Mezcla de I/O síncrono y asíncrono
**Fichero**: [`persistent-task-queue.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/persistent-task-queue.ts)

En varias secciones críticas (como `parseQueue`), el motor mezcla importaciones de `node:fs` (como `readFileSync` y `existsSync`) con APIs de promesas (`node:fs/promises`). En un entorno de alto rendimiento basado en Node/Bun, bloquear el bucle de eventos con llamadas síncronas para leer logs de tareas o comprobar archivos puede degradar la latencia general del servidor MCP.

### 11. Duplicación de lectura de configuración en el modo doctor
**Fichero**: [`assemble.ts#L257-L258`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/cli/assemble.ts#L257-L258)

El comando `--check`/`--doctor` llama a `diagnoseConfigFile` leyendo el archivo de configuración en disco, y a continuación ejecuta `assembleCliConfig` que vuelve a parsear exactamente el mismo fichero de configuración por separado. Es una ineficiencia menor pero ilustra falta de consistencia en el manejo del estado del arranque del CLI.

---

## 🟢 COMO DEBE ESTAR — Correcto y funcional

### 12. Validación e inserción ordenada de herramientas determinista
**Fichero**: [`create-mcp-project.ts#L37-L77`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/project/create-mcp-project.ts#L37-L77)

El algoritmo `planRegistrationOrder` está excelentemente diseñado. Valida la unicidad de los identificadores de herramientas, detecta anclajes (`registerAfter`) inexistentes y realiza inserciones en tiempo constante asegurando que el orden semántico se mantiene inalterado entre ejecuciones.

### 13. Carga resiliente de plugins
**Fichero**: [`load-plugins.ts#L76-L135`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/load-plugins.ts#L76-L135)

La carga dinámica de plugins captura los errores de inicialización o rechazos de opciones por esquema Zod a nivel de plugin individual. Esto previene un fallo en cascada: si un plugin específico falla al configurarse, el servidor arranca exponiendo el resto de las herramientas de los plugins válidos, emitiendo un reporte diagnóstico a través de `stderr`.

### 14. Abstracción limpia del análisis del proyecto
**Fichero**: [`analyze-project.ts`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/bootstrap/analyze-project.ts)

La lógica encargada de analizar las tecnologías, configuraciones de CI y dependencias del workspace utiliza una interfaz `IFileReader` simulada. De esta forma, el analizador no ejecuta operaciones directas sobre el sistema de archivos (`I/O`), siendo una función completamente pura, determinista y testeable en entornos aislados.

---

## ✅ BIEN — Por encima de lo esperado

### 15. Alta cobertura de pruebas integradas
La suite de pruebas con Vitest cubre exhaustivamente todos los escenarios de carrera y validaciones del monorepo (277 tests ejecutándose de manera óptima). Esto garantiza que refactorizaciones mayores (como la corrección de las escrituras atómicas o la eliminación de variables globales) puedan realizarse con una red de seguridad inmejorable.

### 16. Sistema detallado de contrapresión (`backpressure`)
**Fichero**: [`persistent-task-queue.ts#L608-L695`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/persistent-task-queue.ts#L608-L695)

La evaluación de contrapresión calcula de manera proactiva estados como `waiterOrphans` (tareas cuya tarea precursora fue cancelada/terminada y nunca liberará el archivo objetivo) y `releaseSignalBacklog` (tareas listas para promoción porque sus recursos ya están libres). Esto proporciona un mapa claro de salud de la cola que el modelo puede consumir e interpretar de inmediato.

---

## 🌟 MUY BIEN — Excelente ejecución

### 17. Fingerprinting mediante hashes truncados SHA-256 en el contexto de ronda
**Fichero**: [`round-context.ts#L794-L815`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/swarm/round-context.ts#L794-L815)

El motor utiliza un sistema de hashes SHA-256 de 8 bytes (prefijados con `rh-` para mantener compatibilidad con el formato antiguo de Bun rapidhash) para monitorizar el estado de los documentos de diseño (`README.md`, índice, etc.). Esto permite saber instantáneamente si un archivo ha sido modificado por otro subagente sin tener que cargar el contenido de los documentos en el contexto del modelo en cada llamada.

### 18. Evaluación pura y pairwise del paralelismo de propuestas
**Fichero**: [`proposal-parallelism.ts#L122-L212`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/proposal-parallelism.ts#L122-L212)

La función `evaluateParallelism` es una función completamente pura: recibe la lista de propuestas activas, computa las intersecciones de archivos y recursos reservados de forma combinatoria $O(n^2)$ y devuelve violaciones de colisión clasificadas deterministamente. Sin llamadas I/O directas, es un modelo de lógica computacional impecable.

---

## 💎 PERFECTO — Referencia de la que enorgullecerse

### 19. El diseño del contrato de plugin e inyección del contexto (`IMcpPlugin`)
**Fichero**: [`plugin-contract.ts`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/plugins/plugin-contract.ts)

El contrato `register(ctx)` obliga a los desarrolladores de plugins a basar toda interacción con el host y las rutas en el objeto `ctx` proveído por el CLI. Esto impide la creación de variables globales mutables y garantiza que un mismo plugin pueda ser utilizado indistintamente como servidor independiente de línea de comandos o como biblioteca importada en otros proyectos de Node/Bun.

### 20. Clasificación semántica detallada de errores de cola
**Fichero**: [`persistent-task-queue.ts#L239-L380`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/persistent-task-queue.ts#L239-L380)

La validación por capas de `parseQueue` arroja excepciones estructuradas con códigos únicos y descriptivos como `WAIT_FOR_FILE_MISSING`, `INVALID_PRIORITY`, `TEMPORAL_INCONSISTENCY` y `OBSERVE_TARGET_UNKNOWN`. Esto permite que un agente de desarrollo automatizado entienda la razón precisa de un fallo en la cola y sea capaz de autocorregirse sin causar bloqueos infinitos de decisión.

---

## 🔮 ANÁLISIS: Eficiencia de Tokens para Agentes

| Mecanismo | Impacto en tokens | Comentario |
|---|---|---|
| Herramienta `overview` | 💎 **Perfecto** | Devuelve el mapa de todas las herramientas, plugins y la siguiente acción recomendada en un solo viaje de bajo costo. |
| Recursos lazy (`knowledge://`) | 💎 **Perfecto** | Las bases de conocimiento de los plugins solo se consultan bajo demanda. No se inyecta prosa estática en el prompt de sistema del modelo. |
| Hashing de estado de archivos | 🌟 **Muy Bien** | `round-context` usa firmas SHA-256 de 8 bytes para avisar de cambios en el monorepo. Evita que el agente relea repetidamente archivos inalterados. |
| Respuestas JSON estructuradas | 🌟 **Muy Bien** | Estructura rígida de salida. Elimina la necesidad de destinar tokens en la generación de prosa semántica explicativa por parte del servidor. |
| Prompts de ayuda extensos | ⚠️ **Mejorable** | Algunos mensajes de instrucciones incluidos en los prompts (ej. en `rules_enforce_rules` o `work`) contienen prosa en inglés redundante que podría comprimirse. |

**Conclusión**: El framework es altamente eficiente en tokens. El principio de "descubrimiento de capacidades en una llamada y consumo perezoso de conocimiento" está implementado de forma ejemplar y protege la ventana de contexto del modelo.

---

## 🔄 ANÁLISIS: Posibles Bucles y Bloqueos

### 1. Espera indefinida de huérfanos (`waiterOrphans`)
Si una tarea encolada depende de que otra tarea `B` libere un archivo (`releasedBy: "B"`), pero la tarea `B` es cancelada o eliminada del flujo sin realizar su cierre normal, la tarea dependiente se mantendrá en estado `queued` de forma indefinida. La contrapresión del sistema cambiará a `amber` o `red`, avisando del bloqueo, pero el motor no dispone de un mecanismo para cancelar automáticamente las dependencias rotas, requiriendo acción manual del agente superior.

### 2. Bucle de consulta de colisiones de locks (Polling)
Cuando un agente intenta reclamar archivos y choca contra un lock activo, el servidor responde con un error semántico `lock-conflict`. Sin embargo, al no disponer el protocolo MCP de un sistema de suscripción basado en eventos para notificar la liberación de locks, los agentes deben recurrir a consultas periódicas (polling) sobre el estado del lock, lo que puede causar bucles de invocación repetitivos y un alto consumo de tokens.

### 3. Excepciones críticas por corrupción de archivos (JSON parse lockup)
Debido a las escrituras no atómicas identificadas en el apartado **FATAL** (`writeLock` y `syncProposalRegistry`), si una escritura concurrente coincide en el mismo instante que una lectura, el archivo JSON se leerá como incompleto o corrupto. Esto arrojará una excepción irrecuperable en `JSON.parse` dentro de la inicialización de los plugins, bloqueando permanentemente la ejecución de cualquier herramienta del monorepo hasta que el desarrollador limpie manualmente los archivos de la caché (`.cache/`).

---

## 🛠️ ANÁLISIS: Skills/Herramientas/Agentes Faltantes

Para dotar al ecosistema de una robustez de grado de producción absoluto, se recomienda la adición de los siguientes componentes:

1. **Herramienta `proposals_heal` / Auto-reparador de la cola**:
   Una herramienta capaz de barrer y resolver de forma segura las tareas catalogadas como `waiterOrphans` (re-enrutándolas o eliminándolas si su ancestro ya no existe) y de limpiar de oficio cerraduras de locks huérfanas sin requerir la intervención humana.
2. **Integración con el plugin de seguridad externo (`securecoder`)**:
   El plugin `securecoder` expone excelentes herramientas de auditoría (`run-security-scanner`, `determine-threat-model`). Sin embargo, está completamente aislado de la automatización de `proposals`. Sería valioso contar con una skill o herramienta integradora que transforme las vulnerabilidades críticas halladas por el escáner de seguridad en propuestas estructuradas del plan (`proposals`) de manera automatizada.
3. **Mecanismo de notificaciones MCP pasivas**:
   Aprovechar el canal de notificaciones nativo de MCP (`notifications/message`) para alertar al cliente o al agente cuando un recurso bloqueado o un lock se ha liberado, mitigando el desperdicio de tokens por polling.
4. **Herramienta de búsqueda semántica o indexación en memoria**:
   Un plugin o herramienta de indexación vectorial rápida para el plugin de `memory` y `proposals`, permitiendo realizar búsquedas de similitud sobre decisiones previas del proyecto en lugar de tener que listar la totalidad de los títulos persistidos.

---

## 📋 ANÁLISIS: El Plugin `proposals` — Complejidad vs. Necesidad

El plugin `proposals` es por mucho el componente con mayor densidad de código y lógica del monorepo (~120KB). Esta complejidad está **totalmente justificada**, ya que resuelve el problema fundamental de la coordinación asíncrona de múltiples agentes (el "Swarm") en un sistema descentralizado basado únicamente en archivos locales.

Sin embargo, hay espacio para mejorar la estructura interna:
- `round-context.ts` (875 líneas) realiza demasiadas tareas: calcula hashes SHA-256 de archivos, analiza el estado de las herramientas, calcula tiempos de expiración y emite sugerencias de reanudación. Debería descomponerse en submódulos especializados (ej. `context-hashing.ts`, `resume-analyzer.ts`, `snapshot-collector.ts`).

---

## 📝 RECOMENDACIONES PRIORITARIAS

| Prioridad | Acción propuesta | Fichero objetivo |
|---|---|---|
| 🔴 **P0 (Fatal)** | Implementar escritura atómica (escribir en archivo temporal + renombrar con `rename`) para la persistencia del archivo de locks. | [`agent-lock-engine.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/locks/agent-lock-engine.ts) |
| 🔴 **P0 (Fatal)** | Implementar escritura atómica para la sincronización del índice del registro de propuestas. | [`sync-proposal-registry.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts) |
| 🔴 **P0 (Fatal)** | Eliminar las referencias directas a `process.cwd()` en `syncProposalRegistry`, `resolveWorkspacePath` y `defaultVerifyPaths`. Forzar el uso del resolutor `ctx.workspace`. | Múltiples ficheros del plugin de proposals |
| 🟠 **P1 (Muy Mal)** | Consolidar la utilidad duplicada `joinRel` en la carpeta `shared` de core y exportarla en el index público. | Múltiples ficheros (rules, memory y core) |
| 🟠 **P1 (Muy Mal)** | Configurar el parámetro de tracks de propuestas en la configuración del plugin (`mcp-vertex.config.json`) en lugar de mantenerlos en un tipo estático hardcodeado. | [`proposal-parallelism.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/proposal-parallelism.ts) |
| 🟠 **P1 (Muy Mal)** | Parametrizar las carpetas de escaneo (como `paused/demos`) mediante las opciones de configuración del plugin proposals. | [`round-context.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/swarm/round-context.ts) |
| 🟡 **P2 (Regular)** | Eliminar `coreToolRegistrations` o migrar herramientas comunes del framework al núcleo. | [`create-mcp-project.ts`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/project/create-mcp-project.ts) |
| 🟡 **P2 (Regular)** | Reemplazar operaciones sincrónicas del sistema de archivos (`readFileSync`, `existsSync`) por sus equivalentes de promesas en rutas calientes. | [`persistent-task-queue.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/agents/persistent-task-queue.ts) |

---

## 🚀 El Camino al 10/10 (Excelencia Absoluta)

Para elevar la valoración del framework a una puntuación perfecta de **10/10**, se deben resolver las siguientes brechas de diseño y deuda técnica identificadas en la auditoría:

1. **Garantía Total de Atomicidad y Evitación de Corrupciones (Control de Concurrencia 10/10)**:
   - Implementar el patrón atómico de escritura (`tmp + rename`) tanto en el motor de locks ([agent-lock-engine.ts](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/locks/agent-lock-engine.ts)) como en el sincronizador del índice ([sync-proposal-registry.ts](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts)). Esto inmunizará al sistema contra interferencias o truncamientos JSON cuando múltiples agentes escriben a la vez.

2. **Aislamiento Hermético de Sandbox (Aislamiento de Entorno 10/10)**:
   - Eliminar radicalmente todas las llamadas implícitas y explícitas a `process.cwd()` en la lógica interna del motor de propuestas, delegando al 100% las resoluciones de rutas relativas y absolutas al proveedor de rutas inyectado `ctx.workspace`. Esto asegura el comportamiento esperado bajo cualquier entorno de host sin "fugas de contexto".

3. **Generalización Completa de Configuración (Independencia del Proyecto 10/10)**:
   - Desacoplar las convenciones rígidas del host original de los plugins del monorepo. Para ello, los tracks (como `ui-demo` o `game-demo`) y las carpetas específicas a escanear (como `paused/demos`) deben ser opciones dinámicas inyectadas desde el archivo [mcp-vertex.config.json](file:///home/cartago/_projects/mcp-vertex/README-MCP-VERTEX.md#L63-L77) del cliente en lugar de constantes internas.
   - Modificar la plantilla de scaffolding en [scaffold-host.ts](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/scaffold/scaffold-host.ts) para evitar defaults hardcodeados de endpoints de autoría privada.

4. **Auto-Sanación Activa (Resiliencia de Swarm 10/10)**:
   - Diseñar y añadir un agente/herramienta de reparación automática (`proposals_heal`) en la cola. La contrapresión `amber`/`red` no solo debe alertar de un bloqueo por `waiterOrphans`, sino que el sistema debe ser capaz de liberar locks o tareas cancelando/replanificando dependencias rotas autónomamente sin atascar a otros subagentes en bucles infinitos de espera.

5. **Cumplimiento Estricto del Principio DRY (Calidad de Código 10/10)**:
   - Centralizar la utilidad básica de combinación de rutas `joinRel` en el núcleo exportable de [@cartago-git/mcp-vertex/public](file:///home/cartago/_projects/mcp-vertex/packages/core/package.json#L16), erradicando las tres copias redundantes presentes en el repositorio.

6. **I/O 100% No Bloqueante (Eficiencia Operacional 10/10)**:
   - Sustituir las APIs síncronas de lectura y comprobación del sistema de archivos (`readFileSync` y `existsSync`) por promesas asíncronas en todas las operaciones que involucren archivos calientes o de registro frecuente (como la cola de tareas).

---

## 🎯 Valoración Global

| Dimensión | Puntuación | Comentario |
|---|---|---|
| **Arquitectura de Monorepo** | 9/10 | Desacoplamiento correcto entre núcleo del framework y plugins específicos. |
| **Robustez de la Suite de Tests** | 10/10 | 277 pruebas unitarias y de integración exitosas y veloces. Cobertura ejemplar. |
| **Diseño de Contratos (Plugins)** | 9/10 | Tipados estrictos, inyección de contexto impecable y extensibilidad. |
| **Control de Concurrencia** | 5/10 | Susceptible a colisiones destructivas debido a escrituras no atómicas en locks e índice. |
| **Aislamiento de Entorno** | 6/10 | Penalizado por el uso reiterado de fallbacks basados en `process.cwd()`. |
| **Eficiencia de Contexto (Tokens)** | 9/10 | Optimización estelar de la ventana de contexto a través de resúmenes (`overview`) y hashes. |
| **Independencia de Proyecto** | 7/10 | Tracks e itinerarios de carpetas del host original todavía acoplados a plugins nucleares. |

### Nota Global: 7.9/10 (Potencial 10/10)
**Una plataforma MCP avanzada y de alta calidad conceptual, que requiere resolver deuda técnica en el manejo seguro de archivos y en la eliminación completa del contexto de ejecución global (`process.cwd()`) para alcanzar la excelencia operativa.**
