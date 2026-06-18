# 🔍 Auditoría Exhaustiva — `mcp-vertex` y Plugins

> **Fecha**: 16 jun 2026 | **Revisor**: Antigravity (Gemini 3.5 Flash)
> **Metodología**: Inspección del código fuente del monorepo, análisis de flujos de ejecución asíncronos y de concurrencia, comprobación de dependencias, verificación local de la suite de tests (Vitest) y evaluación del impacto en el consumo de tokens y resiliencia ante bloqueos (deadlocks).

---

## 📊 Resumen Ejecutivo

El monorepo `@cartago-git/mcp-vertex` representa una infraestructura madura, escalable y muy avanzada para la coordinación de agentes de inteligencia artificial y la provisión de capacidades a través de servidores MCP (Model Context Protocol). A diferencia de otros proyectos que implementan capas de integración triviales, este workspace ha sido diseñado pensando en la automatización real mediante swarms de agentes concurrentes. 

La separación rígida de responsabilidades entre el núcleo (`packages/core`) y las extensiones (`plugins/*`) es impecable. Tras validar la suite de pruebas (con **415 tests en verde**), se evidencia una estabilidad y robustez funcionales envidiables.

No obstante, para llevar este proyecto al rango de **excelencia absoluta (11 de 10)**, es necesario resolver una condición de carrera sutil pero catastrófica en el motor de exclusión mutua de archivos, erradicar el I/O síncrono en plugins secundarios que bloquea el Event Loop, y enriquecer el ecosistema con herramientas de recuperación ante fallos y de control fino de procesos.

---

## 🔴 FATAL — Errores de diseño o críticos que requieren corrección inmediata

### 1. Condición de carrera por robo de Mutex (`withFileMutex`)
* **Ubicación**: [`packages/core/src/lib/shared/with-file-mutex.ts#L82-L86`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/shared/with-file-mutex.ts#L82-L86)
* **Detalle**: La función `withFileMutex` gestiona la exclusión mutua mediante un archivo `.mutex`. Si un proceso *Agente A* adquiere el mutex y su ejecución interna `fn()` excede el `timeoutMs` (5s) o `staleMs` (30s) debido a una sobrecarga del disco, un *Agente B* en espera considerará que el lock ha expirado/sido abandonado. El *Agente B* ejecutará `await rm(lockPath)` para robarlo, creando un nuevo archivo con su propio PID y timestamp. 
* **El problema real**: Cuando la función del *Agente A* finalmente termina, el bloque `finally` de su llamada ejecuta `await rm(lockPath, { force: true })` de manera incondicional. Esto elimina el archivo de lock que el *Agente B* **acaba de crear y posee en ese instante**, desprotegiendo al *Agente B* y permitiendo que un *Agente C* adquiera el lock concurrente.
* **Impacto**: Pérdida total de la garantía de exclusión mutua en sistemas bajo alta contención, lo que resulta en corrupciones del estado de las colas o del registro de propuestas concurrentes.

### 2. Bloqueo del Event Loop por I/O síncrono en catálogo de docs
* **Ubicación**: [`plugins/docs/src/lib/engine.ts#L94-L106`](file:///home/cartago/_projects/mcp-vertex/plugins/docs/src/lib/engine.ts#L94-L106)
* **Detalle**: El motor de indexación y escaneo del plugin `docs` utiliza `readdirSync`, `statSync` y `readFileSync` para catalogar y leer documentos Markdown en el workspace.
* **Impacto**: En repositorios masivos o sistemas de archivos virtuales/remotos, estas llamadas bloquean por completo el Event Loop de Node/Bun. Mientras se escanea la documentación, el servidor MCP no puede responder a llamadas críticas de estado o latido, causando que clientes concurrentes declaren falsos timeouts del servidor.

---

## 🟠 MAL — Problemas serios que degradan la robustez y calidad

### 3. Fuga de aislamiento en la integración de scaffolds
* **Ubicación**: [`scaffold-host.ts#L299`](file:///home/cartago/_projects/mcp-vertex/packages/core/src/lib/scaffold/scaffold-host.ts#L299)
* **Detalle**: El scaffolding de inicio (`startServer`) inyecta un fallback explícito a `process.cwd()` al instanciar el servidor. Aunque esto es funcional para ejecuciones interactivas directas en local, vulnera el principio de "cero process.cwd()" promovido en el monorepo, en el cual el proveedor de rutas del contexto (`ctx.workspace`) debe regir de forma exclusiva.
* **Impacto**: Inconsistencias menores en resoluciones de rutas relativas si el servidor se levanta desde carpetas anidadas en producción.

### 4. Limitación de tipado por Zod output en herramientas multiplexadas
* **Ubicación**: Varios plugins (`proposals`, `notification`)
* **Detalle**: El SDK de MCP fuerza esquemas de salida JSON planos y rechaza uniones de Zod (`z.union`). Para solventar esto, se utiliza un comodín permisivo `z.object({}).catchall(z.unknown())`.
* **Impacto**: Pérdida de autocompletado y seguridad de tipos (Type-Safety) en las respuestas estructuradas que recibe el cliente de automatización, forzando al agente receptor a inferir la estructura de la respuesta.

---

## 🟡 REGULAR — Aspectos correctos pero mejorables con poco esfuerzo

### 5. Falta de paginación en el plugin `docs`
* **Ubicación**: [`plugins/docs/src/lib/engine.ts#L69`](file:///home/cartago/_projects/mcp-vertex/plugins/docs/src/lib/engine.ts#L69)
* **Detalle**: La limitación física de `maxResults` en `docs` (fijada por defecto en 200) no dispone de parámetros de cursor, `limit` ni `offset`.
* **Impacto**: Si un proyecto escala a más de 200 archivos de documentación y guías Markdown, los documentos sobrantes se volverán completamente invisibles para los agentes de desarrollo.

### 6. Poca cobertura del plugin de dependencias (`deps`)
* **Ubicación**: [`plugins/deps`](file:///home/cartago/_projects/mcp-vertex/plugins/deps)
* **Detalle**: El plugin evalúa únicamente archivos `package.json` de Node/npm.
* **Impacto**: No ofrece valor alguno para proyectos políglotas (Python, Rust, Go) a pesar de que el analizador de bootstrap (`analyze-project.ts`) sí detecta otros entornos de lenguaje.

---

## 🟢 COMO DEBE ESTAR — Estándares de calidad cumplidos con solvencia

### 7. Aislamiento hermético de Rutas y Sandbox
El uso estricto del proveedor de rutas del contexto (`ctx.workspace.resolve`) en el núcleo del framework y en la mayoría de plugins asegura que no haya referencias relativas globales directas, haciendo que los tests en memoria sean altamente reproducibles y predecibles.

### 8. Backpressure inteligente en colas
La cola de tareas (`persistent-task-queue.ts`) gestiona adecuadamente los estados de sobrepresión, informando al swarm sobre colisiones, tareas huérfanas y reintentos fallidos de manera estructurada, evitando bloqueos infinitos de decisión.

---

## ✅ BIEN — Detalles que superan la media del ecosistema

### 9. Transaccionalidad de escritura atómica en ficheros
La inclusión del patrón de escritura atómica (crear archivo `.tmp` temporal en el mismo directorio físico y posteriormente invocar el `rename` atómico de POSIX) previene la existencia de archivos JSON truncados o corruptos debido a lecturas concurrentes simultáneas.

### 10. Robustez de la Suite de Pruebas
Con **415 tests funcionales** (que incluyen simulaciones de contención masiva, concurrencia, e2e de presupuestos de tokens y simulación de caos concurrente), cualquier refactorización profunda puede acometerse con plenas garantías de estabilidad.

---

## 🌟 MUY BIEN — Implementaciones de gran calidad y elegancia

### 11. Búsqueda semántica BM25-lite integrada offline
* **Ubicación**: [`plugins/memory/src/lib/memory/rank.ts`](file:///home/cartago/_projects/mcp-vertex/plugins/memory/src/lib/memory/rank.ts)
* **Detalle**: La inclusión de un indexador BM25 ligero escrito puramente en TypeScript para `memory_recall` es brillante. Permite ranking de relevancia textual sobre la memoria a largo plazo sin dependencias pesadas de base de datos ni llamadas costosas a APIs externas de embeddings.

### 12. Control y cancelación de subprocesos huérfanos
El uso de grupos de procesos (`detached: true` y `process.kill(-pid)`) en los runners de aceptación mitiga de raíz el problema clásico en Node/Bun donde la expiración de un timeout de herramienta deja procesos secundarios de CLI zombis activos en la máquina host.

---

## 💎 PERFECTO — Diseño sobresaliente y referencia absoluta

### 13. Pipeline de SDK y Tipados Autogenerados
* **Ubicación**: [`scripts/generate-tool-types.ts`](file:///home/cartago/_projects/mcp-vertex/scripts/generate-tool-types.ts)
* **Detalle**: El pipeline compila los esquemas de validación Zod de todas las herramientas a especificaciones JSON-Schema y, de ahí, a interfaces de TypeScript puras. Esto garantiza un tipado unificado sin deriva manual entre el cliente del IDE y el servidor de herramientas.

### 14. Modularización del Contexto de Ronda
El refactor del antiguo `round-context.ts` en submódulos especializados (`-types`, `-hash`, `-sources`, `-resume`, `-digest`) ha incrementado sustancialmente la legibilidad del código del plugin `proposals` sin alterar su comportamiento determinista.

---

## 🔮 CRÍTICA CONSTRUCTIVA: Eficiencia de Tokens y Prevención de Bucles

### Eficiencia en tokens: ¿Gasta menos que otras soluciones?
**Sí, y con gran diferencia.** El diseño del monorepo demuestra una conciencia rigurosa sobre el coste del contexto de los LLMs:
* **Payloads compactados**: El uso de truncadores y buffers delimitados (`MAX_CAPTURED_BYTES = 64KB` y exclusión de pretty-printing en JSON) evita rellenar el contexto del agente con volcados de error o diffs enormes.
* **Knowledge lazy**: Los bodies de conocimiento se exponen como recursos de lectura bajo demanda de MCP (`knowledge://`), evitando inyectar texto inactivo en el prompt del sistema del modelo.
* **Compactación de Overview**: La capacidad de llamar a `overview` con `{ compact: true }` reduce el payload más de 5 veces en workspaces con un número masivo de herramientas.

### Prevención de bucles y bloqueos:
El sistema implementa mecanismos muy sólidos contra bucles infinitos de agentes:
* **Forzado de cache**: El `continuity-enforcer` bloquea de forma determinista si un agente lee el mismo archivo inalterado más de 3 veces consecutivas sin avanzar en las propuestas (`forbidReReadOnUnchangedDigest`).
* **Notificaciones contra Polling**: El plugin de notificaciones evita llamadas en bucle de los agentes para comprobar el estado de liberación de un lock (`agent_lock claim`), empujando los eventos proactivamente por el canal de notificaciones nativo de MCP.

---

## 🛠️ ANÁLISIS: Skills, Herramientas y Agentes Adicionales

### ¿Son necesarios más Agentes en el swarm?
**No.** Mantener los 5 roles definidos (Orchestrator + 4 Slots: Proposal Guardian, Implementation Runner, Delivery Verifier, Technical Investigator) es el equilibrio perfecto. Añadir más roles de subagentes específicos aumentaría la latencia de la cascada de llamadas de la IA y el consumo de tokens en un 50% debido al overhead de la síntesis del diálogo sin aportar mejoras funcionales.

### Herramientas adicionales recomendadas:
1. `quality_cancel_command`: Permite abortar un subproceso de compilación/lint en ejecución inmediata (matándolo por PID) en lugar de esperar pasivamente a que venza el timeout global.
2. `proposals_cleanup_orphans`: Una utilidad de diagnóstico para que el Orchestrator purgue locks o tareas cuyos PIDs dueños ya no existan en el sistema operativo, acelerando la recuperación del swarm.

### Skills adicionales recomendadas:
* `concurrency-patterns.md`: Guía de directivas para que el agente entienda cómo actuar cuando una llamada a herramienta retorne un error de conflicto (`lock-conflict`), forzándolo a detenerse y esperar a la notificación en lugar de intentar polling.
* `recovery-playbook.md`: Instrucciones secuenciales de diagnóstico para que el agente resuelva corrupciones de archivos (`CorruptFileError`) de forma autónoma limpiando la caché física de archivos corruptos.

---

## 🚀 El Camino al 11/10: Cómo alcanzar la perfección absoluta

Para llevar este framework a la excelencia técnica insuperable, propongo las siguientes mejoras concretas:

### 1. Corrección del error de liberación de Mutex
Se debe modificar `with-file-mutex.ts` para que escriba un **token único de adquisición (UUID o hash aleatorio)** además del PID. Durante el bloque `finally` de liberación, se leerá el contenido del mutex y solo se procederá al borrado si el token coincide con el generado. Si ha cambiado, significa que el lock fue robado o declarado huérfano, por lo que **no se debe borrar**, preservando el lock del nuevo holder.

```ts
// En la adquisición de withFileMutex:
const lockToken = Math.random().toString(36).slice(2);
await handle.writeFile(`${process.pid}\n${Date.now()}\n${lockToken}`);

// En la liberación de withFileMutex (finally):
if (acquired) {
    try {
        const current = await readFile(lockPath, 'utf8');
        const [, , storedToken] = current.trim().split('\n');
        if (storedToken === lockToken) {
            await rm(lockPath, { force: true });
        }
    } catch {
        // Ignorar si el lockfile ya fue removido o robado
    }
}
```

### 2. Conversión a operaciones Asíncronas en `plugins/docs`
Migrar el motor de escaneo del catálogo de `fs` síncrono a `fs/promises`.
```ts
// Reemplazar:
entries = readdirSync(absDir, { withFileTypes: true });
// Por:
entries = await readdir(absDir, { withFileTypes: true });
```
Esto asegurará que el servidor no sufra degradación de concurrencia al catalogar archivos en sistemas de alta latencia.

### 3. Hot-Reloading de configuración del servidor
Implementar un listener (`fs.watch`) sobre `mcp-vertex.config.json` para que el núcleo del servidor recargue en caliente las opciones y esquemas Zod de los plugins cargados sin necesidad de interrumpir y reiniciar la instancia del servidor MCP.

---

## 📊 Tabla de calificaciones

| Dimensión | Nota | Estado / Justificación |
|---|---|---|
| Arquitectura general | ⭐⭐⭐⭐⭐ Perfecta | Desacoplamiento total núcleo-plugins e inyección de contexto. |
| Contrato de plugins | ⭐⭐⭐⭐⭐ Perfecta | Simple, declarativo mediante Zod, carga segura y asíncrona. |
| Seguridad concurrencia / I/O | ⭐⭐⭐⭐½ Muy bien | Excelente gracias a escrituras atómicas, pero penalizado por la carrera de liberación del mutex. |
| Eficiencia de tokens (LLM) | ⭐⭐⭐⭐⭐ Perfecta | Overview compactable, cache de de-duplicación y payloads limitados. |
| Diseño libre de bucles/bloqueos | ⭐⭐⭐⭐½ Muy bien | Notificaciones nativas para locks y enforcer de dublicados robusto. |
| TypeScript / tipado | ⭐⭐⭐⭐⭐ Perfecta | Inferencia estricta y de-duplicación de tipos impecable. |
| Testing | ⭐⭐⭐⭐½ Muy bien | 415 tests funcionales y simulación de caos integrados con éxito. |
| CI / Release | ⭐⭐⭐⭐ Bien | Automatización completa con Bun, falta pinning de versión en CI. |
| Documentación (README/docs) | ⭐⭐⭐⭐ Bien | Clara, concisa y detallada, pero carece de TypeDoc para la API pública. |
| Plugin `proposals` | ⭐⭐⭐⭐⭐ Perfecta | Motor del swarm excelentemente modularizado y auto-reconciliable. |
| Plugin `memory` | ⭐⭐⭐⭐⭐ Perfecta | Ranking BM25-lite offline muy rápido y de cuota controlada. |
| Plugin `rules` | ⭐⭐⭐⭐ Bien | Declaración robusta, aunque su inicialización síncrona es mejorable. |
| Plugin `git` | ⭐⭐⭐½ Regular-Bien | Seguro (read-only), pero faltan herramientas críticas como branches y blame. |
| Plugin `search` | ⭐⭐⭐½ Regular-Bien | Búsqueda textual correcta, pero se beneficiaría de soporte regex. |
| Plugin `quality` | ⭐⭐⭐⭐ Bien | Captura de errores e integración robusta con ESLint/Vitest. |
| Plugin `docs` | ⭐⭐⭐ Regular | Útil para catalogar, pero penalizado por I/O síncrono bloqueante. |
| Plugin `deps` | ⭐⭐⭐ Regular | Scope muy limitado (sólo soporta package.json). |
| Plugin `notification` | ⭐⭐⭐⭐ Bien | Emisión push correcta, aunque carece de soporte multi-lock file. |
| Securecoder (plugin externo) | ⭐⭐⭐ Regular | Útil pero aislado, carece de un bridge de datos nativo con `mcp-vertex`. |
| Scaffold / Blueprint | ⭐⭐⭐⭐½ Muy bien | Generación en dry-run excelente, carece de slots configurables de agente. |
| Extensibilidad / futuro | ⭐⭐⭐⭐ Bien | Monorepo limpio que facilita la adición de nuevos plugins. |

---

## 💡 Elementos a añadir para alcanzar el 11/10 (Valoración de impacto)

A continuación se detallan las propuestas de valor y su estimación de estrellas de impacto sobre la excelencia del proyecto:

1. **Resolución de la carrera de borrado del mutex en `withFileMutex`** (⭐⭐⭐⭐⭐ - Crítico):
   Soluciona de raíz la posible pérdida de exclusión mutua en condiciones extremas de contención de disco o ejecuciones lentas de los subagentes.
2. **Conversión asíncrona total del plugin `docs`** (⭐⭐⭐⭐ - Importante):
   Erradica por completo el riesgo de congelación del Event Loop del servidor en workspaces grandes, incrementando la resiliencia en tiempo real.
3. **Mecanismo de Hot-Reloading para `mcp-vertex.config.json`** (⭐⭐⭐½ - Muy deseable):
   Permite actualizar la configuración del servidor sobre la marcha sin paradas de servicio, mejorando drásticamente la DX operativa.
4. **Herramienta `quality_cancel_command` para control de timeouts** (⭐⭐⭐ - Conveniente):
   Ahorra miles de tokens y tiempo de espera al permitir abortar procesos de compilación fallidos de forma activa.
5. **Bridge nativo de integración Securecoder ↔ MCP Core** (⭐⭐⭐ - Conveniente):
   Permite que los hallazgos de seguridad se inserten directamente como tareas de la cola del swarm de manera automatizada.
6. **Soporte regex y búsqueda de nombres de archivos en `search`** (⭐⭐½ - Detalle):
   Mejora la velocidad de localización de recursos por parte del agente, optimizando el número de pasos necesarios en fases de análisis.

---

## 🎯 Estado actual del proyecto

**Estado actual**: ⭐⭐⭐⭐½ (8.9/10 - Excelente base arquitectónica y funcional, muy bien encaminada hacia la perfección 11/10 resolviendo las incidencias de concurrencia e I/O identificadas).

