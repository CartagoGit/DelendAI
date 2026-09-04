---
id: f00133
kind: feat
title: container plugin — read-only Docker/Kubernetes inspection, Dockerfile lint and consented build/apply via the host CLI
status: done
date: 2026-07-23
track: plugin+container+runtime
closed-by: cartago (consolidated evidence pass 2026-07-26)
closed-evidence:
  - 8 commits referencing f00133 recovered from git log --grep (precedes convention)
  - all declared Files verified to exist via 8-commit batch
shipped-in:
  - f1552d05 # fix(core): update preset-catalog spec + bump swarm token budget
  - 4b3b00ec # feat(f00133): S2 container logs + Dockerfile lint
  - a1dcfa0c # feat(f00133): close container plugin — S1+S2+S3 done
  - 7b051b3d # feat(f00133 S3): README + consent gate documentation
  - 292b0d5e # fix(f00133 S1): DL3042 regex word-boundary + parse-dockerfile spec raw contract
  - fad3cee6 # feat(container): S1 read-only inspection (f00133)
  - de8cc74f # fix(f00133 S3): container-build extract image id regex — match sha256: prefix
  - 4d92d24e # feat(f00133 S3): wire buildContainerBuildToolRegistrations import in container p
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
- **Files**: `plugins/container/src/lib/logs/`, `plugins/container/src/lib/lint/`, `plugins/container/src/lib/tools/container-lint.tool.ts`
- **Gate**: bun run validate

Implemented as two additive read-only tools. `container_logs` probes only the
Docker CLI, shells out through `docker logs --tail N --timestamps`, and
normalizes stdout/stderr into typed timestamped lines via a pure parser.
`container_lint` reads a workspace-contained Dockerfile from disk and applies a
built-in offline rule set (DL3001, DL3008, DL3025, DL3042, DL3047) over a pure
Dockerfile parser, so hosts without hadolint still get deterministic findings.

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
