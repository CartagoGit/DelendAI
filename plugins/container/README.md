The container plugin wraps the host's container CLIs for read-only inspection first: it probes docker, podman, and kubectl through the shared external-tool core, returns typed install hints when a CLI is missing, and keeps all output normalization in pure parsers so tests never need a live daemon or cluster.

Tools:
- `container_ps` — list running containers via docker, falling back to podman.
- `container_images` — list local images via docker, falling back to podman.
- `k8s_get` — inspect pods and services from the current kubectl context.
- `container_logs` — planned in S2 for read-only log retrieval.
- `container_lint` — planned in S2 for Dockerfile lint findings.# @mcp-vertex/container

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