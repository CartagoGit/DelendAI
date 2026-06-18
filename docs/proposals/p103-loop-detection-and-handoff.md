---
id: p103
type: proposal
status: idea
track: runtime+coordination
date: 2026-06-18
---

# p103 — Detección de "el agente dice que va a hacer X y no lo hace" + handoff a otro agente

> **Estado: IDEA para decidir. NO IMPLEMENTAR TODAVÍA.** Esta propuesta
> documenta el problema, lo que el servidor MCP **sí puede** y **no
> puede** observar del modelo, y un enfoque recomendado. Cuando se
> apruebe, se abrirá el primer slice (`s1`).

## 0. El problema (en palabras del usuario)

> "No me refiero a que las herramientas entren en loop, sino a momentos
> que los agentes empiezan a repetir lo mismo o dicen que van a hacer
> algo y no lo hacen (seguramente por algún error interno que no me
> muestran). Quiero que el mcp-vertex detecte eso y pase todo el
> contexto y toda la información necesaria a otro agente para que
> continúe el trabajo."

Traducción técnica:

1. **Detectar** que un modelo está atrapado en uno de estos dos
   patrones (o ambos):
   - **Repetición textual**: el modelo emite el mismo fragmento de
     texto (o muy parecido) una y otra vez entre tool calls.
     Ejemplo: "Voy a leer el archivo…", "Voy a leer el archivo…",
     "Voy a leer el archivo…" — 4 veces seguidas sin avanzar.
   - **Intención declarada sin ejecución**: el modelo *anuncia* una
     acción ("Ahora voy a aplicar el fix en `foo.ts`") pero el
     `git diff` no cambia, **o** la siguiente tool call no es la que
     dijo. Típicamente causado por un error interno del modelo que
     no llega al usuario (token malformado, exception silenciada en
     el SDK, `finish_reason` que no es `stop`, etc.).
2. **Empaquetar** el estado relevante (qué estaba haciendo, qué ha
   producido, qué locks/proposals/checkpoint tiene) en un **handoff
   packet** portable.
3. **Entregar** ese paquete a otro agente (otra sesión, otro IDE,
   otro modelo) que continúa desde donde el primero se atascó, **sin
   que el usuario tenga que copiar y pegar manualmente**.

## 1. La realidad técnica (lo que SÍ y NO se puede)

Un servidor MCP es un **proceso stdio local sin estado de modelo**.
Esto acota lo posible drásticamente:

- ❌ **El servidor NO ve el texto que el modelo escribe entre tool
  calls.** MCP transporta **JSON-RPC** con `tools/call` y
  `tools/list`. La "asistencia" del modelo — su texto en lenguaje
  natural — viaja del modelo al **host** (Antigravity / Claude Code
  / Copilot / Codex), y el host la pinta en la UI. **No llega al
  servidor MCP.** Esto es deliberado: es lo que mantiene al
  servidor agnóstico del proveedor.
- ❌ **El servidor NO ve `system prompt`, historial de chat,
  `finish_reason`, ni ventana de contexto del modelo.** Ninguno de
  esos campos cruza el transporte MCP.
- ❌ **El servidor NO puede forzar al modelo a parar.** No existe un
  hook `on-model-stop` en MCP. Lo más cerca son las
  `notifications/message`, pero el modelo decide si las lee.
- ✅ **El servidor SÍ ve**:
  1. Cada `tools/call` que llega (nombre + args + resultado).
  2. El **orden** y la **cadencia** de las llamadas.
  3. El contenido de los args (el modelo "habla" en los args).
  4. El `structuredContent` que devuelve cada tool.
  5. Qué **agente lógico** se ha identificado (`agent_lock` →
     `agent`, `proposals_agent_lock` → `agent`).
  6. El `git diff` del workspace (vía plugin `git`), que es
     **observable por el servidor** aunque el modelo "diga" que ha
     modificado algo.
- ✅ **El servidor PUEDE escribir a disco** estado portable con
  `withFileMutex` + `writeFileAtomic` (primitivas que ya usa la
  ronda).

### Implicación directa para esta propuesta

El patrón **"el modelo dice que va a hacer X y no lo hace"** se
puede detectar **observando la divergencia entre la
última `tool call` y el `git diff`**:

- El modelo llama a `read_file` con `path: "foo.ts"` y luego dice
  "voy a modificar foo.ts". El servidor ve que la siguiente call
  **no es** `edit_file` / `write_file` /
  `multi_replace_string_in_file` sobre ese path, **o** ve que
  después de `git diff` el path no aparece modificado. → **señal
  de loop / intención-no-ejecutada**.

El patrón **"el modelo repite lo mismo"** es más difícil porque
**el texto no nos llega**. Pero **lo que SÍ nos llega son los args**
de cada tool call, y esos args llevan **la intención del modelo
codificada**:

- Si el modelo dice "voy a leer foo.ts" 4 veces, lo que el
  servidor ve son 4 calls a `read_file` con el mismo `path` —
  exactamente el patrón que ya cubre el `auto_work` brake.
- Si el modelo dice "voy a aplicar el fix en foo.ts cambiando X
  por Y" 4 veces, lo que el servidor ve son 4 calls a `edit_file`
  (o similar) con args **casi idénticos** (mismo `path`, misma
  `oldString`, mismo `newString`) — patrón detectable con un
  **hash** o **similitud de Levenshtein** sobre los args.

### Conclusión

Aunque el servidor no ve el texto del modelo, **los args de las
tool calls son una proxy razonable de la intención del modelo**.
Detectar "el agente repite lo mismo o no avanza" se reduce a
**detectar repeticiones o no-progreso en el stream de
`tools/call`**, con dos matices nuevos frente a la versión
anterior de esta propuesta:

- **Mismo args N veces** → probable "el modelo repite lo mismo".
- **Mismo args pero `git diff` no cambia** → probable "el modelo
  dice que va a hacer X y no lo hace" (la acción no se persiste).

## 2. Enfoque recomendado: detector en proceso + handoff al disco

> Esto es lo que se implementaría cuando se apruebe la propuesta.
> Por ahora, solo documento el diseño.

Un plugin nuevo (o un set de herramientas nuevas en `proposals`)
que el servidor ejecuta **al final de cada tool call** y mantiene
en memoria un **sliding window** de las últimas N calls del agente
actual, **con diff de git entre calls consecutivos**:

- **Señales débiles** (sumamos puntos; sobre umbral → "stuck
  suspected"):
  - Misma `tool` + mismos `args` (hash SHA-256 de
    `JSON.stringify(args)` con claves ordenadas) llamada ≥
    `repeatThreshold` veces en los últimos `ringSize` calls.
  - Misma `tool` con args *casi* iguales (similitud de Levenshtein
    normalizada ≥ `similarityThreshold`) ≥
    `nearRepeatThreshold` veces.
  - `auto_work` devolviendo `idle` ≥ `IDLE_STOP_THRESHOLD`
    (ya implementado en
    `plugins/proposals/src/lib/tools/auto-work.tool.ts:36-39`).
  - **Intención-no-ejecutada**: en N calls consecutivas, el
    `git diff --stat HEAD` **no cambia** aunque los args de las
    tools (`edit_file`, `write_file`,
    `multi_replace_string_in_file`, `replace_string_in_file`)
    sugieran modificación. Calculado con el plugin `git` (tool
    `git_diff`) o vía `child_process` si el plugin no está
    cargado.

- **Acción** cuando se confirma el "stuck":
  1. Escribir un **handoff packet** a
     `.mcp-vertex/handoff/<agent>-<isoTimestamp>.json` con la
     misma disciplina (`withFileMutex` + `writeFileAtomic` +
     `redactSecrets` antes de escribir args) que usan
     `proposals/memory`.
  2. Devolver, en el `structuredContent` del **siguiente** tool
     call que el agente haga, un campo extra:
     `{ __stuck_detected: true, handoffPath: "...",
     suggestedAction: "..." }`.
  3. Emitir `notifications/message` con `event: "stuck-detected"`
     (mismo canal que ya usa `notification` para
     `lock-released`). El wrapper/host puede reaccionar; el
     modelo en loop puede que no, pero el wrapper sí.

**El handoff packet** contiene lo mínimo para que otro agente
reanude sin perder el sitio:

```json
{
  "schema": "mcp-vertex/handoff/1",
  "createdAt": "2026-06-18T12:34:56.789Z",
  "reason": "stuck-detected",
  "signals": {
    "repeatCount": 4,
    "nearRepeatCount": 7,
    "idleCount": 0,
    "noProgressCount": 3
  },
  "from": {
    "agent": "...",
    "model": "..." /* del propio config si está disponible */
  },
  "workspaceRoot": "...",
  "activeLocks": [ /* proposals_agent_lock snapshot */ ],
  "currentProposal": {
    "id": "...",
    "sliceId": "...",
    "files": [...],
    "gate": "..."
  },
  "roundContextDigestPath": "...",
  "recentToolCalls": [
    {
      "ts": "...",
      "tool": "read_file",
      "argsHash": "sha256-...",
      "argsPreview": "foo.ts (primeros 200 chars redactados)",
      "resultPreview": "..."
    }
  ],
  "gitHead": "...",
  "gitDirtySummary": "M foo.ts (12 líneas)",
  "instructionsForNextAgent": "string libre del último memory note o vacío"
}
```

### Por qué `enabled: true` por defecto

A petición del usuario. Justificación:

- El detector **solo escribe a disco cuando dispara** (un fichero
  por evento de stuck). En operación normal, coste en memoria y
  CPU: O(1) por call + O(ringSize) para el buffer.
- El detector **no modifica el comportamiento** del servidor
  mientras `stuck === false`: las tools siguen devolviendo
  exactamente lo mismo que ahora.
- El campo `__stuck_detected` solo aparece en el
  `structuredContent` **después** de confirmar el stuck. Un agente
  que no está atascado no lo ve nunca.
- Si dispara un falso positivo, el handoff packet queda en disco
  y otro agente puede **ignorar** el path al leer; no es una
  acción irreversible.

Riesgo aceptable: que en workspaces muy activos el detector
genere algún handoff innecesario. Mitigación: el usuario puede
poner `loopDetector.enabled: false` puntualmente, y los handoffs
antiguos se podan por TTL (configurable, default 7 días).

### Lo crítico que ya existe y reutilizamos (no partimos de cero)

- `proposals_auto_work` ya implementa `IDLE_STOP_THRESHOLD = 3` y
  devuelve `stop: true` en
  `plugins/proposals/src/lib/tools/auto-work.tool.ts:36-39`. La
  nueva pieza debe **absorber** esa señal (no abandonarla) como
  una entrada más del detector.
- `proposals_round_context` ya digiere `activeLocks`,
  `currentProposal`, `proposalPortfolio` en
  `plugins/proposals/src/lib/tools/round-context.tool.ts`. El
  handoff reusa ese digest tal cual.
- `notification_notify_status` ya empuja `lock-released` por
  `notifications/message` desde
  `plugins/notification/src/lib/tools.ts`. Mismo canal para
  `stuck-detected`.
- `agent_lock` ya pide `agent`; `agent_names` ya lo registra en el
  registry persistente.
- `plugins/memory` ya tiene `redactSecrets` para no persistir
  secretos en args.
- `packages/core/src/lib/shared/with-file-mutex.ts` y
  `write-file-atomic.ts` ya dan durabilidad.
- `plugins/git` ya expone `git_diff` y `git_status` — base para
  la señal "intención-no-ejecutada".

## 3. Por qué no se hace con el `auto_work` brake existente

El `IDLE_STOP_THRESHOLD = 3` que ya tenemos hace **parte** del
trabajo:

- ✅ Detecta **una** señal de stuck (el `auto_work` devolviendo
  `idle` N veces seguidas) y devuelve `stop: true`.
- ❌ **No detecta** los demás patrones:
  - Repetición textual del modelo (proxy: repetición de tool call
    con mismo hash de args).
  - Similitud alta de args sin ser idénticos.
  - **"El modelo dice que hace X y no lo hace"** (ausencia de
    cambio en `git diff`).
- ❌ **No escribe** un handoff packet; solo devuelve un string en
  el `structuredContent` que el modelo en loop puede no leer.
- ❌ **No trasciende** la sesión: el `stop: true` se pierde cuando
  el proceso muere; otro agente que arranca desde cero no sabe
  que su predecesor se atascó.

La migración natural es **absorber** el `auto_work` brake dentro
del detector, no abandonarlo.

## 4. Riesgos y contraindicaciones

- **Falsos positivos**: un test legítimo que reintenta la misma
  tool call N veces. Mitigación: el handoff es **un fichero en
  disco**, no una acción. Si no se lee, no pasa nada. El siguiente
  agente decide si lo usa.
- **Privacidad**: el handoff packet incluye `recentToolCalls`. Si
  alguno lleva un secreto en los args, el packet lo contendría.
  Mitigación: pasar `args` por `redactSecrets` antes de hashear y
  antes de escribir el packet (mismo módulo que usa
  `memory_save`).
- **Coste en tokens**: el campo extra en `structuredContent` solo
  aparece cuando el detector dispara. En operación normal, coste
  cero. Tests deben cubrir el caso `enabled: false` → cero writes
  y cero campos extra (regresión).
- **Versionado del schema**: `schema: "mcp-vertex/handoff/1"` y
  validar `major === 1` al leer. Cambios incompatibles → bump a
  `/2`.
- **Operación sin plugin `git`**: si el plugin `git` no está
  cargado, la señal "intención-no-ejecutada" queda
  **deshabilitada** automáticamente (el detector detecta la
  ausencia y registra un warning, no falla). Documentado en
  config.

## 5. Configuración propuesta (default `enabled: true`)

### 5.1 Fichero `mcp-vertex.config.json`

```jsonc
// mcp-vertex.config.json (fragmento)
{
  "loopDetector": {
    "enabled": true,
    "repeatThreshold": 3,        // mismo hash de args ≥ N veces
    "nearRepeatThreshold": 5,   // args casi iguales ≥ N veces
    "similarityThreshold": 0.9, // 0..1, Levenshtein normalizado
    "idleThreshold": 3,         // auto_work idle ≥ N veces
    "noProgressThreshold": 3,   // git diff sin cambio ≥ N calls
    "ringSize": 50,             // ventana en memoria por agente
    "gitCheckTools": [          // tools que cuentan como "modifican"
      "edit_file",
      "write_file",
      "multi_replace_string_in_file",
      "replace_string_in_file"
    ],
    "handoffDir": ".mcp-vertex/handoff",
    "handoffTtlDays": 7,        // podar handoffs viejos
    "notifyOnDetect": true      // enviar notifications/message
  }
}
```

### 5.2 Override por CLI (sin tocar el fichero)

El usuario debe poder **desactivar o afinar el detector sin
editar `mcp-vertex.config.json`** al arrancar el servidor. Mismo
patrón que el resto de flags del CLI (`mcp-vertex --help`
muestra todos). Precedentes en el repo: `--preset=swarm`,
`--check`, etc.

```text
# Desactivar el detector en esta sesión (no escribe nada a disco)
mcp-vertex --no-loop-detector

# Forzar activación explícita (pisar config.enabled: false)
mcp-vertex --loop-detector

# Ajustar umbrales sin tocar el fichero (útil en CI / smoke)
mcp-vertex --loop-detector.repeat-threshold=5
mcp-vertex --loop-detector.no-progress-threshold=10

# Cambiar la carpeta de handoffs (p.ej. en tests efímeros)
mcp-vertex --loop-detector.handoff-dir=/tmp/mcp-test-handoff
```

Reglas:

- `--no-loop-detector` tiene **precedencia absoluta** sobre
  `config.loopDetector.enabled`. Si el usuario lo pasa, el
  detector queda off en esa sesión, **incluso si la config dice
  `enabled: true`**. Se loguea al arrancar:
  `loop detector disabled by --no-loop-detector (config says enabled)`.
- Los flags `--loop-detector.*` hacen **deep-merge** sobre
  `config.loopDetector.*` (mismo mecanismo que `--preset=swarm`
  ya hace con `swarm.*`). El CLI nunca borra claves que la
  config ya tenía; solo las pisa.
- El flag se evalúa **una sola vez** al arrancar el proceso MCP.
  Cambiarlo a mitad de sesión requeriría reiniciar el servidor
  (consistente con el resto del CLI; no hay hot-reload de config).
- El flag debe aparecer en `mcp-vertex --help` con una línea
  corta y un enlace a `docs/LOOP-DETECTION.md` (que se escribe
  en **s9** del plan).

### 5.3 Casos de uso típicos del flag

| Caso | Comando |
|---|---|
| Sesión donde sé que voy a reintentar la misma tool call N veces (debug de tests) | `mcp-vertex --no-loop-detector` |
| Workspace donde ya vi varios handoffs y quiero parar | `mcp-vertex --no-loop-detector` |
| CI / smoke que monta un workspace efímero y no quiero escribir `.mcp-vertex/handoff/` | `mcp-vertex --loop-detector.handoff-dir=/tmp/x` |
| Forzar el detector aunque la config diga `false` (auditoría) | `mcp-vertex --loop-detector` |
| Subir umbrales porque el modelo legítimo reintenta mucho | `mcp-vertex --loop-detector.repeat-threshold=10` |

### 5.4 Decisiones de diseño

- **`enabled: true` por defecto** (a petición del usuario) — pero
  **siempre desactivable** vía CLI por sesión, sin tocar ficheros.
- `repeatThreshold: 3` para no disparar en el primer reintento
  legítimo de un test.
- `noProgressThreshold: 3` para dar margen a "el modelo piensa
  antes de ejecutar" — solo después de 3 calls consecutivas sin
  cambio en `git diff` se considera intención-no-ejecutada.
- `handoffDir` bajo `.mcp-vertex/` (mismo namespace que ya usan
  `proposals`, `memory`, `notification`).

## 6. Plan de slices (propuesta, no compromiso)

| Slice | Qué entrega | Gate |
|---|---|---|
| s1 | `proposals_loop_status` (read-only: estado del ring buffer, sin writes) + tests | type+test |
| s2 | `proposals_handoff_write` + `proposals_handoff_read` + tests de persistencia atómica con `redactSecrets` | type+test |
| s3 | Detector en proceso: ring buffer, hash de args, similitud de Levenshtein, redacción de secretos, escritura del packet | type+test |
| s4 | Señal `noProgress`: integración con plugin `git` (vía `git_diff`); fallback gracioso si `git` no está cargado | type+test |
| s5 | Absorción del `auto_work` brake existente: la señal `idle` se convierte en una entrada más del detector (no se duplica lógica) | type+test |
| s6 | Config `loopDetector.*` en `mcp-vertex.config.json` + flags CLI (`--no-loop-detector`, `--loop-detector`, `--loop-detector.*`) con deep-merge + `bun run config:schema` regenera + tests de override (config / CLI / config+CLI) | type+test |
| s7 | `notifications/message` `stuck-detected` vía plugin `notification` + test e2e | type+test+e2e |
| s8 | i18n de las nuevas tools + página `loop-detector` en `/[lang]/plugins/` (12 idiomas) | site:strict |
| s9 | `docs/LOOP-DETECTION.md` con el contrato del packet + tutorial por host (Antigravity, Claude Code, Copilot, Codex) | lint |

Presupuesto estimado: **8–9 slices**. Ver presupuesto final al
cerrar s1.

## 7. Out of scope (explícito)

- ❌ Forzar al modelo a parar (no tenemos ese hook en MCP).
- ❌ Ver el `system prompt`, el historial de chat o el texto que
  el modelo escribe entre tool calls (transporte MCP no lo
  expone). El detector usa los **args** de las tool calls como
  proxy de la intención del modelo.
- ❌ Detectar stuck **entre sesiones** sin un handoff packet
  previo (el servidor no tiene estado entre arranques; solo lo
  que está en `.mcp-vertex/`).
- ❌ Sidecar externo (enfoque C descartado). Se reconsiderará tras
  medir el detector en proceso.
- ❌ Cambios en los hosts (Antigravity / Claude Code / Copilot /
  Codex). Eso es **trabajo de cada vendor**; nosotros solo
  publicamos un contrato (`docs/LOOP-DETECTION.md`) y unas tools
  que cualquier host puede invocar para leer el handoff.

## 8. Referencias en el repo

- `plugins/proposals/src/lib/tools/auto-work.tool.ts:36-39` —
  `IDLE_STOP_THRESHOLD` (la única detección de stuck actual;
  base que se absorbe, no se duplica).
- `plugins/proposals/src/lib/tools/round-context.tool.ts` —
  `IRoundContextDigest` (reutilizable para el handoff).
- `plugins/proposals/src/lib/locks/agent-lock-engine.ts` —
  agente lógico + locks activos (parte del handoff).
- `plugins/notification/src/lib/tools.ts` — patrón de
  `notifications/message` que el handoff emite (`stuck-detected`).
- `plugins/memory/` — `redactSecrets` (obligatorio antes de
  persistir args).
- `plugins/git/` — `git_diff` / `git_status` (señal
  `noProgress`).
- `packages/core/src/lib/shared/with-file-mutex.ts` —
  serialización de writes al packet.
- `packages/core/src/lib/shared/write-file-atomic.ts` —
  durabilidad del packet.
- `docs/proposals/p103-loop-detection-and-handoff.md` — este
  fichero.