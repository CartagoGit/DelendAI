---
id: f00418
title: "Autodeteccion de terminal y herramientas del shell para agentes LLM"
kind: feat
status: ready
type: proposal
track: quality
date: 2026-09-03
---

# f00418 — Autodeteccion de terminal y herramientas del shell para agentes LLM

## Goal

Que el core exponga, de forma consultable y cacheada en runtime, el inventario
completo de capacidades del terminal donde el agente ejecuta comandos:

1. **Tipo de shell/terminal**: qué intérprete hay (`bash`, `zsh`, `dash`, `sh`,
   `pwsh`, `cmd`, `fish`), qué dialecto soporta (pipes, heredocs, `$(...)`,
   `[[ ]]`, arrays, `set -o pipefail`, `timeout`, `stdbuf`), y qué modo de
   invocación es seguro (`sync` con stdout capturado vs `async` con polling).
2. **Herramientas disponibles**: qué binarios existen en `PATH` (de la lista de
   herramientas que el agente/los plugins necesitan: `git`, `bun`, `node`,
   `rg`, `jq`, `gh`, `docker`, `python3`, …), con qué versiones, y cuáles
   faltan.
3. **Sugerencias de instalación**: para cada herramienta faltante, sugerir al
   usuario el comando de instalación adecuado para el gestor de paquetes
   detectado (`apt`, `brew`, `bun`, `npm`, `go install`, `cargo`, …), o la
   alternativa ya disponible en el sistema.
4. **Detección de trampas interactivas**: qué comandos abrirían un pager
   interactivo (`git log` sin `--no-pager`, `less`, `more`), qué shells cargan
   init scripts que ensucian stdout (zsh + p10k instant prompt), y qué
   flags de aislamiento (`--noprofile --norc`, `--no-pager`, `GIT_PAGER=cat`,
   `PAGER=cat`) hay que anteponer.

El objetivo operativo: **el agente deja de adivinar**. En el arranque (o en la
primera llamada que necesite shell) obtiene un snapshot O(1) del entorno y
sabe, antes de lanzar nada, qué comandos funcionarán, cuáles bloquearían, y qué
debería pedirle al usuario que instale.

## why

Los agentes pierden turnos enteros (y a veces se cuelgan) por no saber con qué
terminal hablan:

- **Bucles de reintento ciego**: el agente lanza `git log` → abre `less` → el
  wrapper detecta "buffer alternativo" → reintenta igual → bucle. El
  shell-fallback ladder de `withShellFallback` mitiga el síntoma pero no elimina
  la causa: el agente no sabía que ese terminal pagina por defecto.
- **Dialectos incompatibles**: comandos escritos para `bash` que en `dash`/`ash`
  fallan silenciosamente (`[[ ]]`, arrays, `$(...)` anidado). El AGENT-BOOTSTRAP
  ya prohíbe `zsh`/`sh` por esto mismo (§6, regla bash-only) — pero esa regla es
  documentación estática; nada en runtime verifica que la regla se cumpla en el
  ordenador concreto donde el agente aterriza.
- **Bloqueos interactivos** (`q`, Ctrl+C, Enter para continuar): el agente se
  queda esperando stdin que nunca llega, o lo consume mal. Saber de antemano
  que el entorno no es interactivo (o que el comando abre pager) evita el
  atasco.
- **Herramientas ausentes**: el agente propone `rg`, `jq` o `gh` y el comando
  falla con `command not found`, gastando un turno. Con inventario previo, el
  agente usa la alternativa disponible (`grep`, `python3 -c`, `git hub`) o
  sugiere al usuario instalar lo que falta, con el comando exacto para su
  gestor de paquetes.
- **Coste en tokens**: cada intento fallido son turnos, salidas de error y
  reintentos que el contexto paga. Un snapshot único al arranque amortiza todo
  el resto de la sesión.

Este problema es hoy resuelto a mano en cada host: Copilot tiene
`run_in_terminal`, Claude Code su propio shell, Codex otro — y todos repiten el
mismo ensayo-y-error. Centralizarlo en el core lo vuelve consultable por
cualquier plugin/host vía una sola tool.

## non-goals

- No modifica el shell-fallback ladder existente (`withShellFallback`) — lo
  consume como fallback de último recurso cuando el snapshot está obsoleto.
- No introduce dependencias binarias nuevas en el core: toda la detección usa
  comandos POSIX/built-in disponibles en el propio terminal detectado.
- No cachea capacidades en disco global: el snapshot vive en la memoria del
  proceso del servidor (un `Map` runtime), con TTL corto y opción de
  `refresh: true`.
- No cambia el contrato `IMcpPluginContext` de plugins ya existentes: la
  superficie se expone como tool del core + tipo exportado, los plugins que la
  quieran la consumen voluntariamente.
- No ejecuta nada interactivo durante la detección: todos los probes son
  no-bloqueantes (timeout duro ≤ 2 s por probe, sin TTY abierto).

## Slices

- global_gate: lint

### S1 — Terminal probe + contratos ICapability

- **Status**: pending
- **Files**: `packages/core/src/lib/services/shell/terminal-probe.service.ts`, `packages/core/src/lib/services/shell/terminal-probe.spec.ts`, `packages/core/src/lib/contracts/interfaces/terminal-capabilities.interface.ts`
- **Gate**: type

Nuevo servicio `TerminalProbeService` (SRP: solo detecta, no ejecuta nada de
negocio):

- `ITerminalCapabilities { shell: { path, name, dialect: 'bash'|'zsh'|'dash'|'sh'|'fish'|'pwsh'|'cmd'|'unknown', version, isLogin, isInteractive, initScriptsLoad: boolean }, supports: { pipes, heredoc, commandSubstitution, arrays, doubleBracket, pipefail, processSubstitution, timeout, stdbuf, ansiColor }, invocation: { safeModes: ('sync'|'async')[], paged: boolean, pagers: string[], recommends: { useBashExplicit: boolean, noPagerFlags: string[], envOverrides: Record<string,string> } } }`.
- Detección en capas, cada probe con timeout duro:
  1. `$SHELL` + `ps -p $$` (o equivalente) para el shell real del proceso.
  2. Probes de dialecto: `[ 1 = 1 ]` vs `[[ 1 = 1 ]]`, `echo ${arr[@]:0:1}`,
     `set -o pipefail`, `<(echo x)`, `timeout 1 true`, `stdbuf -o0 true`.
  3. Detección de pager: `git config --get core.pager` + `echo $PAGER` +
     `command -v less`.
  4. Detección de init scripts que ensucian stdout: comparar
     `<shell> -i -c 'echo __PROBE__'` contra `<shell> -c 'echo __PROBE__'` —
     si difieren, el shell interactivo inyecta ruido (p10k instant prompt).
- Cada resultado incluye `confidence: 'measured' | 'inferred'` — un probe que
  respondió bien es `measured`; si el probe falló por timeout y la capacidad se
  asumió por heurística del dialecto, es `inferred`.
- Los probes se lanzan SIEMPRE vía `/bin/bash -c` (regla §6 del bootstrap) o
  vía el shell detectado en modo no-interactivo (`--noprofile --norc` cuando
  aplique), nunca vía el shell de login del usuario.

### S2 — Inventario de herramientas + sugerencias de instalacion

- **Status**: pending
- **Files**: `packages/core/src/lib/services/shell/tool-availability.ts`, `packages/core/src/lib/services/shell/tool-availability.spec.ts`, `packages/core/src/lib/services/shell/install-suggestions.ts`, `packages/core/src/lib/services/shell/install-suggestions.spec.ts`
- **Gate**: type

- `ToolAvailabilityService`:
  - Recibe la lista canónica de herramientas relevantes (una sola fuente en
    `shell-tool-registry.ts`: cada entrada
    `{ name, purpose, checkCommand, versionFlag, alternatives: string[] }`).
    El registro arranca con las que este repo necesita (git, bun, node, rg,
    jq, gh, docker, python3, go, cargo) y es extensible por hosts.
  - Resolución masiva en un solo fork: `command -v <t1> <t2> …` + bucle
    `--version` con timeout corto, no un fork por herramienta.
  - Devuelve `IToolReport { name, available, path?, version?, alternativesAvailable: string[], suggestInstall: { manager: 'apt'|'brew'|'bun'|'npm'|'go'|'cargo'|'none', command: string, confirmed: boolean } | null }`.
- `InstallSuggestionsService`:
  - Detecta el gestor de paquetes del ordenador, en orden de preferencia:
    `apt`/`dpkg` (Debian/Ubuntu/WSL), `brew` (macOS), `bun`/`npm` (JS), `go
    install`, `cargo`. Devuelve el primero disponible, con
    `confirmed: false` — la sugerencia NUNCA se ejecuta sola, solo se muestra.
  - Para cada herramienta faltante elige: (a) sugerir instalación del original,
    o (b) sugerir usar una alternativa ya disponible (si existe), con razón
    explícita.
  - Texto de salida listo para mostrar al usuario: `"jq no está disponible —
    instala con: sudo apt install jq (o usa python3 -c para JSON puntual)"`.

### S3 — Tool shell_status + skill de consumo

- **Status**: pending
- **Files**: `packages/core/src/index.ts`, `packages/core/src/lib/tools/shell-status.tool.ts`, `packages/core/src/lib/tools/shell-status.spec.ts`, `docs/mcp-vertex/skills/shell-status/SKILL.md`
- **Gate**: lint

- Nueva tool del core `shell_status` con `outputSchema` declarado:
  `{ terminal: ITerminalCapabilities, tools: IToolReport[], suggestedActions: string[], generatedAt, ttlMs }`.
  - `verbose: boolean = false` — modo compacto por defecto (solo resumen y
    quick-wins: dialecto, pager, herramientas faltantes + sugerencias).
  - `refresh: boolean = false` — fuerza re-probe; si no, devuelve snapshot
    cacheado dentro del TTL.
  - `names?: string[]` — filtra el inventario a las herramientas que importan
    para la tarea en curso.
- Snapshot cacheado en un módulo runtime (patrón singleton con TTL; el host es
  un proceso one-shot, así que el ciclo de vida coincide).
- Skill `shell-status` que documenta: cuándo llamarla (primera vez que la
  sesión va a tocar el terminal), cómo interpretar `safeModes`, y qué hacer con
  `suggestInstall` (sugerir al usuario, nunca ejecutar).
- La tool se registra en el catálogo con tags `["orientation","shell"]` para
  que `agent_catalog` la surficie en la fase de orientación.

### S4 — Bootstrap + budget drift guard

- **Status**: pending
- **Files**: `docs/mcp-vertex/AGENT-BOOTSTRAP.md`, `docs/mcp-vertex/CHECKPOINT-ADVISORIES.md`, `packages/core/tests/src/lib/shell-probe-drift.spec.ts`
- **Gate**: lint

- `AGENT-BOOTSTRAP.md` §6: sustituir la regla estática bash-only por la regla
  consultable: *"Agents and tools discover the shell through `shell_status`
  before the first terminal call; bash remains the default target when the
  probe is unavailable."* Se conserva la regla bash como default, pero el
  bootstrap ya no asume: consulta.
- `CHECKPOINT-ADVISORIES.md`: nueva advisory `shell-capability-mismatch` —
  si el runtime detecta (por patrones de error repetidos) que el agente está
  usando comandos que el snapshot dice que no existen o que abren pager, la
  `_meta.checkpointAdvisory` lo surfacia con `nextAction` = llamar
  `shell_status { refresh: true }`.
- Drift guard `shell-probe-drift.spec.ts`: la tool `shell_status` debe responder
  dentro del presupuesto de tokens de orientación (comparar tamaño del payload
  compacto contra baseline, patrón del plugin-drift-budget.spec existente), y
  el payload debe ser proyectable a compacto sin re-probe.

## acceptance

- `shell_status` sin argumentos responde en < 3 s en frío (TTL cacheado) y < 50 ms en caliente, con `outputSchema` válido.
- El dialecto detectado es correcto en bash y dash reales (test con subshell forzado).
- Un entorno sin `rg` produce `suggestInstall` con comando apt/brew correcto y `confirmed: false`.
- Ninguna llamada de la tool deja un proceso abierto: todos los probes tienen timeout ≤ 2 s y se auto-terminan.
- El payload compacto de `shell_status` cabe en el presupuesto de tokens de orientación (drift guard verde).
- La documentación del bootstrap ya no prescribe bash a ciegas: delega en la consulta, con bash como fallback.
