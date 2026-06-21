---
id: a020
kind: audit
title: "Auditoría exhaustiva — Claude Code (Opus 4.8)"
status: done
date: 2026-06-21T04:23:51Z
track: archive
---

# Auditoría exhaustiva de `@cartago-git/mcp-vertex` — Claude Code (Opus 4.8)

> Fecha: 15-06-2026. Análisis independiente del monorepo `mcp-vertex`
> (`packages/core` + `plugins/proposals|rules|memory|git|quality`),
> sin tener en cuenta las otras auditorías.

## 0. Veredicto rápido

Base **muy sólida**: arquitectura núcleo-puro + plugins por CLI, contratos
limpios, salidas compactas, knowledge lazy, 277 tests verdes. Es eficiente y
está bien planteado. Pero hay **incoherencias de rutas**, **gaps en el flujo de
propuestas** (no se pueden *crear/cerrar* slices con una tool), **riesgos de
bucle suave**, y el **plugin rules** asume dependencias eslint que no verifica.
No está en 11/10 todavía; está en un **7.5/10** honesto.

---

## 1. Por capas (fatal / mal / regular / bien / muy bien / perfecto)

### Núcleo (`packages/core`)
- **Perfecto**: `planRegistrationOrder` (determinista, falla rápido ante
  duplicados/anchors desconocidos), el barrel `./public` como única superficie
  estable, `overview` como punto de orientación en 1 llamada.
- **Muy bien**: cargador de plugins (un fallo no tumba al resto), `definePlugin`,
  envelope de error uniforme, salidas JSON compactas, `--check`/`--doctor`.
- **Bien**: bootstrap híbrido (analyze/plan/create) — el server recomienda, el
  agente escribe. `analyze_project` ampliado (py/go/rust/monorepo/CI).
- **Regular**: la **auto-escritura del blueprint en el arranque** (`runCli`)
  hace I/O en boot; es idempotente pero sorprende y duplica lógica de rutas
  (recalcula cacheDir a mano en `prepareServerBlueprintOnStart` en vez de
  reusar `assembleCliConfig`). Riesgo de drift.
- **Mal**: **incoherencia de `--cacheDir`/`--docsDir`**. El núcleo los anuncia
  y los pasa a `ctx`, pero el plugin proposals usa `DEFAULT_PATH_LAYOUT`
  horneado (`.cache`/`docs`), así que esos flags **no reubican** el store de
  propuestas/locks/cola. Un usuario que ponga `--cacheDir=x` esperará que TODO
  vaya a `x` y no será así. Hay que: (a) inyectar el layout en los engines, o
  (b) documentar la limitación de forma prominente y derivar el layout de
  `ctx.corePaths` en proposals.

### Plugin `proposals`
- **Muy bien**: engines testeados (locks con heartbeat/GC → sin locks zombie,
  task-queue, slice-plan con disjointness). `delegate` (nombre+lock atómico) y
  `plan` (disjointness) son justo lo que pide el multi-agente orgánico.
- **Mal (gap real)**: **no hay tool para CREAR una propuesta** ni para
  **cerrar un slice**. Hoy el agente escribe el `.md` a mano (con la sección
  `## Slices` en un formato regex muy específico) y luego `sync_proposals`. Para
  "que las propuestas se creen para trabajarse con varios agentes en slices con
  exhaustividad y claridad" falta `create_proposal` (genera el doc con frontmatter
  + `## Slices` disjuntas válidas por construcción) y `close_slice` (marca
  `- status: done` + libera el lock en un paso atómico). Sin esto el flujo es
  frágil y propenso a errores de formato.
- **Regular (bucle suave)**: `auto_work`/`continue_proposal mode:auto` eligen la
  siguiente propuesta "actionable" (incluye `in_progress`). Si el agente llama
  en bucle sin avanzar, puede **re-seleccionar la misma** indefinidamente. No
  hay detección de "sin progreso" ni un marcador de "nada que hacer" fuerte.
- **Regular**: nombres internos siguen diciendo `subagent-*` aunque la tool es
  `agent_names` (cubre orquestador). Cosmético pero confunde.

### Plugin `rules`
- **Muy bien**: presets por framework como **datos** (sin deps pesadas),
  detección por área, manifest en cache con **prioridad del proyecto**, modos.
- **Mal**: los configs eslint materializados **importan plugins** (`angular-eslint`,
  `eslint-plugin-vue`…) que el proyecto **debe tener instalados**; el plugin no
  lo verifica ni avisa. `check_rules` devuelve un comando que **fallará** si esos
  paquetes no están. Falta: detectar deps eslint ausentes y, en su caso, sugerir
  el `bun add -d ...` o degradar a reglas core-only.
- **Regular**: detección por área superficial (`apps/libs/packages/projects` +
  raíz). Monorepos con layout no estándar o anidado se pierden.

### Plugins `memory`, `git`, `quality`
- **Muy bien**: `memory` (upsert por título, recall por query/tags, low-token),
  `git` (read-only, runner inyectable), `quality` (resolución de scopes en
  cascada options→config→scripts).
- **Regular**: `quality.run_quality` **ejecuta comandos arbitrarios** del
  proyecto. Es opt-in y vienen de config/scripts, pero no hay allowlist ni
  límite de salida más allá del `tail`. Riesgo bajo, pero a documentar.

---

## 2. ¿Más skills / tools / agentes / plugins?

Sí, faltan piezas para llegar a 11/10:
1. **proposals**: `create_proposal`, `close_slice`, `proposal_board` (vista
   orquestador: propuestas × slices × claims, low-token). **Prioridad alta.**
2. **Agentes (adapters)**: el `scaffold kind:agent` existe, pero falta un
   **knowledge `multi-agent-loop`** y un **prompt `orchestrate`** que describan
   el bucle orquestador→subagentes (plan→delegate→close_slice→verify) para que
   cualquier modelo lo siga igual.
3. **Plugin `docs`**: mantener README/CHANGELOG/ADR de forma agnóstica.
4. **Plugin `deps`/`security`**: auditar dependencias/vulns (agnóstico vía
   `npm audit`/`osv`), útil en cualquier proyecto.
5. **Plugin `test-author`**: scaffolding de tests por framework (encaja con rules).
6. **Core**: `structuredContent`/`outputSchema` en tools (MCP moderno) para
   clientes que lo soporten → fiabilidad cross-modelo.

---

## 3. Eficiencia / tokens / bucles / bloqueos

- **Tokens**: muy bien. Compacto, knowledge lazy, overview de 1 llamada,
  `memory_recall`/`knowledge` bajo demanda. Mejora posible: paginar/truncar
  salidas grandes (`analyze_project`, `plan_mcp_server.files` puede ser enorme)
  y un parámetro `fields` para filtrar.
- **Bucles**: el riesgo real es `auto_work` sin detección de progreso (ver §1).
  Recomendación: que `auto_work`/`continue_proposal` excluyan `in_progress`
  reclamadas por OTRO agente, y devuelvan `idle` claro cuando no hay slice
  reclamable. `close_slice` cerraría el ciclo.
- **Bloqueos**: bien resueltos — locks con TTL+heartbeat+GC (zombie-reconcile),
  `delegate` reporta `lock-conflict` sin reintentar, carga de plugins tolerante
  a fallos. No veo deadlocks. Único punto: si dos plugins escriben el mismo
  fichero de cache (no debería, cada uno bajo `<cacheDir>/<plugin>`, pero
  proposals usa `.cache` directo por el layout horneado → podría colisionar con
  un futuro plugin que use `.cache/agents.lock.json`). Aislar proposals bajo su
  subdir cerraría el riesgo.

---

## 4. Top acciones para 11/10 (prioridad)

1. **proposals: `create_proposal` + `close_slice` + `proposal_board`** (cierra
   el flujo multi-agente en slices, exhaustivo y claro).
2. **Coherencia de rutas**: derivar el layout de proposals de `ctx.corePaths`
   (honrar `--cacheDir`/`--docsDir`) o aislar bajo `<cacheDir>/proposals`.
3. **rules: verificación/aviso de deps eslint** del framework + degradado.
4. **Anti-bucle en `auto_work`**: excluir in-progress ajenas + `idle` claro.
5. **Knowledge `multi-agent-loop` + prompt `orchestrate`**.
6. **Tokens**: truncado/paginado + `fields` en salidas grandes.
7. **Cosmético**: renombrar internamente `subagent-*` → `agent-*`.
8. **MCP moderno**: `outputSchema`/`structuredContent` (Tier 3).
