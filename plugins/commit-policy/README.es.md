# `@mcp-vertex/commit-policy`

> Plugin de autoridad de commit para `@mcp-vertex/core`. Política configurable
> de identidad, cadencia y rastro de auditoría sobre las primitivas del plugin
> [`git`](../../git). **Desactivado por defecto** — hay que activarlo desde
> `mcp-vertex.config.json`.

## Qué hace

`@mcp-vertex/git` ya expone `git_commit` / `git_push`, pero solo como primitivas:
cada agente tiene que elegir el autor, decidir cuándo empujar y recordar añadir
un trailer de auditoría. `commit-policy` envuelve esas primitivas con tres
políticas configurables y expone cuatro herramientas para conducir el motor:

| Herramienta | Propósito |
|---|---|
| `commit_policy_status` | Instantánea de solo lectura de la configuración efectiva. |
| `commit_policy_commit` | Commit a través del motor (identidad + auditoría + rechazo de ramas protegidas). |
| `commit_policy_push` | Push a través del motor (rechazo de ramas protegidas + política de force). |
| `commit_policy_run` | Disparar manualmente cualquier disparador configurado. |

El motor **está desactivado por defecto**: ningún host verá un solo commit a
menos que lo active explícitamente.

## Configuración

```jsonc
// mcp-vertex.config.json
{
  "plugins": {
    "commit-policy": {
      "options": {
        "commit":   { "enabled": true },
        "push":     { "enabled": true, "onCommit": true },
        "cadence":  { "triggers": [{ "kind": "slice" }] },
        "identity": { "mode": "global" }
      }
    }
  }
}
```

| Knob | Por defecto | Qué controla |
|---|---|---|
| `commit.enabled` | `false` | Interruptor maestro — ningún commit sin `true`. |
| `commit.requireConventional` | `true` | Rechaza mensajes que no sean Conventional Commit. |
| `commit.autoScopeFromProposal` | `true` | Convierte `feat: x` en `feat(<proposalId>): x` cuando hay contexto de slice. |
| `identity.mode` | `"global"` | Uno entre `explicit / agent / repo / global / env / auto`. |
| `cadence.triggers` | `[]` | Array vacío = ningún commit automático; solo funciona `commit_policy_run`. |
| `audit.trailer` | `"co-authored-by"` | `"none" \| "co-authored-by" \| "body-metadata"`. |
| `push.enabled` | `false` | Interruptor maestro — ningún push sin `true`. |
| `push.onCommit` | `false` | Push inmediato tras cada commit. |
| `push.force` | `"with-lease"` | `"with-lease" \| "allow" \| "never"`. |
| `push.protectedBranches` | `["main", "master"]` | Push siempre rechazado a estas ramas. |

### Modos de identidad

| Modo | Resuelve a |
|---|---|
| `explicit` | El owner declarado en `identity.owner` (suministrado por el host). |
| `agent` | La identidad del LLM (`host + model`) cuando está conectada; si no, la config global de git. |
| `repo` | `git config user.name / user.email` del repo, con fallback a global. |
| `global` | `git config --global user.name / user.email`. |
| `env` | `GIT_AUTHOR_NAME` + `GIT_AUTHOR_EMAIL` desde el entorno del proceso. |
| `auto` | Prioridad determinista: `env → global → repo → agent`. |

### Tipos de disparador

| Tipo | Se dispara cuando |
|---|---|
| `slice` | Un slice de `proposals` transiciona a un estado configurado (por defecto `done`). Sondea el `index.json` cada 5 s. |
| `threshold` | `git status --porcelain` reporta al menos N archivos sucios (por defecto 10). Solo manual. |
| `interval` | Han pasado al menos N minutos desde el último disparo y el árbol está sucio. Solo manual. |
| `manual` | Siempre disponible, independientemente de `cadence.triggers`. |

## Por qué desactivado por defecto

El plugin es **conservador por diseño**. Los hosts deben activar
explícitamente los commits (`commit.enabled`) y los pushes (`push.enabled`)
para que una adopción accidental nunca produzca un commit no deseado,
mucho menos un push. Los valores por defecto son seguros: cargar el plugin
sin opciones es un no-op.

## Dogfooding en este repo

La `mcp-vertex.config.json` raíz lo activa con:

```jsonc
"commit-policy": {
  "options": {
    "commit":   { "enabled": true },
    "push":     { "enabled": true, "onCommit": true, "force": "with-lease",
                  "protectedBranches": ["main", "master"],
                  "remote": "origin", "branch": "develop" },
    "cadence":  { "triggers": [{ "kind": "slice" }] },
    "identity": { "mode": "global" }
  }
}
```

Es decir: cada vez que un slice transiciona a `done`, el motor commitea como
el usuario global de git de la máquina y empuja el resultado a `origin/develop`
(con `--force-with-lease`). Rechaza `main`/`master`.

## Licencia

BSD-3-Clause © Cartago