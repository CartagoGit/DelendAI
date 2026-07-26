# @mcp-vertex/container

Read-only Docker and Kubernetes inspection plugin for
[@mcp-vertex/core](../../packages/core).

## Load it

```bash
mcp-vertex --plugins=container
```

Registers `<prefix>_container_ps`, `<prefix>_container_images` and
`<prefix>_k8s_get`.

## Tools

- `<prefix>_container_ps` `{ all? }` lists containers from the host Docker CLI.
- `<prefix>_container_images` `{ all? }` lists local images from Docker.
- `<prefix>_k8s_get` `{ kind, name?, namespace? }` reads Kubernetes resources via `kubectl get ... -o json`.

All tools are read-only. Missing `docker` or `kubectl` returns a structured
`install-missing` envelope with an install hint instead of crashing.# @mcp-vertex/container

Read-only container inspection for `@mcp-vertex/core`.

## S1

The plugin ships one tool in S1:

- `container_inspect`

Input:

```json
{
	"kind": "docker-ps"
}
```

Supported kinds:

- `docker-ps` — wraps `docker ps --format '{{json .}}'`
- `docker-images` — wraps `docker images --format '{{json .}}'`
- `k8s-get` — wraps `kubectl -n <namespace> get pods -o json`

The tool is safe to load on hosts without Docker or Kubernetes CLIs. When the
requested CLI is missing from `PATH`, it returns:

```json
{
	"ok": "skipped",
	"hint": "`docker` not found on PATH. Install with `apt-get install -y docker.io` and retry."
}
```

The inspect parsers are pure string-to-structure transforms with injected exec
dependencies in the runner, so tests never shell out and never probe the real
host environment.