# @delendai/container

Read-only container inspection, Docker log tailing, and offline Dockerfile lint
for `@delendai/core`.

## Load it

```bash
mcp-vertex --plugins=container
```

Registers `<prefix>_container_inspect`, `<prefix>_container_logs`, and
`<prefix>_container_lint`.

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
