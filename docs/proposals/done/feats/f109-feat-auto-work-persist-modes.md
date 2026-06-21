---
id: f109
type: proposal
status: done
track: plugin
date: 2026-06-20
closed: 2026-06-20
related:
  - f99 # multi-model audit (mismo espíritu: tooling sobre el comportamiento del agente)
  - f107 # multi-lang quality gates (este plugin complementa: quality ejecuta, auto-work coordina la persistencia)
  - f108 # test-convention (paralelo en filosofía: publica el contrato, lo verifica)
kind: feat
title: `auto_work`: modos de persistencia (commit / commit-and-push / none)
---

# f109 — `auto_work`: modos de persistencia (commit / commit-and-push / none)

> **Estado: DONE (2026-06-20).** Nace del
> problema concreto: hoy `<prefix>_auto_work` cierra el slice con la
> línea ambigua `Mark progress in the proposal, then
> <prefix>_sync_proposals` — y `sync_proposals` **solo actualiza el
> índice**, no toca `git`. Resultado: cada agente decide por su cuenta
> si commitea, y casi nadie pushea. Algunos perfiles quieren commit
> local; otros quieren commit+push; otros (vos) quieren analizar antes.

## 1. Contexto y motivación

### Hoy

`auto_work` (en [plugins/proposals/src/lib/tools/auto-work.tool.ts](../../plugins/proposals/src/lib/tools/auto-work.tool.ts))
devuelve un `steps` fijo:

```text
- Open <file> and pick the next atomic slice.
- Claim its files: <prefix>_agent_lock { action: "claim", ... }
- Implement exactly that slice — nothing outside the claimed files.
- [Validate per the project gate (see get_validation_matrix if present).]
- Mark progress in the proposal, then <prefix>_sync_proposals.
- Release: <prefix>_agent_lock { action: "release", task_id }.
- Repeat <prefix>_auto_work for the next slice/proposal.
```

El paso 4 ("Mark progress... sync_proposals") **no commitea ni pushea**.
Cada orquestador (vos, un wrapper de n8n, un agente M3) tiene que
recordar por su cuenta que después de `sync_proposals` puede correr
`git add . && git commit -m "..."` y, eventualmente, `git push`. En
distintos proyectos esto se hace bien, mal, o nunca.

### Por qué configurable

- **Perfil "analizo antes"**: el flujo actual no cambia.
  `persist.mode: 'none'` → `auto_work` no menciona `git` siquiera.
- **Perfil "commit local"**: el agente commitea al cerrar el slice,
  con plantilla Conventional Commits coherente con `derive-version.ts`.
  Push manual.
- **Perfil "commit-and-push"**: el agente commitea **y** pushea al
  cerrar el slice. Útil para worktrees `agent/*` que viven en una rama
  efímera y se mergean por PR.

### Por qué no es un tool nuevo

Podríamos exponer un `<prefix>_auto_commit` separado. Pero:

- Separa una decisión que va **unida** al cierre de slice.
- Obliga al orquestador a llamar 2 tools en secuencia.
- Rompe el contrato de "one call → plan".

Mejor: extender `auto_work` con un parámetro **opcional** y un **default
seguro** (`none`).

## 2. Lo que se quiere

Extender `<prefix>_auto_work` con tres ejes:

1. **Input opcional del tool** — el orquestador puede sobrescribir el
   modo por llamada:
   ```ts
   inputSchema: z.object({
     persist: z.enum(['none', 'commit', 'commit-and-push']).optional(),
   })
   ```
2. **Config en plugin** (`mcp-vertex.config.json`) — default
   persistente por proyecto:
   ```jsonc
   {
     "plugins": {
       "proposals": {
         "persist": {
           "mode": "none",          // "none" | "commit" | "commit-and-push"
           "messageTemplate": "<area>(<proposalId>): <sliceId>", // opcional
           "pushTarget": "origin HEAD" // opcional, default = rama actual → upstream
         }
       }
     }
   }
   ```
3. **`steps` en el output** — el array incluye un paso explícito
   cuando `mode !== 'none'`:

   | Mode | Paso extra |
   |---|---|
   | `none` | (ninguno, igual que hoy) |
   | `commit` | `git add <slice files> && git commit -m "<messageTemplate render>"` |
   | `commit-and-push` | el anterior + `git push <pushTarget>` |

### Prioridad de resolución

`input.persist` (tool call) > `config.plugins.proposals.persist.mode`
> `'none'` (hard default).

### Mensaje de commit — plantilla Conventional Commits

Por defecto, `<messageTemplate: "<area>(<proposalId>): <sliceId>" se
renderiza con:

- `<area>` = primer segmento del path de la propuesta (`docs/proposals`
  vs `plugins/proposals/src/lib/...`). Si no se puede inferir, `chore`.
- `<proposalId>` = `l109` (extraído del filename de la propuesta).
- `<sliceId>` = el id de slice que el orquestador está cerrando (de
  `continue_proposal.mode: 'auto'` o `mode: 'claim'`).

Ejemplo renderizado: `docs(f109): slice-3 implement persist modes`.

### Safety net: nunca pushear a `main` automáticamente

Si `pushTarget` resuelve a `main` (rama actual == `main`), el push se
**rechaza** con `reason: 'refusing to push to main automatically'` y
`auto_work` reporta `persisted: { committed: true, pushed: false,
reason }` en el JSON output. Eso preserva el invariante
"no commit-back loop en main" de AGENTS.md sin tener que validar nada
extra en CI.

## 3. Diseño técnico

### Helper nuevo

`plugins/proposals/src/lib/tools/auto-work-persist.ts`

```ts
export interface IAutoWorkPersistOptions {
  readonly mode: 'none' | 'commit' | 'commit-and-push';
  readonly messageTemplate?: string;
  readonly pushTarget?: string;
  readonly cwd?: string;
  readonly git?: IGitRunner; // inyectado (default: el real via execFile)
}

export interface IPersistResult {
  readonly committed: boolean;
  readonly pushed: boolean;
  readonly hash?: string;
  readonly reason?: string;
}

export const maybePersistAfterSlice = async (
  files: readonly string[],
  proposalId: string,
  sliceId: string,
  options: IAutoWorkPersistOptions,
): Promise<IPersistResult>;
```

- Usa el `git-runner` ya existente (async `execFile`, no bloquea el
  event loop, mockable).
- Si `git` no está en PATH, devuelve `{ committed: false, pushed:
  false, reason: 'git not installed' }` — **nunca** lanza.
- Si el commit/push falla, devuelve `reason: stderr[0]` y
  `committed/pushed` reflejan qué se logró.

### Tool `auto_work` — cambios mínimos

- Lee `IAutoWorkToolOptions.persist` (nuevo, opcional).
- Acepta `args.persist` (input) y sobrescribe el del config.
- Renderiza `steps` con 0/1/2 pasos extra según el modo resuelto.
- Devuelve un campo nuevo en el JSON output:
  ```ts
  { ..., persist: { mode: 'commit', committed: true, pushed: false, hash: 'abc1234' } }
  ```
  (el helper se llama **dentro** del step 5 del flujo; si la slice
  todavía no se cerró, el campo queda con `committed: false`.)

### Config manifest

`mcp-vertex.config.json#plugins.proposals.persist` ya no es free-form:
pasa a tener **JSON Schema** validado por
`scripts/generate-config-schema.ts` (igual que el resto).

## 4. Slices (cerrar en este orden)

| # | Slice | Cambios | Archivos | Tests |
|---|---|---|---|---|
| s1 | Tipos + opciones | Añadir `IAutoWorkPersistOptions`, extender `IAutoWorkToolOptions` | `auto-work.tool.ts` (types only) | sin tests nuevos |
| s2 | Helper `maybePersistAfterSlice` | Nueva función pura, mockable, no lanza | `auto-work-persist.ts` (nuevo) | 6 tests: none / commit / commit-and-push / git-missing / push-to-main-rejected / template-default |
| s3 | Tool `auto_work` acepta input + renderiza `steps` | Cargar config, resolver prioridad, inyectar paso extra al array | `auto-work.tool.ts` | 4 tests: input override / config default / steps count por modo / persist JSON output |
| s4 | Config manifest + i18n + docs | Añadir keys a `apps/web/src/i18n/ui.ts` (12 idiomas), actualizar `plugins/proposals/README.md`, propuesta cerrada | varios | validate + site:strict verdes |

## 5. Riesgos y mitigaciones

| Riesgo | Mitigación |
|---|---|
| Push a `main` rompe el invariante "no CI loop" | Safety net: `main` → push rechazado, `committed: true, pushed: false` |
| `git add <files>` añade paths fuera de la slice (drift de `claim`) | El helper recibe `files` desde `claim.files`; no hace `git add .` jamás |
| Race con `agent-worktree` por `.git/index` | El orquestador corre en su propio worktree (`agent/<name>`), el helper opera dentro de ese worktree, no hay colisión |
| `git` no instalado en runtime | Helper degrada a `{ committed: false, pushed: false, reason: 'git not installed' }` — el flujo sigue, el agente decide qué hacer |
| Token budget de `auto_work` crece | El output sigue por debajo de 200 tokens; el campo `persist` se omite si `mode === 'none'` |

## 6. Definición de done

- `bun run validate` verde (typecheck + lint + tests).
- 10 tests nuevos (s2 + s3), todos pasan.
- `bun run types:generate` regenera el `outputSchema` de `auto_work`
  con el campo `persist` opcional.
- `bun run site:strict` verde (la página del tool ahora documenta los
  3 modos en 12 idiomas).
- 4 commits convencionales:
  1. `feat(proposals): add persist modes to auto_work` (s1 + s3)
  2. `feat(proposals): add maybePersistAfterSlice helper with safety net` (s2)
  3. `docs(proposals): persist modes manifest + plugin README` (s4 docs)
  4. `docs(proposals): close f109 first slice with status note`
- CHANGELOG actualizado.

## 7. Por qué **plugin config** y no solo "instrucción en AGENTS.md"

| Criterio | `AGENTS.md` | Plugin config |
|---|---|---|
| Lo cumplen todos los orquestadores | a veces | siempre (config tipada) |
| Detectas drift | no | sí (validate + config schema) |
| Lo sobreescribes por proyecto | no | `mcp-vertex.config.json` |
| Lo testeas unitariamente | no | sí (6 tests del helper) |
| Lo activas/desactivas sin redeploy | no | flag `persist.mode` |

## 8. Decisiones tomadas (esta sesión)

| Decisión | Elección | Por qué |
|---|---|---|
| Default | `none` | Preserva el comportamiento actual ("analizo antes") |
| Push target | Configurable, default `origin HEAD` | Cada worktree puede tener su upstream |
| Plantilla | Conventional Commits por área | Coherente con `derive-version.ts` |
| Main branch | Nunca pushea automáticamente | Safety net, invariante AGENTS.md |
| Input override | Sí (tool input) | El orquestador decide por slice si hace falta push |

## 9. Estado

- s1: ✅ hecho (commit `5bd32c6`, "add maybePersistAfterSlice helper (f109 s1+s2)" — los tipos `IAutoWorkPersistConfig` y la extensión de `IAutoWorkToolOptions`).
- s2: ✅ hecho (mismo commit `5bd32c6` — el helper `maybePersistAfterSlice` + 11 tests).
- s3: ✅ hecho (commit `ab5de2e` "add persistence modes (none, commit, commit-and-push) and update related tests" — tool `auto_work` carga config, resuelve prioridad, inyecta paso extra; 4 tests nuevos).
- s4: ✅ hecho (commits `6fe3500` "stop mutating readonly IAutoWorkToolOptions.persist in spec" + este commit — README del plugin documenta los 3 modos, propuesta cerrada).

## 10. Referencias

- [plugins/proposals/src/lib/tools/auto-work.tool.ts](../../plugins/proposals/src/lib/tools/auto-work.tool.ts) — tool a extender.
- [plugins/proposals/src/lib/shared/git-runner.ts](../../plugins/proposals/src/lib/shared/git-runner.ts) — runner async no-bloqueante a reusar.
- [plugins/proposals/src/lib/tools/agent-worktree.tool.ts](../../plugins/proposals/src/lib/tools/agent-worktree.tool.ts) — `agent/<name>` por orquestador, evita colisiones.
- [AGENTS.md](../../AGENTS.md) — invariante #6 ("no commit-back loop on main").
- [docs/PLUGINS-MCP-VERTEX.md](../PLUGINS-MCP-VERTEX.md) — contrato de plugins (config tipada).