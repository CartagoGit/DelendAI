# `@delendai/commit-policy`

> Plugin de autoridad de commit para `@delendai/core`. Política configurable
> de identidad, cadencia y rastro de auditoría sobre las primitivas del plugin
> [`git`](../../git). **Desactivado por defecto** — hay que activarlo desde
> `delendai.config.json`.

## Qué hace

`@delendai/git` ya expone `git_commit` / `git_push`, pero solo como primitivas:
cada agente tiene que elegir el autor, decidir cuándo empujar y recordar añadir
un trailer de auditoría. `commit-policy` envuelve esas primitivas con tres
políticas configurables y expone cinco herramientas para conducir el motor:

| Herramienta                               | Propósito                                                                        |
| ----------------------------------------- | -------------------------------------------------------------------------------- |
| `commit_policy_status`                    | Instantánea de solo lectura de la configuración efectiva.                        |
| `commit_policy_commit`                    | Commit a través del motor (identidad + auditoría + rechazo de ramas protegidas). |
| `commit_policy_push`                      | Push a través del motor (rechazo de ramas protegidas + política de force).       |
| `commit_policy_run`                       | Disparar manualmente cualquier disparador configurado.                           |
| `commit_policy_refresh_branch_protection` | Actualizar bajo demanda la protección remota de ramas.                           |

El motor **está desactivado por defecto**: ningún host verá un solo commit a
menos que lo active explícitamente.

## Configuración

```jsonc
// delendai.config.json
{
  "plugins": {
    "commit-policy": {
      "options": {
        "commit":   { "enabled": true },
        "push":     { "enabled": true, "onCommit": true },
        "cadence":  { "triggers": [{ "kind": "slice" }] },
        "identity": { "mode": "explicit", "owner": { "name": "Cartago", "email": "cartago@example.com" } }
      }
    }
  }
}
```

| Knob                           | Por defecto        | Qué controla                                                                                                               |
| ------------------------------ | ------------------ | -------------------------------------------------------------------------------------------------------------------------- |
| `commit.enabled`               | `false`            | Interruptor maestro — ningún commit sin `true`.                                                                            |
| `commit.requireConventional`   | `true`             | Rechaza mensajes que no sean Conventional Commit.                                                                          |
| `commit.autoScopeFromProposal` | `true`             | Convierte `feat: x` en `feat(<proposalId>): x` cuando hay contexto de slice.                                               |
| `identity.mode`                | `"global"`         | Uno entre `explicit / agent / repo / global / env / auto`.                                                                 |
| `cadence.triggers`             | `[]`               | Array vacío = ningún commit automático; solo funciona `commit_policy_run`.                                                 |
| `audit.trailer`                | `"co-authored-by"` | `"none" \| "co-authored-by" \| "body-metadata"`.                                                                           |
| `push.enabled`                 | `false`            | Interruptor maestro — ningún push sin `true`.                                                                              |
| `push.onCommit`                | `false`            | Push inmediato tras cada commit.                                                                                           |
| `push.force`                   | `"with-lease"`     | `"with-lease" \| "allow" \| "never"`.                                                                                      |
| `push.protectedBranches`       | `[]`               | Los nombres exactos configurados aquí quedan protegidos; no se asumen nombres.                                             |
| `push.providerByHost`          | _ninguno_          | Mapa opcional de host a proveedor para remotos GitHub/GitLab autoalojados, por ejemplo `{ "git.example.test": "gitlab" }`. |

La protección remota se actualiza manualmente mediante
`commit_policy_refresh_branch_protection`. El adaptador usa `push.remote` si
está configurado, después el remoto upstream actual y finalmente `origin` como
compatibilidad. Los hosts públicos de GitHub y GitLab se soportan mediante sus
CLI autenticadas; los hosts autoalojados pueden mapearse con
`push.providerByHost`; los hosts sin mapear devuelven el estado explícito
`unsupported` y conservan la configuración local. El refresh no se ejecuta al registrar el
plugin salvo que el host establezca explícitamente
`DELENDAI_COMMIT_POLICY_REFRESH_BRANCH_PROTECTION_ON_REGISTER=true`.

### Reglas de ramas

Antes de hacer commit o push automático, consulta `commit_policy_status` y su
campo `branchPolicy`:

- `push.protectedBranches` y `push.protectedPrefixes` son la única fuente local de protección; ambos empiezan como listas vacías.
- Cualquier otra rama permite commit y push directo cuando `commit.enabled` y
  `push.enabled` están activados.
- Cualquier rama, incluida `main`, `develop` y `master`, permite commit y push directo si no aparece en esas listas configuradas y los interruptores correspondientes están activos.
- La comprobación remota está disponible mediante
  `commit_policy_refresh_branch_protection`. El resultado incluye `fresh`,
  `stale`, `unsupported` o `error`, junto con el remoto y las ramas efectivas.
  Los remotos no soportados y la falta de autenticación no sustituyen la
  política local.

### Modos de identidad

| Modo       | Resuelve a                                                                                   |
| ---------- | -------------------------------------------------------------------------------------------- |
| `explicit` | El owner declarado en `identity.owner` (suministrado por el host).                           |
| `agent`    | La identidad del LLM (`host + model`) cuando está conectada; si no, la config global de git. |
| `repo`     | `git config user.name / user.email` del repo, con fallback a global.                         |
| `global`   | `git config --global user.name / user.email`.                                                |
| `env`      | `GIT_AUTHOR_NAME` + `GIT_AUTHOR_EMAIL` desde el entorno del proceso.                         |
| `auto`     | Prioridad determinista: `env → global → repo → agent`.                                       |

### Tipos de disparador

| Tipo        | Se dispara cuando                                                                                                            |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `slice`     | Un slice de `proposals` transiciona a un estado configurado (por defecto `done`). Sondea el `index.json` cada 1 s.           |
| `threshold` | `git status --porcelain` reporta al menos N archivos sucios (por defecto 10). Solo manual.                                   |
| `interval`  | Han pasado al menos N minutos desde el último disparo y el árbol está sucio. Se ejecuta automáticamente cuando se configura. |
| `manual`    | Siempre disponible, independientemente de `cadence.triggers`.                                                                |

## Por qué desactivado por defecto

El plugin es **conservador por diseño**. Los hosts deben activar
explícitamente los commits (`commit.enabled`) y los pushes (`push.enabled`)
para que una adopción accidental nunca produzca un commit no deseado,
mucho menos un push. Los valores por defecto son seguros: cargar el plugin
sin opciones es un no-op.

## Dogfooding en este repo

La `delendai.config.json` raíz lo activa con:

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
el owner explícito configurado y empuja el resultado a `origin/develop` (con
`--force-with-lease`). Solo se rechazan las ramas incluidas en
`push.protectedBranches` o que coincidan con `push.protectedPrefixes`; `main` y
`master` no reciben un trato especial.

## Licencia

BSD-3-Clause © Cartago