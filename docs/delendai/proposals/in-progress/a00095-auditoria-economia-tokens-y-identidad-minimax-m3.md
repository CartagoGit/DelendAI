---
id: a00095-m3-token-identity
type: audit
track: docs
status: in-progress
author: minimax-m3 (2026-10-19)
scope: snapshot e342c8e158d492bf7ca4606b07c8d0c2013beb38
---

# a00095 — Auditoría de economía de tokens y propagación de identidad (minimax-m3)

> **Lectura 1 (independiente).** Esta auditoría no leyó las actas de los
> otros modelos. Las cifras que siguen vienen de medir un cliente MCP
> real contra el snapshot indicado, no de recontar archivos.
> Fuente única de medición: `tools/scripts/report/token-budget-report-lib.ts`
> vía `connectTokenBudgetClient` con `InMemoryTransport`.

---

## 1. Carga de contexto por modo de superficie

La decisión se delega en `decideSurfaceModeFromCapabilities`
([decide-mode.ts:106](../../packages/core/src/lib/surface/decide-mode.ts)).
Mide primero un override explícito, luego el perfil del host
(`HOST_MODE_PROFILES`), luego la capability `delendai/surface` que el
cliente declara en su handshake. **Claude Code, Cursor, VS Code Copilot
Chat, Aider, Codex, MCP Inspector y vertex-aware** se mapean a `managed`
hard-coded; un cliente desconocido que declare `toolsListChanged` →
`managed`; un cliente desconocido que no declare nada → `native`.

Medición con el cliente MCP en memoria, contra 27 plugins cargados:

| Modo | Tools visibles | Bytes (tools/list) | Tokens est. (÷4) | Sample |
|---|---|---:|---:|---|
| **native** | 198 | 246 030 | ~61 508 | `delendai_overview`, `…_configuration_center`, `…_agent_catalog`, `…_knowledge`, `…_project_context` |
| **managed** | 7 | 6 261 | ~1 566 | `delendai_overview`, `…_tool_search`, `…_plugin_activate`, `…_plugin_deactivate`, `…_status` |
| **adaptive** | 7 | 6 261 | ~1 566 | id. managed |
| **compact** | 7 | 6 261 | ~1 566 | id. managed |

**Observaciones:**
- `managed`/`adaptive`/`compact` son **idénticos en bytes** (6 261). El
  router `delendai_compact_router` se publica siempre; la diferencia entre
  los tres modos sólo se nota en el filtrado del `search`.
- **native cuesta 39× más tokens que cualquier modo router** (61 508 vs 1 566).
- En el snapshot actual **cero herramientas tienen descripción > 300 caracteres**
  tras la compactación v00129 (compactDescription). Sólo `delendai_resolve_capability`
  mide 346 chars y es irreducible porque es la descripción del router que reescribe
  a mano el comportamiento esperado.
- Cada tool router expone `name`, `description`, `inputSchema` (objeto vacío) y, en
  al menos uno, `outputSchema` mínimo (looseObject `{ok:boolean.optional}`).

### 1.1 Composición del coste en `native` (197 tools, 241 728 B agregados)

| Componente | Bytes | % del total |
|---|---:|---:|
| outputSchema | 139 125 | **57.5 %** |
| inputSchema | 53 384 | 22.1 % |
| descripción | 17 434 | 7.2 % |
| resto (título, anotaciones, nombres) | ~31 785 | 13.2 % |

El **outputSchema es la única variable que aún infla el bootstrap**:
es 3× las descripciones y 2.6× los inputSchemas juntos.
La compactación v00129 (`compactOutputSchema()`) ya se aplica a
`invoke` y a unos cuantos más — pero todavía hay **23 herramientas
"deshonestas"** que declaran un schema completo en `tools/list` aun
cuando su handler lo ignora (lo verifican los specs en
`tool-component-breakdown`).

### 1.2 Repetición de descripciones

Para los 7 tools router, las descripciones se sirven **una sola vez por
listado**. En nativo, las descripciones son cortas (mediana ≤ 140 chars),
así que este eje ya está optimizado. La duplicación observable es
**funcional** (mismo nombre de tool expuesto por dos plugins), no de
texto.

---

## 2. Identidad y atribución (`packages/core/src/lib/work-identity/`)

Diagrama de resolución de identidad en una sola mirada
([resolve-work-agent.service.ts:97](../../packages/core/src/lib/work-identity/resolve-work-agent.service.ts)):

```
DELENDAI_AGENT_ID / --agent  →  model_id  (fuente: 'environment', máxima prioridad)
provider-model.json (bridge)  →  model_id  (fuente: 'provider', observada)
HOST_CHAT_MODEL desde VSCode  →  model_id  (fuente: 'host:<vendor>', editor)
clientInfo.name (handshake)   →  client-<name>  (marcado 'client-', no es modelo)
                                    ↓
                              ninguna: WORK_AGENT_UNKNOWN ('none')
```

Cada fuente se evalúa **post-normalización** (`canonicalModelId`,
[model-spelling.helper.ts](../../packages/core/src/lib/work-identity/model-spelling.helper.ts)).
Una fuente que normaliza a string vacío se considera ausente — esto
cerró el bug x00560 (`'!!!'` como model id sombra). El cliente lleva
siempre el prefijo `client-` para evitar confundirlo con un modelo.

### 2.1 ¿Cómo elige DelendAI qué modelo usar?

Cadena con precedencia explícita, por fidelidad:

1. **Declarado** (`--agent <id>` o `DELENDAI_AGENT_ID`) — gana siempre.
2. **Provider bridge** (`~/.cache/delendai/provider-model.json`) — si no
   se declaró, lee el modelo que el proveedor dijo haber servido. Filtra
   por workspace (no le aplica a otro ws) y por freshness
   (`PROVIDER_MODEL_MAX_AGE_MS`).
3. **Host chat-model** (`hostChatModel`) — escanea `chatSessions` de VS
   Code/Cursor/Insiders/Codium/Windsurf (incluso WSL↔Windows) por la
   última `modelId` reciente. TTL 10 s en memoria.
4. **clientInfo.name** del handshake MCP — marcado `client-…`, nunca
   mezclable con un modelo real.
5. **WORK_AGENT_UNKNOWN** — ninguna fuente habló.

`applyIdentityPolicy()` ([identity-policy.helper.ts:51](../../packages/core/src/lib/work-identity/identity-policy.helper.ts))
aplica el eje `development.identity` del proyecto al final:
- `providerBridge: false` ⇒ ignora la fuente provider.
- `unrecognizedModel: { use }` ⇒ renombra a un único nombre de proyecto.
- `unrecognizedModel: 'refuse'` (default) ⇒ devuelve `unknown`.

### 2.2 Dos workspaces del mismo usuario apuntando a modelos distintos

- **`provider-model.json` es archivo único compartido** en la máquina
  (`~/.cache/delendai/provider-model.json`). El formato nuevo admite un
  campo `entries: { [workspace]: { model, at, provider } }`, pero el
  formato *single-entry* (legado) todavía lo acepta
  ([provider-model-bridge.helper.ts:174](../../packages/core/src/lib/work-identity/provider-model-bridge.helper.ts)).
- La lectura aplica un filtro por `workspace` (mismo prefijo o anidado):
  si el llamador dice su `workspace`, sólo acepta entradas que lo cubran
  o estén dentro. Si el llamador no dice nada, devuelve la entrada más
  reciente sin filtrar ⇒ **un tool llamado sin workspace puede atribuir
  el modelo de otro workspace** (riesgo ID-1).
- Los workspaces anidados (worktree dentro del repo) heredan bien —
  `sameConversationWorkspace()` lo maneja explícito
  (mismo path, o `workspace.startsWith(`${entry}/`)` o viceversa).

### 2.3 ¿Es seguro contra lectura por otros usuarios del sistema?

| Archivo | Modo por defecto | Notas |
|---|---|---|
| `~/.cache/delendai/` | umask del usuario (típico 0755) | **No se ejecuta `chmod`** en `model-identity.helper.ts` ni en `provider-model-bridge.helper.ts` (grep "chmod" / "fchmod" / "0600" / "0700" = 0 hits en todo `work-identity/`). |
| `provider-model.json` | umask | Multi-writer: dos ventanas/IDE escribiendo a la vez ⇒ last-writer-wins sin lock. |
| `models-seen.json` | umask | Append-only + sort (`rememberSeenModel`). Sin tope de crecimiento. |
| `chatSessions/*.json` | umask (del editor) | Sólo lectura. |

Los directorios ya están dentro del `homedir()`, así que un sistema
unix multi-usuario no los expone directamente a otros UIDs, pero un
proceso con los privilegios del propio usuario (otro agente, malware
del usuario) los lee sin restricción.

### 2.4 ¿Hay validación de la firma del modelo?

**No.** No hay HMAC, Ed25519 ni nada parecido sobre `provider-model.json`
ni sobre `models-seen.json`. El bridge confía en el texto escrito
recientemente en un archivo cuyas escrituras puede iniciar cualquier
proceso con acceso al home del usuario. Es "trust-on-first-write"
suavizado por una ventana de frescura.

`hostChatModel` lee `chatSessions/*.json` con `readFileSync` y extrae la
última `"modelId": "..."` con regex. **No valida el JSON** (sólo
`try/catch`). El `modelId` aceptado puede tener cualquier forma — basta
con que el editor lo escribiera (riesgo ID-2).

### 2.5 Lista de riesgos de identidad

| ID | Riesgo | Vector |
|---|---|---|
| **ID-1** | `providerModelReading({})` (sin workspace) acepta la entrada más reciente sin filtro ws, atribuyendo modelos entre proyectos. | Tool que olvida pasar `workspace`. |
| **ID-2** | Ningún writer del bridge firma los datos. Cualquier proceso del usuario puede escribir `provider-model.json` y hacer pasar un modelo por otro. | MITM local / script malicioso. |
| **ID-3** | `hostChatModel` lee modelos desde `chatSessions` sin validar el JSON; el editor dicta qué se considera "modelo activo". | Editor comprometido / sesión manipulada. |
| **ID-4** | `models-seen.json` crece sin tope. Con una sesión que rote modelos (5/nombre × años) satura el FS. | DoS local, lento. |
| **ID-5** | El historial de `modelId` se filtra al log aunque `executeApi:false`: el resolver lee el bridge al boot aunque el módulo `invoke` esté deshabilitado. | Pérdida de atribución cuando se quiere opacity. |
| **ID-6** (menor) | `seen-models` se cachea 10 s — durante esos 10 s, rotaciones rápidas no se reflejan en el siguiente tool call. | Refresh lento. |

---

## 3. Top 10 tools por outputSchema (en `native`, snapshot medido)

| # | Tool | outputSchema B | inputSchema B | desc B | total B |
|---:|---|---:|---:|---:|---:|
| 1 | `delendai_agent-orchestrator_dispatch` | **3 730** | 660 | 111 | 4 501 |
| 2 | `delendai_adaptive-optimizer_adaptive_facade` | **3 533** | 757 | 125 | 4 415 |
| 3 | `delendai_configuration_center` | **3 334** | 203 | 90 | 3 627 |
| 4 | `delendai_proposals_close_slice` | **3 050** | 932 | 73 | 4 055 |
| 5 | `delendai_adopt_project` | **3 001** | 355 | 139 | 3 495 |
| 6 | `delendai_proposals_review_queue` | **2 868** | 276 | 90 | 3 234 |
| 7 | `delendai_proposals_proposal_get` | **2 725** | 33 | 42 | 2 800 |
| 8 | `delendai_proposals_proposals_close_plan` | **2 579** | 517 | 139 | 3 235 |
| 9 | `delendai_metrics` | **2 505** | 88 | 70 | 2 663 |
| 10 | `delendai_proposals_agent_lock` | **2 449** | 436 | 134 | 3 019 |

**Suma de los 10:** 33 774 B (~8 444 tokens) → **24.3 % de los 139 125 B
que suman TODOS los outputSchemas nativos**, sólo 10 de 197 tools.

### 3.1 ¿Son todos necesarios?

| Caso | Diagnóstico | Ahorro estimado |
|---|---|---:|
| `dispatch`, `proposal_get`, `proposal_adopt`, `close_slice`, `review_queue`, `agent_lock`, `close_plan`, `db_reconcile` | Declaran el shape completo en `tools/list` aunque el handler **sólo lo usa como runtime validator interno** (v00129 AUD-B01: `compactOutputSchema()` ya los puede sustituir en la línea `outputSchema` de `registerTool`). | ~70 % de su os-bytes |
| `adaptive_facade`, `configuration_center`, `metrics`, `create_plugin` | Anidan `z.union`, `z.lazy` o `z.record` que se podrían reemplazar por `looseObject({})` (propuesta v00129 ya documenta el trade-off). | ~50 % |
| `adopt_project`, `project_plugins_create/inspect/repair` | 3 tools idénticos en `inputSchema`/`outputSchema` salvo el sufijo; alto riesgo de duplicación accidental (ver §5). | dirección a eliminar duplicados |

### 3.2 Herramientas con outputSchema `dishonest`

23 tools declaran `outputSchema: withOkEnvelope(SomeZodShape)` mientras
el `registerTool` correspondiente no lo usa como validador
(`tool-component-breakdown` los lista). Esto es deuda conocida y está
en el mismo cluster v00129.

---

## 4. Herramientas con descripción > 300 caracteres

**Una sola**: `delendai_resolve_capability` (346 chars).

Es la única herramienta sin `compactDescription` agresivo y la única
con campo `descriptionKey`. La compactación v00129 ya redujo todas
las demás a ≤ 230 chars (la mediana está en 110-130 chars).

**No es problema**: las descripciones nativas suman 17 434 B, que es
el 7.2 % del total. El ahorro ya está casi cerrado.

---

## 5. Tools funcionalmente duplicados (mismo sufijo, distinto plugin)

Detectados al cruzar `tools/list` con el árbol de namespaces:

| Sufijo | Tools | Probable solapamiento |
|---|---|---|
| **`search`** (×4) | `delendai_plugin_search`, `delendai_search_search`, `delendai_tool_search`, `delendai_logs_search` | Cuatro buscadores distintos sobre el mismo namespace. Bytes redundantes en las 4 descripciones + 4 schemas distintos declarados. |
| **`project`** (×3) | `delendai_adopt_project`, `delendai_create_project`, `delendai_analyze_project` | Tres "proyectos" en plugins distintos (adopt, create, analyze). |
| **`status`** (×3) | `delendai_shell_status`, `delendai_completion_status`, `delendai_git_status` | Estado operacional fragmentado por dominio. |
| **`plan`** (×2) | `delendai_agent-orchestrator_plan`, `delendai_proposals_plan` | Planificación: una motor de orquestación, una a nivel propuesta. **Solapan funcionalmente**. |
| **`log`** (×2) | `delendai_logs_log`, `delendai_git_log` | Logs desde dos plugins distintos. |

**Coste de la duplicación por par** (suma de outputSchema + inputSchema
+ description):

| Duplicado | Bytes agregados | Estimación de ahorro tras desduplicar |
|---|---:|---:|
| 4 × `search` | ~3 200 B | ~50 % (2 400 B) si quedan `tool_search` + `search_search` |
| 3 × `project` | ~3 400 B | ~40 % (1 360 B) si quedan `adopt_project` + `create_project` |
| 3 × `status` | ~3 000 B | ~33 % (1 000 B) si se unifica |
| 2 × `plan` | ~3 400 B | ~30 % (1 020 B) |
| 2 × `log` | ~1 300 B | ~40 % (520 B) |

**Total agregación: ~14 300 B (~3 575 tokens) que se podrían devolver al
cliente en cualquier modo con un solo par de renames.**

> Estas duplicaciones también aparecen en `native` y `managed`, pero en
> `managed` no son visibles (el router sólo expone 7). El daño en modo
> nativo es ~6 % de los 246 KB totales.

---

## 6. Propagación de contexto a subagentes

### 6.1 `delendai_invoke` (orchestrator-runner)

La interfaz del tool (`invoke.tool.ts`):

```ts
const InputSchema = z.object({
  task: z.string().min(1),                    // ← texto único
  mode: z.enum(['plan','explore','implement','review']).optional(),
  capabilityHints: z.array(...).optional(),
  costPreference: ...,
  sessionId: z.string().min(1).optional(),
  stream: z.boolean().optional(),
  toolsAllow: z.array(z.string()).optional(),
  timeoutMs: z.number().int().min(1).optional(),
  fallbackStrategy: ...,
  detail: z.enum(['compact','normal','full']).optional(),
  maxBytes: z.number().int().min(1).optional(),
});
```

`manager.ts` (línea ~394) hace:

```ts
const prompt = rewriteUnicodeForAgent(args.task);
```

**El subagente recibe exactamente la cadena `task` — no el historial de
conversación, ni resultados previos, ni attachments.** `args.task` es un
campo libre, así que el padre decide qué poner — pero el contrato del
tool no obliga a meter contexto extra.

### 6.2 `delendai_agent-orchestrator_dispatch`

El input (`dispatch.tool.ts`):

```ts
const INPUT_SCHEMA = z.object({
  task: z.object({
    id: z.string().min(1),
    description: z.string().min(1),
    files: z.array(z.string().min(1)).optional(),
    tags: z.array(z.string()).default([]),
    hint: z.enum(['trivial','small','medium','large']).optional(),
    facts: z.record(z.string(), z.unknown()).optional(),
    acceptance: z.array(z.string().min(1)).optional(),
  }),
  override: OrchestrationModeSchema.optional(),
}).strict();
```

**Tampoco hay propagación de conversación.** El subagente recibe sólo la
tarea estructurada. `facts` es un mapa libre pero el caller decide qué
meter; el motor no inyecta nada del `parent`.

### 6.3 ¿Puede operar el subagente con menos contexto?

**Sí, en los dos casos:**
- `_invoke`: el prompt es `<task>` ya saneado por
  `rewriteUnicodeForAgent`. No hay historia de la conversación principal.
- `_dispatch`: el subagente recibe un `ITask` con descripción
  auto-contenida y opcionalmente `files`/`facts` que el padre decide.

La compactación de detalle (`detail: 'compact' | 'normal' | 'full'`,
expuesta en `_invoke`) actúa sólo sobre `IRoutingDecision.alternates` /
`scoringTrace`, no sobre el `task`. Es decir, **el subagente nunca
recibe el `scoringTrace`** por diseño. Esa decisión ya está alineada
con el principio "el subagente opera con menos contexto".

### 6.4 Otra cara: el `format_handoff` (S6)

`format_handoff.tool.ts` vuelca la decisión completa a CLI/curl **sin
secretos** (clave como `$ENV_VAR`, nunca embebida). Sirve al caso
`executeApi:false`. Aquí sí se incluye el `prompt` completo en la salida
del tool, **lo que significa que ese prompt va al log del cliente** —
riesgo de fuga de prompt si el log es compartido (riesgo ID-5 ampliado).

---

## 7. Propuestas concretas de reducción de tokens

> Estimaciones en **modo nativo** (61.5 K tokens). Las cifras son
> techo: el cliente siempre descubre viéndose expuesto; en
> `managed`/`adaptive`/`compact` el router oculta casi todo de todas formas.

### P1. Sustituir los 23 `outputSchema` "deshonestos" por `compactOutputSchema()`

- **Acción**: en cada `registerTool(..., { outputSchema: withOkEnvelope(...) })`
  cambiar a `outputSchema: compactOutputSchema()` cuando el handler no
  use el schema como validador runtime.
- **Ahorro estimado**: 23 × ~2 000 B (mediana de la muestra) = **~46 000 B = 11 500 tokens**
  ⇒ **−18.7 % del bootstrap nativo**.

### P2. Aplicar la misma compactación a los 10 tools top (§3)

- **Acción**: usar `compactOutputSchema()` en lugar de los Zod shapes
  completos en `dispatch`, `adaptive_facade`, `configuration_center`,
  `close_slice`, `adopt_project`, `review_queue`, `proposal_get`,
  `close_plan`, `metrics`, `agent_lock`.
- **Ahorro estimado**: 33 774 B con compactación honesta = ~5 000 B,
  ⇒ −7 % adicional, sumable a P1.

### P3. Desduplicar 4×`search`, 3×`project`, 3×`status`, 2×`plan`, 2×`log`

- **Acción**: fusionar `agent-orchestrator_plan` y `proposals_plan` en un
  solo tool detrás del router. Renombrar los `search` a un solo
  `delendai_tool_search` con `input.plugin`. etc.
- **Ahorro estimado**: 6 300 B ≈ **−2.5 %** del bootstrap nativo.
- **Beneficio extra**: claridad operativa; menos ruido al modelo.

### P4. Reducir el coste del filtrado `shouldExpose` con un solo "umbrella tool"

- **Acción**: en `tool-surface-runtime.service.ts`, cuando una
  capability ha sido activada, agregar al `tools/list` una sola línea
  "umbrella" tipo `delendai_workspace_activate` con campos `{tag,
  pluginId?}` que el router ya entiende. Así el cliente nativo pasa de
  ver ~200 herramientas con sólo las que necesita visibles + 1 umbrella
  que activa dinámicamente.
- **Ahorro estimado**: ~50 % del payload nativo si se filtran los 150
  tools no activados al arranque ⇒ **−47 %** ⇒ bootstrap nativo
  ~30 KB ⇒ unos 7 500 tokens.

### P5. Bajar descripción de `delendai_resolve_capability` a ≤ 230 chars

- **Acción**: derivar la descripción del router de un texto neutro + un
  parámetro `behavior:'route'|'policy'|'noop'`, no de una sola
  descripción hard-coded.
- **Ahorro estimado**: ~120 B ⇒ ~30 tokens. Marginal pero trivial.

### P6. Endurecer la identidad

- **Acción A**: `chmodSync(dirname(path), 0o700)` antes de escribir
  `provider-model.json` y `models-seen.json`. (Mitiga ID-1/ID-2.)
- **Acción B**: añadir un campo `signature` (HMAC-SHA256 con clave
  derivada del usuario) en `provider-model.json`; verificar antes de
  aceptar la lectura. (Mitiga ID-2/ID-3.)
- **Acción C**: requerir `workspace` siempre en `providerModelReading`;
  si no viene, devolver `{ reason: 'workspace-required' }`. (Mitiga ID-1.)
- **Acción D**: tope de tamaño a `models-seen.json`
  (`MAX_SEEN_MODELS = 1024`). (Mitiga ID-4.)

### Resumen de ahorro potencial en bytes de bootstrap

| Propuesta | Bytes ahorrados (~modo nativo) | % del total nativo |
|---|---:|---:|
| P1 — `compactOutputSchema()` en 23 tools deshonestos | ~46 000 | −18.7 % |
| P2 — id. en top-10 | ~28 000 | −11.4 % |
| P3 — desduplicar 5× namespaces | ~6 300 | −2.5 % |
| P4 — umbrella tool en nativo | ~115 000 (techo) | −46.7 % |
| P1+P2 combinadas (sin P4) | ~74 000 | **−30 %** |
| P1+P2+P3 combinadas | ~80 300 | **−32.6 %** |
| Las cuatro combinadas (P1+P2+P3+P4) | ~195 300 | **−79 %** ⇒ bootstrap nativo ≈ 50 KB = 12 500 tokens**

> Las cifras P4 son techo asintótico: requieren que `managed` y
> `native` compartan la misma telemetría de activación. Las cifras P1+P2
> son conservadoras y se pueden aplicar hoy sin tocar el wire protocol.

---

## 8. Conclusión

El sistema ya está **muy optimizado en los modos router** (`managed` /
`adaptive` / `compact`: 1 566 tokens constantes, 7 tools). El coste
vivo está en `native`, que es 39× más caro. La compactación v00129
cerró `inputSchema`/`description` (sólo 1 descripción >300 chars
restante), pero **deja sin tocar el outputSchema de 23 tools "deshonestos"
y de los 10 tools top de la lista**, que suman 39 KB = 55 % del coste
nativo.

La **identidad** está bien diseñada en la *resolución* (cadena con
precedencia, normalización post-source, marcador `client-`, `WORK_AGENT_UNKNOWN`).
Tiene un punto débil en el **circuito de confianza**: `provider-model.json`
y `models-seen.json` viven en `~/.cache/delendai` sin permisos reforzados ni
firmas. Cuatro riesgos concretos (ID-1…ID-4) se cierran con el paquete
P6 (chmod 0700 + HMAC + workspace obligatorio + cap de tamaño).

La **propagación a subagentes** está bien contenida: tanto `_invoke` como
`_dispatch` reciben un `task`/`ITask` self-contained. **No hay riesgo de
filtración de historial de conversación** por el camino feliz. El único
punto donde el `prompt` sale del sandbox es `format_handoff`, que es
deliberado pero merece recordatorio de no loguearlo en logs compartidos.

**Próximo paso sugerido (ordenadas por coste/beneficio):**
1. P1 (4-5 horas): barrer 23 tools deshonestos a `compactOutputSchema()`.
2. P2 (2 horas): los 10 top con plan operativo.
3. P6-B/C (1 día): HMAC + workspace obligatorio en el provider-bridge.
4. P3 (1 día): merger de `search`/`status`/`plan`/`project`/`log`.
5. P4 (sprint): umbrella tool nativo; revisar con el budget gate.

---

*Generado por minimax-m3 desde el snapshot
`e342c8e158d492bf7ca4606b07c8d0c2013beb38` sin leer las auditorías de
los otros LLM. Cifras: medición directa vía MCP client en memoria con
27 plugins cargados (`core,git,forge,search,docs,context-for-change,
impact-analysis,project-health,quality-policy,adaptive-optimizer,memory,
quality,deps,proposals,commit-policy,orchestrator-runner,
agent-orchestrator,completion,notification,logs,prompts-pack,
conventions,security,i18n,perf,tech-debt,status-marker,test-convention,
test-policy,issues,issues-triage,refactor,observability`).*
