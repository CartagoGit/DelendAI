# @mcp-vertex/github

Proveedor GitHub read-only para @mcp-vertex/core. Funciona sin plugin-git, sin checkout local y sin depender de un remote origin.

## Activación

Carga el plugin `github` y aporta el token solo por entorno:

```sh
export GITHUB_TOKEN=...
```

Para GitHub Enterprise Server, define también:

```sh
export GITHUB_API_URL=https://ghe.example/api/v3
```

Si no defines `GITHUB_API_URL`, el plugin usa GitHub.com. Si el checkout local existe, puedes combinarlo con contexto local desde otro plugin o agente, pero este plugin sigue siendo usable por sí solo y no requiere `plugin-git`.

Opcionalmente puedes fijar repositorio por defecto con variables de entorno o con opciones del plugin:

- `GITHUB_OWNER`
- `GITHUB_REPOSITORY`
- `defaultRepository.owner`
- `defaultRepository.repository`

No pongas el token en `mcp-vertex.config.json`, argumentos de tools, snapshots ni logs.

## Alcance

La superficie actual es solo de lectura:

- contexto del proveedor
- repositorios y búsqueda acotada
- metadata de variables de Actions sin valores
- issues y pull requests con comentarios/reviews donde aplica
- commits, statuses y check runs
- workflows, runs, jobs y logs truncados
- artifacts, releases, tags y deployments

Los artifacts se exponen como metadata y snapshot opcional en cache del plugin; no descargan payloads grandes. Los logs admiten truncación por bytes, líneas y presupuesto temporal, con metadatos explícitos de truncación.

Todas las tools devuelven envelopes compactos con `inputSchema` y `outputSchema` tipados, paginación explícita cuando aplica, límites acotados y errores normalizados. No exponen respuestas HTTP crudas ni capacidades mutables.

La superficie read-only está probada de forma hermética para respuestas HTTP 200, paginación, 401, 403, 404, 429, timeout, respuesta inválida, rate limits y truncación. Nunca imprime el valor del token en errores, logs, snapshots ni outputs estructurados; solo conserva la procedencia del token como metadata segura, por ejemplo `env:GITHUB_TOKEN`.

## Permisos mínimos

Usa un token read-only con los permisos mínimos necesarios para metadata de repositorio, contents, issues, pull requests, Actions/checks, releases y deployments según la superficie que vayas a consultar.

## Comportamiento operativo

- GitHub.com y GitHub Enterprise Server usan el mismo contrato read-only; cambia solo la base URL y el host reportado por la tool de contexto.
- Las respuestas con 401, 403, 404, 429, timeout o payload inválido devuelven envelopes normalizados y accionables.
- El plugin no usa red real en sus tests y no depende del plugin git para resolver repositorio remoto ni estado local.