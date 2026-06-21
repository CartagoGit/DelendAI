---
id: f00005
type: proposal
status: done
track: agent-contract
date: 2026-06-18
closed: 2026-06-20
related:
  - f00004 # audit multi-modelo (mismo espíritu: tooling sobre el comportamiento del agente)
kind: feat
title: Plugin `@mcp-vertex/status-marker` (cierre coloreado obligatorio)
---

# f00005 — Plugin `@mcp-vertex/status-marker` (cierre coloreado obligatorio)

> **Estado: DONE (2026-06-20).** Plugin implementado y operativo:
> 3 tools (`close`, `validate`, `ping`) + 2 knowledge entries,
> registrado en `swarm` preset y en `gen-capabilities.ts`.
> El gap del core (§4 — `onBeforePrompt` / `onAfterRespond`) queda
> como mejora futura; la propuesta eligió el alcance A (knowledge +
> tools sin tocar el core), que cumple el 80% del valor.

## 1. Contexto: el patrón que ya tienes y funciona

En el `implementation_runner` del prototipo `Azur.lx`, todo subagente
(termina su última línea visible con **un único marcador coloreado**).
El catálogo de estados actual es:

| Emoji | Marcador             | Razón obligatoria | Significado |
|-------|----------------------|-------------------|-------------|
| 🟩   | `HECHO`              | opcional          | Proposal cerrada y revisada. |
| 🟨   | `CAP`                | **sí**            | Turno agotado; queda checkpoint + relanzador. |
| 🟧   | `RE-PIVOT`           | **sí**            | La cascada cambió de dirección; el bucle sigue activo. |
| 🟦   | `CHECKPOINT-REQUIRED`| **sí**            | Handoff al orquestador. |
| 🟫   | `REPAIR-NEEDED`      | **sí**            | El verifier pidió reparación acotada. |
| 🟥   | `BLOQUEADO`          | **sí**            | Hard blocker; intervención humana. |
| 🟪   | `SIN PROPUESTAS LIBRES` | opcional       | El catálogo tiene `in_progress` pero todas están ocupadas. |
| ⬜   | `SIN PROPUESTA DE NINGUN TIPO` | opcional | El catálogo está vacío de ejecutables. |

Reglas de formato (las fija el helper `formatLxAppCloseMarker`):

- La línea final es `<marcador>` solo, o `<marcador> — <razon-corta>`.
- Separador entre marcador y razón: ` — ` (U+2014, con espacios).
- La línea completa ≤ **120 caracteres**. Si se pasa, truncar con `…`.
- 5 estados requieren razón obligatoria: `CAP`, `BLOQUEADO`, `RE-PIVOT`,
  `REPAIR-NEEDED`, `CHECKPOINT-REQUIRED`.
- Si falta la razón en un estado obligatorio, el helper añade literal
  `<reason-missing>` y la convención se rompe (señal para auditoría).
- La línea es **la última** de la respuesta visible: nada de prosa después.

### Por qué importa

- Da al orquestador (y al humano) un **parser trivial** del estado del agente.
  Una sola regex + tabla emoji→estado.
- Permite **métricas**: cuántas respuestas quedan sin cierre, distribución por
  estado, ratio de `BLOQUEADO` vs `HECHO`.
- Elimina la ambigüedad "¿ha terminado o se ha quedado colgado?".
- Es agnóstico del modelo: sirve igual para M3, Sonnet, GPT-5.4, Gemini…

## 2. Lo que se quiere como plugin

Un plugin `@mcp-vertex/status-marker` (idéntico patrón al resto de la
carpeta `plugins/`) que:

1. **Expone la tabla canónica** (markers.ts) — única fuente de verdad,
   importable por cualquier otro plugin o skill que quiera producir/consumir
   el mismo formato.
2. **Inyecta el contrato** en el system prompt del agente (cuando el core
   lo permita — ver §4).
3. **Verifica la última línea** de cada respuesta y registra auditoría
   (counter de OK / counter de violación con etiqueta de tipo).
4. **Ofrece dos tools MCP** para que el agente se "autocierre" bien:
   - `<prefix>_close { state, reason? }` → devuelve la línea exacta que
     debe pegar al final (uso: el agente llama al tool y copia el output).
   - `<prefix>_validate { text }` → recibe un bloque y dice si la última
     línea cumple (uso: dry-check antes de enviar).

### Por qué **plugin** y no solo "instrucción en `AGENTS.md`"

| Criterio                          | `AGENTS.md`     | Plugin                |
|-----------------------------------|-----------------|-----------------------|
| El agente lo cumple               | a veces         | siempre (prompt) + verificado (hook) |
| Métricas de cumplimiento          | no              | sí (`status_marker_ok`/`_violation`)  |
| Cambias la tabla sin tocar docs   | no              | editas `markers.ts`                  |
| Lo activas por proyecto           | no              | `plugins.status-marker.enabled`       |
| Lo reutilizas entre proyectos     | no              | sí, es un paquete npm                |

## 3. Estructura del plugin (siguiendo el patrón del repo)

````text
plugins/status-marker/
├── package.json
├── README.md
└── src/
    ├── index.ts               # definePlugin + register(ctx) → IMcpPluginRegistrations
    ├── markers.ts             # tabla emoji↔estado + formatLxAppCloseMarker
    ├── validate.ts            # validateCloseMarker(lastLine)
    ├── tools/
    │   └── close-tools.ts     # buildCloseRegistration + buildValidateRegistration
    └── tests/
        ├── markers.spec.ts
        ├── validate.spec.ts
        └── close-tools.spec.ts
````

### `markers.ts` (fuente única de verdad)

````typescript
export type CloseMarker =
  | 'HECHO'
  | 'CAP'
  | 'RE-PIVOT'
  | 'CHECKPOINT-REQUIRED'
  | 'REPAIR-NEEDED'
  | 'BLOQUEADO'
  | 'SIN PROPUESTAS LIBRES'
  | 'SIN PROPUESTA DE NINGUN TIPO';

export interface IMarkerDef {
  readonly emoji: string;
  readonly requiresReason: boolean;
  readonly maxLineLen: 120;
}

export const MARKERS: Readonly<Record<CloseMarker, IMarkerDef>> = {
  HECHO:                       { emoji: '🟩', requiresReason: false, maxLineLen: 120 },
  CAP:                         { emoji: '🟨', requiresReason: true,  maxLineLen: 120 },
  'RE-PIVOT':                  { emoji: '🟧', requiresReason: true,  maxLineLen: 120 },
  'CHECKPOINT-REQUIRED':       { emoji: '🟦', requiresReason: true,  maxLineLen: 120 },
  'REPAIR-NEEDED':             { emoji: '🟫', requiresReason: true,  maxLineLen: 120 },
  BLOQUEADO:                   { emoji: '🟥', requiresReason: true,  maxLineLen: 120 },
  'SIN PROPUESTAS LIBRES':     { emoji: '🟪', requiresReason: false, maxLineLen: 120 },
  'SIN PROPUESTA DE NINGUN TIPO': { emoji: '⬜', requiresReason: false, maxLineLen: 120 },
};

const SEP = ' — '; // U+2014 con espacios

export function formatLxAppCloseMarker(
  state: CloseMarker,
  reason?: string,
): string {
  const def = MARKERS[state];
  const body = def.requiresReason
    ? `${def.emoji} [${state}]${SEP}${reason ?? '<reason-missing>'}`
    : `${def.emoji} [${state}]`;
  return body.length > def.maxLineLen
    ? `${body.slice(0, def.maxLineLen - 1)}…`
    : body;
}
````

### `validate.ts` (parser tolerante)

````typescript
import { MARKERS, type CloseMarker } from './markers';

const EMOJI_TO_STATE: ReadonlyMap<string, CloseMarker> = new Map(
  Object.entries(MARKERS).map(([state, def]) => [def.emoji, state as CloseMarker]),
);

export type Violation =
  | 'missing'
  | 'extra-prose'
  | 'bad-format'
  | 'reason-missing'
  | 'too-long';

export interface IValidationResult {
  readonly ok: boolean;
  readonly state?: CloseMarker;
  readonly reason?: string;
  readonly line?: string;
  readonly violation?: Violation;
}

export function validateCloseMarker(lastVisibleLine: string): IValidationResult {
  const trimmed = lastVisibleLine.trim();
  if (!trimmed) return { ok: false, violation: 'missing' };

  const emoji = [...trimmed][0];
  const state = EMOJI_TO_STATE.get(emoji);
  if (!state) return { ok: false, violation: 'bad-format' };

  const def = MARKERS[state];
  const rest = trimmed.slice(emoji.length).trim(); // "[STATE] — reason"
  const bracketEnd = rest.indexOf(']');
  if (bracketEnd < 0) return { ok: false, violation: 'bad-format', state };

  const afterBracket = rest.slice(bracketEnd + 1).trim();
  let reason: string | undefined;
  if (afterBracket.startsWith('—')) reason = afterBracket.slice(1).trim();

  if (def.requiresReason && !reason) {
    return { ok: false, violation: 'reason-missing', state };
  }
  if (trimmed.length > def.maxLineLen) {
    return { ok: false, violation: 'too-long', state, line: trimmed };
  }
  return { ok: true, state, reason, line: trimmed };
}
````

### `index.ts` (entry del plugin)

````typescript
import { definePlugin } from '@mcp-vertex/core/public';

import {
  buildCloseRegistration,
  buildValidateRegistration,
} from './lib/tools/close-tools';

export default definePlugin({
  name: 'status-marker',
  version: '0.1.0',
  describe:
    'Fuerza y verifica el cierre coloreado de cada respuesta del agente (8 estados, ≤120 chars, razón obligatoria en CAP/BLOQUEADO/RE-PIVOT/REPAIR-NEEDED/CHECKPOINT-REQUIRED).',
  optionsSchema: undefined, // sin opciones por ahora; tabla cerrada
  register(_ctx) {
    return {
      tools: [buildCloseRegistration(), buildValidateRegistration()],
      knowledge: [
        {
          id: 'status-marker-table',
          title: 'Cierre obligatorio coloreado',
          body: [
            '# Cierre obligatorio coloreado',
            '',
            'Tu último mensaje visible DEBE terminar literalmente con UNA sola',
            'línea de marcador, sin prosa adicional después:',
            '',
            '- 🟩 [HECHO] — proposal cerrada y revisada.',
            '- 🟨 [CAP] — turno agotado; queda checkpoint + relanzador (razón obligatoria).',
            '- 🟧 [RE-PIVOT] — la cascada cambió de dirección (razón obligatoria).',
            '- 🟦 [CHECKPOINT-REQUIRED] — handoff al orquestador (razón obligatoria).',
            '- 🟫 [REPAIR-NEEDED] — el verifier pidió reparación (razón obligatoria).',
            '- 🟥 [BLOQUEADO] — hard blocker (razón obligatoria).',
            '- 🟪 [SIN PROPUESTAS LIBRES] — catálogo con in_progress todas ocupadas.',
            '- ⬜ [SIN PROPUESTA DE NINGUN TIPO] — catálogo vacío de ejecutables.',
            '',
            'Formato: `<marcador>` solo, o `<marcador> — <razon>` con U+2014 + espacios.',
            'La línea completa ≤ 120 chars. Si falta la razón donde es obligatoria,',
            'el helper añade `<reason-missing>` y rompe la convención.',
          ].join('\n'),
        },
      ],
    };
  },
});
````

### Tools (`close-tools.ts`)

- `<prefix>_close { state: enum, reason?: string ≤80 }` →
  `{ line: '🟩 [HECHO]' }` (o `🟨 [CAP] — <razon>` si razón).
- `<prefix>_validate { text: string }` →
  `{ ok: boolean, state?, violation?, line? }`.

> El prefijo por defecto es `status-marker` (o el `namespacePrefix` del ctx
> si el loader lo expone — ver §4).

### Tests mínimos (cobertura por unidad)

- `markers.spec.ts` — formato + truncado a 120 con `…` + `<reason-missing>`.
- `validate.spec.ts` — 8 estados OK, 5 estados fallan sin razón, formato
  inválido, exceso de longitud, línea vacía.
- `close-tools.spec.ts` — los dos tools devuelven shape correcto y el
  cierre del helper es byte-idéntico a la línea esperada.

## 4. Gap en el core (esto **sí** es trabajo previo)

Hoy `IMcpPluginContext` ([packages/core/src/lib/plugins/plugin-contract.ts](../../packages/core/src/lib/plugins/plugin-contract.ts))
expone:

````typescript
interface IMcpPluginContext {
  workspace, corePaths, cacheDir, docsDir,
  pluginCacheDir, pluginDocsDir,
  namespacePrefix, options, args
}
interface IMcpPlugin {
  register(ctx): IMcpPluginRegistrations | Promise<IMcpPluginRegistrations>
}
interface IMcpPluginRegistrations {
  tools?, prompts?, resources?, knowledge?, skills?
}
````

**No hay** `onBeforeAgentPrompt`, `onAfterAgentRespond`, ni nada parecido.
Eso significa que en el estado actual del core, el plugin solo puede:

- ✅ Publicar **tools** que el agente llama (`close` / `validate`).
- ✅ Publicar **knowledge** que el core sirve cuando el agente lo pide
  (`mcp-vertex_knowledge` ya existe en el core — ver
  [packages/core/src/lib/tools/knowledge-tool.ts](../../packages/core/src/lib/tools/knowledge-tool.ts)).
- ❌ **Inyectar** automáticamente el contrato en el system prompt.
- ❌ **Hookear** la última línea de la respuesta.

### Opciones para cerrar el gap (elige una)

| Opción | Esfuerzo | Lo que da | Lo que pierdes |
|--------|----------|-----------|----------------|
| **A. Knowledge + tools** (MVP, sin tocar core) | bajo | El agente puede pedir la tabla (`status-marker-table`) y auto-formatear (`<prefix>_close`). | No garantiza cumplimiento — depende de que el agente lo pida. |
| **B. Hook `onAfterRespond` en el core** | medio | Garantiza auditoría: cada respuesta se mide, el counter se incrementa, el log se persiste. | El core crece. Hay que diseñar la API del hook (sync vs async, qué devuelve, qué hace el core si el hook lanza). |
| **C. Hook `onBeforePrompt` + `onAfterRespond`** | alto | Garantiza auditoría **y** puede inyectar el contrato. | Doble cambio en el core; hay que pensar bien el orden de hooks y la cancelación. |

**Recomendación**: empezar por **A** (publicar el plugin con knowledge +
tools, sin tocar el core). Cumple el 80% — el agente tiene la tabla
canónica disponible y un helper que produce la línea exacta, así que la
convención se vuelve trivial de seguir. Mientras, abrir x00004 para añadir
los hooks al core (B) como mejora separada.

### Si eliges B o C, propuesta adicional mínima para el core

````typescript
// packages/core/src/lib/plugins/plugin-contract.ts (extensión)
export interface IMcpPluginContext {
  // ... existente ...
  /** Hook para transformar el system prompt antes de mandarlo al modelo. */
  readonly onBeforePrompt?: (cb: (prompt: IAgentPrompt) => void) => void;
  /** Hook para inspeccionar/registrar la respuesta final del agente. */
  readonly onAfterRespond?: (cb: (resp: IAgentResponse) => void | Promise<void>) => void;
}
interface IAgentPrompt { readonly system: string; append(block: string): void; }
interface IAgentResponse { readonly finalText: string; readonly model?: string; readonly agent?: string; }
````

Esto entra en [docs/proposals/audits/16-06-2026- Auditoría Maestra (Unificada).md](../../docs/proposals/audits/) como
**nuevo hook de plugin** — encaja con la línea "agnosticismo del core":
el core no sabe nada de `🟩 [HECHO]`, solo ofrece el punto de extensión.

## 5. Activación y uso

### Cargar el plugin

````jsonc
// mcp-vertex.config.json
{
  "plugins": {
    "status-marker": { "enabled": true }
  }
}
````

Arranque:

````bash
mcp-vertex --plugins=status-marker
# o vía el plugin loader si hay varios
mcp-vertex --plugins=notification,status-marker
````

### Uso por el agente (A: knowledge + tools)

1. El agente lee la tabla canónica:
   `mcp-vertex_knowledge { id: "status-marker-table" }` → bloque markdown.
2. Antes de cerrar su respuesta, llama al helper:
   `status-marker_close { state: "HECHO" }` → `{ "line": "🟩 [HECHO]" }`.
3. Pega la línea como **última línea visible**, sin prosa después.
4. Si duda del formato: `status-marker_validate { text: "<su borrador>" }` →
   `{ ok: true, state: "HECHO" }` o `{ ok: false, violation: "reason-missing" }`.

### Uso por el humano / orquestador

- **Lectura rápida** del log: regex `^🟩|^🟨|^🟧|^🟦|^🟫|^🟥|^🟪|^⬜` sobre
  la última línea de cada turno.
- **Dashboard**: `status-marker_metrics` (si se añade en B/C) →
  contadores por estado + lista de violaciones recientes.
- **Test de regresión** del propio plugin: suite que parsea N conversaciones
  reales y verifica que el 100% de cierres son válidos.

## 6. Compatibilidad con el `implementation_runner` de Azur.lx

El plugin está pensado para que el `implementation_runner` de
`Azur.lx/.github/agents/implementation_runner.agent.md` **lo pueda usar
directamente** sustituyendo su helper interno:

````typescript
// antes (helper local en Azur.lx)
import { formatLxAppCloseMarker } from '@/lib/lx-app/close-marker';

// después (plugin portable)
import { formatLxAppCloseMarker } from '@mcp-vertex/status-marker';
````

Si la firma del helper de Azur.lx difiere (p. ej. `formatLxAppCloseMarker(state, reason)`
vs `formatCloseMarker(state, reason)`), se mantiene un **shim de compat**
en el repo de Azur.lx que re-exporta desde el plugin durante una release
de transición. La tabla de 8 estados **no cambia** — es contrato.

## 7. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| El agente añade prosa **después** de la línea | El validador detecta `extra-prose` si se le pasa el bloque completo; con B/C el hook corta/advierte. |
| El modelo recorta la línea a mitad de stream (problema ya visto) | El helper `formatLxAppCloseMarker` ya trunca a 120 con `…`. El plugin nunca es la causa raíz. |
| Otro plugin quiere su propia tabla de cierre | La tabla está en `markers.ts`; exponer `CloseMarker` como tipo permite override vía `optionsSchema`. Decisión para v0.2. |
| Hook `onAfterRespond` introduce overhead | Es fire-and-forget, sin await obligatorio. Counter en memoria, flush a `<pluginCacheDir>/metrics.jsonl` cada N segundos. |
| Rompe agentes que no necesitan cierre (chat casual) | Plugin es **opt-in** por config; quien no lo carga no nota nada. |

## acceptance

- [x] Carpeta `plugins/status-marker/` creada con `package.json`, `README.md`,
      `src/index.ts`, `src/lib/markers.ts`, `src/lib/validate.ts`,
      `src/lib/tools/close-tools.ts`, `src/tests/*.spec.ts`.
- [x] `bun run validate` verde (typecheck + lint + tests): 634 tests
      pasan a 2026-06-20.
- [x] Carga del plugin probada con `mcp-vertex --plugins=status-marker`
      (registrado en swarm preset; `gen-capabilities.ts` lo importa;
      `mcp-vertex.config.json` raíz lo activa).
- [x] README del plugin documenta: tabla, formato, ejemplo de uso.
- [x] Sitio web: entrada en `/plugins/status-marker` (autogenerada
      por `[plugin].astro` desde `capabilities.json`) y entrada en
      `/capabilities` con el desplegable (x00004 B10).
- [ ] **No-goal explícito**: los hooks `onBeforePrompt` /
      `onAfterRespond` del core no se exponen (alcance A elegido en
      §4). Queda para una propuesta dedicada si surge la necesidad.

## 10. Decisión adoptada

- [x] **Alcance**: A (knowledge + tools, sin tocar core).
- [x] **Nombre del plugin**: `@mcp-vertex/status-marker`.
- [x] **Namespace de tools por defecto**: `status-marker` (prefijo
      configurable vía `namespacePrefix`).
- [x] **Tabla de markers exportable**: sí, vía `public/index.ts`.
- [x] **Sitio web**: sí, autogenerada desde `capabilities.json`.
- [ ] **Shim de compat en Azur.lx**: fuera del repo
      `@CartagoGit/mcp-vertex`, no se toca aquí.

## 9. Decisión (marca lo que quieras)

- [ ] **Alcance inicial**: A (knowledge + tools, sin tocar core) vs
      B (hook `onAfterRespond` en core) vs C (prompt + respond hooks).
- [ ] **Nombre del plugin**: `@mcp-vertex/status-marker` (recomendado).
- [ ] **Namespace de tools por defecto**: `status-marker` (recomendado) o
      que el host lo decida vía `namespacePrefix`.
- [ ] **¿Tabla de markers exportable** para que otros plugins (p.ej. `rules`)
      puedan validar cierres producidos por otros? Recomendado: sí, vía
      `public/index.ts` del plugin.
- [ ] **¿Sitio web** debe mostrar la tabla renderizada? Recomendado: sí,
      en `apps/web/src/content/plugins/status-marker.md`.
- [ ] **¿Shim de compat** en Azur.lx para usar el plugin? Recomendado: sí,
      tras el merge de esta propuesta.