# @delendai/container

Read-only container inspection, Docker log tailing, and offline Dockerfile lint
for `@delendai/core`.

## Load it

```bash
delendai --plugins=container
```

Registers `<prefix>_container_inspect`, `<prefix>_container_logs`, and
`<prefix>_container_lint`, `<prefix>_container_build`, `<prefix>_k8s_apply`
and the Docker tools below. The Docker tools change something only in a
repository that uses Docker (a root `Dockerfile`, compose file or
`.devcontainer/`). Elsewhere they only read, and any change is refused with
the reason.

## Tools

### `<prefix>_container_inspect`

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

Missing `docker` or `kubectl` returns:

```json
{
	"ok": "skipped",
	"hint": "`docker` not found on PATH. Install with `apt-get install -y docker.io` and retry."
}
```

### `<prefix>_container_logs`

Input:

```json
{
	"container": "api",
	"tail": 50,
	"since": "2026-07-26T12:00:00Z"
}
```

Output:

```json
{
	"ok": true,
	"container": "api",
	"lines": [
		{
			"timestamp": "2026-07-26T12:00:01.000Z",
			"stream": "stdout",
			"message": "server ready"
		}
	]
}
```

The tool shells out only through `docker logs --tail N --timestamps`; parsing
is pure and deterministic in tests.

### `<prefix>_container_lint`

Input:

```json
{
	"dockerfilePath": "apps/web/Dockerfile"
}
```

If `dockerfilePath` is omitted, the tool reads `Dockerfile` at the workspace
root. Escaped paths return `containment-violation`; missing files return
`not-found`.

Current built-in rules:

- `DL3001` — unpinned or `latest` base image
- `DL3008` — `apt-get install` without `apt-get update`
- `DL3025` — shell-form `CMD`/`ENTRYPOINT`
- `DL3042` — `apk add` without `--no-cache`
- `DL3047` — `wget` without checksum verification

Example findings:

```json
{
	"ok": true,
	"findings": [
		{
			"ruleId": "DL3001",
			"severity": "low",
			"message": "Pin the base image to a non-latest tag or digest.",
			"location": {
				"file": "Dockerfile",
				"line": 1
			}
		}
	]
}
```

All normalization stays in pure parsers and rules so the lint works fully offline.

## Docker tools

Each one runs the `docker` CLI, and every one follows the same consent rules.

| Tool | What it does | Consent |
| --- | --- | --- |
| `<prefix>_container_pull` | Pull an image. With `policy: "if-not-present"` (the default), it pulls only when the image is missing. | `confirm` |
| `<prefix>_container_run` | Run a container. It gets `--rm` unless you give it a `name`. | `confirm`; `confirmRisk` when it reaches the host |
| `<prefix>_container_exec` | Run a command in a running container. | `confirm` |
| `<prefix>_container_compose` | `services` lists the compose file's services: their ports, the names of their environment variables, and their mounts. `ps` and `logs` read. `up`, `down` and `exec` act on the project's compose file. `up` starts one `service` unless you pass `all: true`. | `confirm` for `up`, `down` and `exec` |
| `<prefix>_container_network` | `ls`, `inspect`, `create` or `rm` a network. | `confirm` for `create` and `rm` |
| `<prefix>_container_volume` | `ls`, `inspect`, `create` or `rm` a volume. | `confirm` for `create` and `rm` |

`dryRun: true` returns the exact `docker` command and runs nothing.

## Safety

- **Nothing changes without `confirm: true`.** Reading commands (`ps`, `logs`, `ls`, `inspect`, `services`) need no consent.
- **Reaching the host needs its own consent.** Some containers hand the host to whatever runs inside them: a privileged container, a container with the docker socket mounted, or one sharing the host's network, process or IPC namespace. Such a container runs only with `confirmRisk: true`, and `confirm` never implies it, so a script that confirms every call still cannot start one by accident. The refusal lists exactly what the container would reach, so a person can approve that and nothing more. A compose `up` checks the same risks for every service it would start.
- **Environment values are never returned.** `services` lists variable names only. A compose file keeps its secrets in those values.
- **What is out of scope.** There is no host-wide clean-up (`system prune`), no registry push, no socket adapter, and no Podman.
