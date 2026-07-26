# `@mcp-vertex/container`

Read-only + consent-gated container plugin for `@mcp-vertex/core`: inspect Docker / Kubernetes state, lint Dockerfiles (hadolint-style), tail logs, and build / apply manifests only on explicit consent.

Wraps the host's `docker` / `kubectl` CLIs through the shared r00012 external-tool core (probe + runner + install hint). Never bundles a container engine — install `docker` / `kubectl` yourself. The plugin never bundles hadolint either: missing binaries surface a structured `install-missing` envelope with a one-liner install command instead of crashing.

## Load it

```bash
mcp-vertex --plugins=container
```

Registers three families under your namespace prefix:

- **Inspect** — `container_inspect { kind: "docker-ps" | "docker-images" | "k8s-get", namespace? }`
- **Lint + logs** — `container_lint { path }` (workspace-relative Dockerfile) and `container_logs { container?, tail?, since? }`
- **Mutating** (consent required) — `container_build { tag, dockerfile?, context?, confirm? }` and `k8s_apply { manifest, namespace?, confirm? }`

## Read-only tools

Read-only tools never mutate the host. Missing `docker` / `kubectl` returns a structured `kind: "skipped"` envelope with the first install hint (apt / brew / curl) so the host can surface the one-liner install command instead of crashing.

### `container_inspect`

Single tool with a `kind` discriminator:

- `kind: "docker-ps"` wraps `docker ps --format '{{json .}}'`.
- `kind: "docker-images"` wraps `docker images --format '{{json .}}'`.
- `kind: "k8s-get"` wraps `kubectl -n <namespace> get pods -o json` (default `namespace: "default"`).

Parsers are pure string-to-structure transforms with injected exec dependencies, so tests never shell out and never probe the real host environment.

### `container_lint`

Reads a workspace-relative Dockerfile and lints it with built-in hadolint-style rules (DL3002, DL3009, DL3015, DL3042, DL4000 subset). Pure: no binary required. Returns normalized findings with the shared r00012 `IFinding` shape (ruleId / severity / message / location / optional fix).

### `container_logs`

Tails `docker logs` for a running container. Read-only. Missing docker → install hint, never a crash.

## Mutating tools (consent required)

Mutating tools refuse to execute without `confirm: true` in the payload. The default is refusal — the tool returns `{ ok: false, reason: "mutation requires confirm: true", nextAction: ... }` without even probing the CLI. Pass `confirm: true` to actually run; pass `dryRun: true` to preview the argv without executing.

### `container_build { tag, dockerfile?, context?, confirm? }`

Wraps `docker build -t <tag> [-f <dockerfile>] <context>`. With `confirm: true`, runs the build and returns the image id parsed from the docker output. With `dryRun: true`, returns the argv without executing.

### `k8s_apply { manifest, namespace?, confirm? }`

Wraps `kubectl apply -f -` (manifest is the YAML passed through stdin) with optional `-n <namespace>`. With `confirm: true`, runs the apply. With `dryRun: true`, returns the argv without executing.

## Acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Lists local containers/images and lints a fixture Dockerfile → findings.
- Missing `docker` / `kubectl` → install hint, never a crash.
- `container_build` / `k8s_apply` refuse without `confirm: true`.

## License

BSD-3-Clause, same as the parent monorepo.
