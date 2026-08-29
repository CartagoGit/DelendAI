# Guía de configuración de plugins — mcp-vertex para LLMs

> **Fuente de verdad: el servidor.** Esta guía **no** enumera la lista completa
> de plugins ni de tools (cambia cada semana). Para saber qué hay cargado
> ahora mismo pregunta siempre al servidor, nunca a una lista copiada de una
> sesión anterior:
>
> - `mcp-vertex_overview { compact: true }` — plugins y tools activos.
> - `mcp-vertex_agent_catalog { mode: "compact" }` — catálogo accionable
>   (propuestas, skills, counts) sin repetir la lista de tools.
> - `mcp-vertex_plugin_search` — búsqueda de plugins.
> - `mcp-vertex_init_config` — deriva una config recomendada desde el proyecto real.

## 1. Modelo mental

- El **core** es agnóstico: no sabe de git, ni de reglas, ni de propuestas.
  Toda la capacidad de dominio vive en **plugins**.
- Un plugin se carga por una de estas vías (precedencia: flag > config > preset):
  1. **Preset** — `--preset=minimal`, `lean`, `standard`, `swarm`, `full`,
     `vertex`, o un stack pack (`web-app`, `backend-api`, `cli-tool`).
  2. **Lista explícita** — `--plugins=<a>,<b>,<c>` (o `--exclude-plugins=<x>`).
  3. **Config del proyecto** — `plugins.<id>` en `mcp-vertex.config.json`
     (opciones, `prefix`, `enabled`, `origin`).
- `mcp-vertex.config.json` es la **autoridad del proyecto**: fija opciones por
  plugin y puede activar/desactivar entradas; el preset/flag solo decide qué
  se carga. El esquema (`$schema`) valida la config de forma estricta.

## 2. Primera vez en un proyecto nuevo

1. `mcp-vertex_overview { compact: true }` — orientarse: qué hay cargado.
2. `mcp-vertex_init_config { write: false }` — ver la config recomendada
   (preset + plugins + rationale); `write: true` la persiste sin pisar una
   config válida existente (`overwrite: true` solo para reemplazar a propósito).
3. Ajusta por necesidad con los ejemplos de la §3.
4. Deja el archivo de instrucciones del host (`AGENTS.md`, `CLAUDE.md`,
   `.github/copilot-instructions.md`, Cursor/Aider/…) como **puntero** a
   `AGENT-BOOTSTRAP.md` (§7/§8) — no copies reglas dentro del host.

## 3. Configuración por necesidad

### 3.1 Commit y push en nombre del autor

El plugin `git` expone herramientas de escritura **opt-in**:

- `plugins.git.options.allowWrite: true` registra `_commit` y `_push`
  (efecto write). Sin esto solo existen las tools de solo-lectura
  (`status`, `changed`, `diff`, `log`, `blame`, `show`, `worktree`).
- `commitAuthor` (nivel raíz) fija quién firma los commits:
  - `mode: "git"` (por defecto) — usa `git config user.name/email` del repo.
    Firma con tu identidad sin tocar nada.
  - `mode: "named"` — `humanName` + `humanEmail` (+ `modelName`) fijos,
    portables entre máquinas: `"Nombre (modelo)" <email>`.
  - `mode: "agent"` / `"bot"` — atribuyen al agente, no a la persona.

```jsonc
{
	"commitAuthor": { "mode": "git" },
	"plugins": {
		"git": { "options": { "allowWrite": true, "allowForge": true } }
	}
}
```

El bootstrap §5 (*Definition of done*) obliga a commitear y pushear al terminar
cada tarea, en la identidad configurada. El autor se resuelve **centralmente**
en el core, así que el agente no pregunta de quién es el nombre y no deja
trabajo terminado sin commitear.

### 3.1 Política global de agentes

La sección raíz `core` contiene la configuración propia del core. Su bloque
`core.agentPolicy` define el modo de trabajo y los principios de ingeniería que
el core incluye en el prompt canónico de bootstrap. Todos los hosts que consumen
ese prompt reciben la misma política efectiva:

```jsonc
{
  "core": {
    "agentPolicy": {
      "autonomous": true,
      "principles": [
        "Apply SOLID architecture where it improves ownership and changeability.",
        "Use good engineering practices and keep the code clear and maintainable.",
        "Reuse existing code and abstractions before introducing duplication.",
        "Keep naming, files, and folders homogeneous with the surrounding project."
      ]
    }
  }
}
```

Si `core` o `core.agentPolicy` se omite, el core usa esos mismos valores por
defecto. Cada campo configurado reemplaza únicamente su default: por ejemplo,
`{"core":{"agentPolicy":{"autonomous":false}}}` conserva los cuatro
principios y pide al agente que no ejecute trabajo autónomo sin confirmación.
Los proyectos pueden definir sus propios principios en `principles`; deben
describir reglas del proyecto, no depender de un plugin concreto.

### 3.2 Clean code, SOLID, código mantenible y reutilización

Ya es el **default no negociable** (bootstrap §6). Los plugins que lo
materializan y verifican:

- `rules` — presets de lint/type por framework + detección por área + modo de
  enforcement (`strict` | `mixed` | `none` | `proposal`). El linter/tsconfig
  propio del proyecto **siempre gana**.
- `quality` — resuelve qué comandos de validación correr por scope.
- `conventions` — clasifica rutas en roles canónicos y reporta drift de
  convenciones de archivos.
- `test-convention` — layout canónico de tests (`*.spec.ts` colocado y nombrado).

En un proyecto no-monorepo, acota las raíces a su forma real:

```jsonc
{
	"plugins": {
		"conventions": { "options": { "roots": ["src", "lib"] } },
		"rules": { "options": { "mode": "strict" } }
	}
}
```

No hace falta recordárselo a cada agente: el invariant §6 ya lo exige, y
`rules_get_rules` / `rules_check_rules` / `rules_apply_rules` lo verifican.

### 3.3 Arquitectura de carpetas, naming y archivos

- `conventions_check` reporta drift contra el perfil canónico de convenciones
  (`FILE-CONVENTIONS.md`); `conventions_classify` clasifica rutas sueltas.
  Ajusta `roots` a la forma real del proyecto.
- El naming sigue el contrato del bootstrap §6: interfaces `IFoo`, un barrel
  por paquete (`src/public/index.ts`), specs colocalizados. Para el monorepo de
  mcp-vertex, `REPO-RULES.md` §12 concreta esas reglas; un proyecto adoptante
  adapta ese bloque a su propia forma de monorepo.

## 4. Reglas para no romper nada

- No listar hardcoded todos los plugins/tools/skills en archivos del host:
  pregunta al servidor.
- Cada plugin valida sus opciones con su `OptionsSchema`; una opción mal
  tipada se rechaza al arrancar (no se ignora en silencio).
- La config del proyecto manda sobre los presets por defecto: no luches
  contra el linter/tsconfig propios.

## 5. Dónde está la verdad

- `AGENT-BOOTSTRAP.md` — reglas universales de agente (Definition of done,
  invariantes, host appendices).
- `CROSS-PROJECT-SETUP.md` — primer arranque + presets + auth de GitHub.
- `PLUGINS-MCP-VERTEX.md` — cómo se **autoriza** un plugin (si creas uno).
- `README-MCP-VERTEX.md` — flags de CLI y presets.
- `FILE-CONVENTIONS.md` — perfil canónico de convenciones de archivos.
