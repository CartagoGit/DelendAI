---
id: f00133
kind: feat
title: container plugin — read-only Docker/Kubernetes inspection, Dockerfile lint and consented build/apply via the host CLI
status: done
date: 2026-07-23
track: plugin+container+runtime
---

# f00133 — container plugin

## goal

A `container` plugin that lets an agent inspect Docker / Kubernetes state
(images, containers, pods, services, logs), **lint Dockerfiles**, and — only on
consent — build/apply, via the host's `docker`/`kubectl` CLI through the shared
external-tool core (r00012). Read-only by default.

## why

Container tooling is widely used and an agent cannot see runtime container
state today. Dogfooding value is lower (mcp-vertex core is a Bun monorepo with
no containers), so this is tier-2 — included for completeness and adopter
coverage.

## why this design

Wrap `docker`/`kubectl` via r00012's probe + runner + install hint; inspection
is **read-only** by default and all parsers are pure over an injected exec.
Mutating actions (`build`, `run`, `apply`) require explicit consent. No daemon,
no bundled engine, no credential handling beyond the CLI's own context.

## non-goals

- No cluster mutation without consent; no `apply` of unreviewed manifests.
- No bundled docker/kubectl; no kubeconfig/credential handling of our own.
- No always-on watch — request/response only.

## slices

### S1 — read-only inspection

- **Status**: done
- **Files**: `plugins/container/src/lib/inspect/`, `plugins/container/src/lib/tools/container-inspect.tool.ts`
- **Gate**: bun run validate

`container_ps`/`container_images`/`k8s_get` over the probed CLI; pure parsers,
injected exec. Missing CLI → install hint.

Implemented as the `container_inspect` tool with pure parsers for
`docker ps --format '{{json .}}'`, `docker images --format '{{json .}}'`, and
`kubectl -n <namespace> get pods -o json`. The runner injects probe/exec deps,
so tests remain deterministic and missing `docker`/`kubectl` returns a typed
skipped envelope with an install hint instead of throwing.

### S2 — logs + Dockerfile lint

- **Status**: done
- **Files**: `plugins/container/src/lib/lint/{dockerfile-parser,dockerfile-rules,run-lint}.{ts,spec.ts}`, `plugins/container/src/lib/tools/container-lint.tool.{ts,spec.ts}`, `plugins/container/src/lib/inspect/cli-tools.ts` (HADO_LINT_TOOL), `plugins/container/src/index.ts`
- **Gate**: bun run validate

Implemented `container_lint` + `container_logs`:
- Pure Dockerfile parser supporting backslash continuations + JSON-array CMD/ENTRYPOINT.
- Built-in DLxxxx rule set mapped onto the r00012 `IFinding` severity scale: USER missing/root, MAINTAINER deprecated, apt-get install without update, missing `--no-install-recommends`, missing `apt-get clean`.
- `runDockerfileLint` probes hadolint on PATH. When present, parses hadolint JSON; when absent, falls back to the built-in rules so the tool never returns an empty report.
- `container_logs` tails docker/kubectl logs via r00012; missing CLI → structured `kind: 'skipped'` envelope with the install hint.
- HADO_LINT_TOOL descriptor with brew/apt/curl install hints added.

21/21 container tests pass; `bun run typecheck` clean.

### S3 — consented build/apply + catalog

- **Status**: done
- **Files**: `plugins/container/src/lib/tools/container-build.tool.{ts,spec.ts}`, `plugins/container/README.md`
- **Gate**: bun run validate

Implemented `container_build` + `k8s_apply` with an explicit `confirm: true` payload gate (same posture as `db_query`'s write gate). Without `confirm: true` the tool returns a structured refusal envelope (`{ok:false, reason:'mutation requires confirm:true', nextAction:...}`) before probing the CLI. With `confirm: true` the build runs `docker build -t <tag> ...` and parses the image id from the output; the apply runs `kubectl apply -f -` from stdin. Both tools also accept `dryRun: true` to preview the argv without executing. README rewritten to document all three families (inspect / lint+logs / mutating) with their consent gate. 35/35 plugin tests pass; `bun run typecheck` clean.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Lists local containers/images and lints a fixture Dockerfile → findings.
- Missing `docker`/`kubectl` → install hint, never a crash.
- Build/apply refuse without `confirm: true`.

## notes

Reuses r00012 (probe/runner/finding). Prior art: Docker MCP, the Kubernetes
MCP server, hadolint.
