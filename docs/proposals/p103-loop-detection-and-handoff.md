---
id: p103
type: proposal
status: idea
track: runtime+coordination
date: 2026-06-18
---

# p103 — Detección de bucle del modelo y handoff de contexto a otro agente

> **Estado: IDEA para decidir.** No implementado. Resume el problema, lo
> que el servidor MCP **sí puede** y **no puede** ver del modelo que lo
> está llamando, y tres enfoques con uno recomendado.

## 0. El problema (en palabras del usuario)

> "Que el mcp-vertex sea capaz de ver si un modelo se bloquea o entra
> en bucle y repite todo el rato lo mismo, para que pase todo el
> contexto y toda la información necesaria a otro agente, y ese otro
> agente, que ya no estaría en bucle, continúe correctamente con el
> trabajo."

Traducción técnica:

1. **Detectar** que un agente/modelo (Gemini, Claude, GPT, etc.) está
   atrapado en un loop — repite las mismas tool calls, devuelve los
   mismos outputs, o no avanza en el `auto_work`.
2. **Empaquetar** el estado relevante (qué estaba haciendo, qué ha
   producido, qué locks/proposals/checkpoint tiene) en un **handoff
   packet** portable.
3. **Entregar** ese paquete a otro agente (otra sesión, otro IDE,
   otro modelo) que continúa desde donde el primero se atascó.

## 1. La realidad técnica (lo que SÍ y NO se puede)

Un servidor MCP es un **proceso stdio local sin estado de modelo**.
Esto acota lo posible drásticamente:

- ❌ **El servidor no ve el prompt del modelo, ni su `system`, ni su
  historial de chat, ni su ventana de contexto, ni su temperatura.**
  MCP transporta **JSON-RPC** con `tools/call` y `tools/list`; el texto
  que el modelo escribe entre tool calls es invisible para el servidor.
- ❌ **El servidor no puede forzar al modelo a parar.** MCP no tiene un
  hook `on-model-stop`. Lo más cerca que existe es el `structuredContent`
  y las notificaciones `notifications/message`, pero el modelo decide
  si las lee.
- ✅ **El servidor SÍ ve**:
  1. Cada `tools/call` que llega (nombre + args + resultado).
  2. El **orden** y la **cadencia** de las llamadas.
  3. El contenido de los args (el modelo "habla" en los args).
  4. El `structuredContent` que devuelve cada tool.
  5. Qué **agente lógico** se ha identificado (`agent_lock` →
     `agent`, `proposals_agent_lock` → `agent`).
- ✅ **El servidor PUEDE escribir a disco** estado portable
  (mismas primitivas `withFileMutex` + `writeFileAtomic` que ya usa
  la ronda).

Implicación: **la detección de bucle es observable por el servidor
solo en términos de *secuencia de tool calls y resultados***, no en
términos del estado interno del modelo. Esto es justo lo que
queremos: si el modelo repitiese las mismas 3 tool calls en bucle, el
servidor **lo ve** aunque no sepa por qué lo hace.

## 2. Tres enfoques

### A) Detector en el servidor + handoff al mismo proceso ⭐ recomendado como primer paso

Un plugin nuevo (o una herramienta nueva en `proposals`) que el
servidor ejecuta **al final de cada tool call** y mantiene en memoria
un **sliding window** de las últimas N llamadas del agente actual:

- **Señales débiles** (sumamos puntos; sobre umbral → "loop suspected"):
  - Misma `tool` + mismos `args` (hash) llamada ≥ 3 veces en los últimos
    K calls.
  - Misma `tool` con args *casi* iguales (≥ 90% similitud) ≥ 5 veces.
  - `auto_work` devolviendo `idle` ≥ `IDLE_STOP_THRESHOLD`
    (ya implementado en
    `plugins/proposals/src/lib/tools/auto-work.tool.ts:36-39`).
  - Ausencia de progreso: `git diff --stat` no cambia entre dos calls
    separados por ≥ M segundos (medible porque `git` plugin ya
    expone `git_status` / `git_diff`).
- **Acción** cuando se confirma el bucle:
  1. Escribir un **handoff packet** a
     `.mcp-vertex/handoff/<agent>-<isoTimestamp>.json` (mismo
     `withFileMutex` que ya usan proposals/memory).
  2. Devolver, en el `structuredContent` del **siguiente** tool call
     que el agente haga, un campo extra:
     `{ __loop_detected: true, handoffPath: "...", suggestedAction: "..." }`.
  3. Opcionalmente, emitir `notifications/message` con el mismo
     contenido (el modelo en bucle puede que no lo vea, pero el
     wrapper/host sí).

**El handoff packet** contiene lo mínimo para que otro agente
reanude sin perder el sitio:

```json
{
  "schema": "mcp-vertex/handoff/1",
  "createdAt": "2026-06-18T12:34:56.789Z",
  "from": { "agent": "...", "model": "..." /* del propio config */ },
  "loopSignal": { "kind": "repeat-call", "tool": "auto_work", "count": 7 },
  "workspaceRoot": "...",
  "activeLocks": [ /* proposals_agent_lock snapshot */ ],
  "currentProposal": { "id": "...", "sliceId": "...", "files": [...], "gate": "..." },
  "roundContextDigestPath": "...",
  "recentToolCalls": [ /* últimos ~20 con hash de args + resultado resumido */ ],
  "gitHead": "...",
  "instructionsForNextAgent": "string libre redactado de memory/notes"
}
```

**Pros**: sin red, sin claves, encaja con todo lo que ya hay
(`proposals` ya rastrea `agent`, `proposals_round_context` ya
digiere, `notification` ya empuja eventos). El coste en tokens es
nulo salvo cuando hay loop (entonces escribe un fichero y añade 1
campo JSON al `structuredContent` del siguiente call).

**Contras**: el detector es **heurístico** (falsos positivos
posibles — p.ej. un test que legítimamente reintenta 3 veces). Hay
que tunearlo y exponerlo como `loopDetector: { enabled, threshold }`
en config.

**Lo crítico que ya existe y reutilizamos** (no partimos de cero):

- `proposals_auto_work` ya implementa `IDLE_STOP_THRESHOLD = 3` y
  devuelve `stop: true`. Solo hay que **ascender** esa señal a un
  handoff packet en lugar de solo un campo.
- `proposals_round_context` ya digiere `activeLocks`,
  `currentProposal`, `proposalPortfolio`. El handoff puede
  reusarlo entero.
- `notification_notify_status` ya empuja `lock-released` por
  `notifications/message`. El mismo canal sirve para
  `loop-detected` (otro wrapper/host puede reaccionar).
- `agent_lock` ya pide `agent`; `agent_names` ya lo registra en el
  registry persistente.

### B) Detector en el cliente MCP (host/IDE) + handoff entre sesiones

El agente que se atasca lo detecta el **host** (Antigravity, Claude
Code, Copilot, Codex) y arranca una **nueva sesión MCP** pasándole el
handoff packet como primer tool call. El servidor MCP solo expone
**dos herramientas nuevas**: `handoff_write` y `handoff_read`.

**Pros**: el host tiene más señales (logs de UI, longitud de
respuesta, número de mensajes, modelo activo) y puede decidir con
más precisión si hay loop. Funciona con **cualquier** servidor MCP
que exponga esas dos tools, no solo con `@mcp-vertex/core`.

**Contras**: requiere cambios en cada host (4+ IDEs). No podemos
forzar eso desde el core. **Pero la parte servidor (B′) sí la
podemos hacer nosotros**: exponer `handoff_read` /
`handoff_write` para que **cualquier** host pueda usarlos.

### C) Detector externo (otro proceso) que monitoriza logs MCP

Un **sidecar** (otro proceso Node) que taila el log JSON-RPC del
servidor MCP, detecta loops, escribe handoffs, y opcionalmente
manda una señal al host (p.ej. via un socket local).

**Pros**: 100% transparente para el servidor MCP, no toca su código.

**Contras**: añade un proceso más al deployment, otro punto de
fallo, y visibilidad limitada (MCP no loguea por defecto).

## 3. Recomendación

1. **Empezar por A + B′ en paralelo**, dentro de un mismo slice
   pequeño:
   - **A.1** Nuevo plugin `@mcp-vertex/loop-detector` (o nueva tool
     en `proposals`) que:
     - Mantiene un **ring buffer en memoria** por `agent` con las
       últimas N tool calls (hash de `tool + JSON.stringify(args)`).
     - Sobre cada nuevo call, evalúa las señales débiles.
     - Si supera el umbral: escribe el handoff packet vía
       `withFileMutex` + `writeFileAtomic` y devuelve un campo extra
       en el `structuredContent` del call actual.
   - **B′.1** Dos tools nuevas, `proposals_handoff_write` y
     `proposals_handoff_read`, que persisten el packet en
     `.mcp-vertex/handoff/` con la misma disciplina que
     `proposals_lock` y `proposals_digests`.
   - **Config**: `loopDetector: { enabled: false, repeatThreshold: 3,
     idleThreshold: 3, similarityThreshold: 0.9, ringSize: 50 }` en
     `mcp-vertex.config.json`. Default `enabled: false` para no
     romper instalaciones existentes.

2. **Después** (slice aparte), exponer el handoff al host:
   - `apps/web/src/pages/[lang]/plugins/loop-detector.astro` con
     tutorial paso a paso + ejemplo de `.mcp-vertex/handoff/*.json`.
   - Traducción a los 12 idiomas (`apps/web/src/i18n/ui.ts`).
   - Documento `docs/LOOP-DETECTION.md` con el contrato del
     handoff packet (`schema: "mcp-vertex/handoff/1"`), cómo lo
     consume cada host conocido (instrucciones por IDE).

3. **No entrar en C** (sidecar externo) hasta haber medido A+B′ en
   el mundo real. La complejidad operacional no compensa hasta que
   tengamos evidencia de que la detección en proceso se queda corta.

## 4. Por qué no se hace con el `auto_work` brake existente

El `IDLE_STOP_THRESHOLD = 3` que ya tenemos
(`auto-work.tool.ts:36-39`) hace **mitad** del trabajo:

- ✅ Detecta **una** señal de loop (el `auto_work` devolviendo `idle`
  N veces seguidas) y devuelve `stop: true`.
- ❌ **No detecta** los demás patrones (repetición de tool calls,
  similitud alta de args, ausencia de progreso en `git diff`).
- ❌ **No escribe** un handoff packet; solo devuelve un string en el
  `structuredContent` que el modelo en bucle puede no leer.
- ❌ **No trasciende** la sesión: el `stop: true` se pierde cuando
  el proceso muere; otro agente que arranca desde cero no sabe
  que su predecesor se atascó.

La migración natural es **absorber** el `auto_work` brake dentro
del detector de bucles, no abandonarlo. La nueva tool debería
poder configurarse para `includeAutoWorkIdle: true` y consumir esa
señal como una entrada más.

## 5. Riesgos y contraindicaciones

- **Falsos positivos**: un test legítimo que hace N veces la misma
  call. Mitigación: el detector solo escribe el handoff packet; la
  decisión de *usarlo* la toma el siguiente agente que arranca (o
  el host). El handoff es **un fichero en disco**, no una acción.
  Si no se lee, no pasa nada.
- **Coste en tokens**: el campo extra en `structuredContent` solo
  aparece cuando el detector dispara. En operación normal, coste
  cero. Tests deben cubrir el caso `enabled: false` → comportamiento
  idéntico al actual (regresión).
- **Privacidad**: el handoff packet incluye `recentToolCalls`. Si
  alguno de esos calls llevó un secreto en los args (p.ej. un
  comando con un token), el packet lo contendría. Mitigación:
  pasar `args` por `redactSecrets` antes de hashear y antes de
  escribir el packet (mismo módulo que usa `memory_save`).
- **Versionado del schema**: usar `schema: "mcp-vertex/handoff/1"`
  en el packet y validar `major === 1` al leer. Cambios
  incompatibles → bump a `/2`.

## 6. Plan de slices (propuesta, no compromiso)

| Slice | Qué entrega | Gate |
|---|---|---|
| s1 | `proposals_loop_status` (read-only: estado del ring buffer, sin writes) + tests | type+test |
| s2 | `proposals_handoff_write` + `proposals_handoff_read` + tests de persistencia atómica | type+test |
| s3 | Detector en proceso: ring buffer, señales débiles, redacción de secretos, escritura del packet | type+test |
| s4 | Integración con `auto_work` brake existente: absorbe la señal `idle` como entrada | type+test |
| s5 | Config `loopDetector.*` en `mcp-vertex.config.json` + `bun run config:schema` regenera | type+test |
| s6 | i18n de la nueva tool + página `loop-detector` en `/[lang]/plugins/` (12 idiomas) | site:strict |
| s7 | `docs/LOOP-DETECTION.md` con el contrato del packet + tutorial por host | lint |

Presupuesto estimado: **5–6 slices**. Ver presupuesto final al
cerrar s1.

## 7. Out of scope (explícito)

- ❌ Forzar al modelo a parar (no tenemos ese hook).
- ❌ Ver el `system prompt` o el historial de chat del modelo
  (transporte MCP no lo expone).
- ❌ Detectar loops **entre sesiones** sin un handoff packet previo
  (el servidor no tiene estado entre arranques; solo lo que está en
  `.mcp-vertex/`).
- ❌ Sidecar externo (enfoque C). Se reconsiderará tras medir A+B′.
- ❌ Cambios en los hosts (Antigravity/Claude Code/Copilot/Codex).
  Eso es **trabajo de cada vendor**; nosotros solo publicamos un
  contrato (`docs/LOOP-DETECTION.md`) y unas tools que cualquier
  host puede invocar.

## 8. Referencias en el repo

- `plugins/proposals/src/lib/tools/auto-work.tool.ts:36-39` —
  `IDLE_STOP_THRESHOLD` (la única detección de bucle actual).
- `plugins/proposals/src/lib/tools/round-context.tool.ts` —
  `IRoundContextDigest` (reutilizable para el handoff).
- `plugins/proposals/src/lib/locks/agent-lock-engine.ts` —
  agente lógico + locks activos (parte del handoff).
- `plugins/notification/src/lib/tools.ts` — patrón de
  `notifications/message` que el handoff puede emitir.
- `plugins/memory/` — `redactSecrets` (obligatorio antes de
  persistir args).
- `packages/core/src/lib/shared/with-file-mutex.ts` —
  serialización de writes al packet.
- `packages/core/src/lib/shared/write-file-atomic.ts` —
  durabilidad del packet.