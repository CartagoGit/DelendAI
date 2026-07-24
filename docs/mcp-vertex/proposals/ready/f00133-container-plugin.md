---
id: f00133
kind: feat
title: container plugin — read-only Docker/Kubernetes inspection, Dockerfile lint and consented build/apply via the host CLI
status: ready
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

- **Status**: pending
- **Files**: `plugins/container/src/lib/inspect/`, `plugins/container/src/lib/tools/container-inspect.tool.ts`
- **Gate**: bun run validate

`container_ps`/`container_images`/`k8s_get` over the probed CLI; pure parsers,
injected exec. Missing CLI → install hint.

### S2 — logs + Dockerfile lint

- **Status**: pending
- **Files**: `plugins/container/src/lib/lint/`, `plugins/container/src/lib/tools/container-lint.tool.ts`
- **Gate**: bun run validate

`container_logs` and `container_lint` (hadolint-style, probed) → normalized
findings (r00012).

### S3 — consented build/apply + catalog

- **Status**: pending
- **Files**: `plugins/container/src/lib/tools/container-build.tool.ts`, `plugins/container/README.md`
- **Gate**: bun run validate

`container_build`/`k8s_apply` require `confirm: true`; catalog + wiki + pack.

## acceptance

- `bun run validate` → exit 0 (incl. `verify:tools`).
- Lists local containers/images and lints a fixture Dockerfile → findings.
- Missing `docker`/`kubectl` → install hint, never a crash.
- Build/apply refuse without `confirm: true`.

## notes

Reuses r00012 (probe/runner/finding). Prior art: Docker MCP, the Kubernetes
MCP server, hadolint.
