---
id: f00104
kind: feat
status: ready
type: proposal
track: cli+core+release+install+docs
date: 2026-07-08
title: "External consumption + release coherence — one canonical launch command that actually ships"
shipped-in: []
recan: []
related:
    - f00068 # external-mcps plugin — not in PUBLISH_ORDER, so external users can't get it
    - c00002 # npm publish gate — this is the blocker: the package set + launch command must be coherent before publishing
    - f00089 # init/adoption flow — the writer this fixes
ownership:
    - { agent: implementation_runner, task: 'S1: pick + implement THE canonical external launch command' }
    - { agent: implementation_runner, task: 'S2: complete PUBLISH_ORDER + private flags so every referenced package ships' }
    - { agent: implementation_runner, task: 'S3: fix the mcpv init mcp.json writer to emit the canonical command' }
    - { agent: implementation_runner, task: 'S4: reconcile every doc + self-host config to the one command' }
    - { agent: implementation_runner, task: 'S5: end-to-end external-install smoke gate' }
globalGate: validate
acceptance:
    - { command: bun run validate, expect: exit0 }
---

# f00104 — External consumption + release coherence

## goal

Make "install mcp-vertex into another project and start the server" actually
work, with ONE canonical launch command that is (a) published, (b) written
by `mcpv init`, and (c) documented — the same string everywhere. Today there
are **three inconsistent launch stories, and the two that users are told to
use are broken.** This is the true blocker behind c00002 (npm publish): you
cannot publish a package set that cannot be launched.

## why

Evidence gathered 2026-07-08 (all file:line):

1. **`@mcp-vertex/core` has no `bin`.** `packages/core/package.json` `files`
   is `["dist","schema","README.md","LICENSE"]` and there is no `bin` block;
   `packages/core/src/index.ts` is `export * from './public'` — a library,
   not an executable. Yet `docs/mcp-vertex/CROSS-PROJECT-SETUP.md:54,69-70`
   tells users to run `bunx @mcp-vertex/core --preset=full` and write
   `{ "command": "bunx", "args": ["@mcp-vertex/core", "--preset=full"] }`.
   `bunx @mcp-vertex/core` cannot execute anything — **story #1 is broken.**
2. **`mcpv init` writes a host entry that isn't shipped.**
   `packages/cli/src/commands/init/init.command.ts:166` resolves the launch
   target via `resolveHostEntryPath`
   (`packages/cli/src/lib/init/host-entry-resolver.service.ts:60-61`), whose
   published-package candidates are
   `node_modules/@mcp-vertex/core/tools/scripts/host/host-server.script.ts`
   and `.../dist/host/host-server.js`. But `tools/` lives at the repo ROOT
   (not inside `packages/core`, not in its `files`), and the build emits no
   `dist/host` (no build entry references host-server; `packages/core/dist/host`
   does not exist). In a real npm install both candidates miss →
   `HostEntryNotFoundError`. **story #2 is broken.**
3. **The only working entry is never written.** `packages/cli` DOES expose a
   real server: `bin` `mcpv`/`mcp-vertex` → `dist/index.js`, whose
   `import.meta.main` branch runs `runServerCli` on `__serve`
   (`packages/cli/src/index.ts:135`), and `buildServerArgs` already produces
   `["__serve","--workspace",…]` (`server-args.service.ts:166`). But this is
   only used by the CLI's own internal stdio client
   (`stdio-context.factory.ts:47`) — it is never written into any external
   `mcp.json`. **story #3 works but is invisible to users.**
4. **The launcher package + half the plugins never publish.**
   `PUBLISH_ORDER` (`tools/scripts/release/release-plan.ts:14`) is
   core + proposals/rules/memory/git/quality/search/notification/docs/deps.
   It OMITS **`packages/cli`** (the `mcpv` bin itself!), and the newer
   plugins **usage-tracking, orchestrator-runner, external-mcps, issues,
   cache** — even though `CROSS-PROJECT-SETUP.md:91` tells users to
   `--plugins=usage-tracking,orchestrator-runner`. `@mcp-vertex/ui-extension`
   and `apps/shared` are `private:true` while the vscode extension depends on
   ui-extension at runtime. So: the command that works can't be installed,
   and documented plugins can't be fetched.

The net effect: a fresh external project cannot get a running mcp-vertex by
any of the documented or generated paths. This is the single most important
"make it usable in other projects" fix.

## non-goals

- **No new host-server architecture.** Pick between the two existing real
  entries (`mcpv __serve` via the cli bin, or shipping `dist/host` in core) —
  do not invent a third.
- **No marketplace/extension publishing** (that is the vscode side; separate).
- **No preset redesign** — only ensure referenced presets/plugins ship.

## Slices

- global_gate: validate

### S1 — Pick + implement THE canonical external launch command

- **Status**: done
- **Files**: `packages/cli/src/lib/init/host-entry-resolver.service.ts`, `packages/cli/src/lib/server-args.service.ts`, `docs/mcp-vertex/proposals/ready/f00104-external-consumption-and-release-coherence-one-canonical-launch.md`
- **Gate**: bun run typecheck && bun run test
- **Acceptance**:
  - "Decide + document the canonical command. RECOMMENDED: `{ command: 'bunx'|'npx', args: ['@mcp-vertex/cli','__serve','--workspace','<root>', ...presets/plugins] }` — the cli bin is the only thing that runs a server and it already parses `__serve`. The host-entry-resolver's monorepo/dev path stays as a dev-only fallback (behind an explicit flag), not the default external output."
  - "A single exported `buildCanonicalLaunch({ workspace, preset, plugins, mode })` returns the `{command,args}` used by BOTH init and the docs generator, so they cannot drift again."
- **Decision**: The canonical external shape is `{ command: "bunx", args: ["--package", "@mcp-vertex/cli", "mcpv", "__serve", "--workspace", workspace, ...] }`; callers may select `npx` without changing argv. The explicit package/bin pair is required because the package publishes two aliases and npm cannot infer one unambiguously. Repository host-script discovery is development-only and is not emitted by the builder.
- **Evidence**: Co-located regressions pin the package, subcommand, workspace, preset/plugin forwarding, npx parity and absence of `host-server.script.ts`.

### S2 — Complete PUBLISH_ORDER + private flags

- **Status**: done
- **Files**: `tools/scripts/release/release-plan.ts`, `packages/cli/package.json`, `plugins/*/package.json`, `packages/ui-extension/package.json`, `apps/shared/package.json`
- **Gate**: bun run test
- **Acceptance**:
  - "PUBLISH_ORDER includes `packages/cli` (dependency-ordered after core) and every plugin a preset or the docs reference (usage-tracking, orchestrator-runner, external-mcps, issues, cache). A test asserts: every plugin in preset-catalog + every plugin named in CROSS-PROJECT-SETUP is in PUBLISH_ORDER."
  - "Resolve the ui-extension/shared `private` question: either publish them (the extension consumes ui-extension) or document how the packaged extension bundles them; a test pins the decision so a private runtime dep can't silently break the published extension."
- **Decision**: Publish core → client → CLI → every first-party plugin. Keep ui-extension/shared private because the VS Code build bundles every dependency except the `vscode` host API.
- **Evidence**: The release regression enumerates the live `plugins/` directory, pins the first three dependency-ordered packages, verifies both private manifests and asserts the production build externalizes only `vscode`.

### S3 — Fix the mcpv init mcp.json writer

- **Status**: done
- **Files**: `packages/cli/src/commands/init/init.command.ts`, `packages/cli/src/lib/init/init-render.service.ts`, `packages/cli/src/lib/init/init-writers.factory.ts`, `packages/core/src/lib/install/merge-config.ts`
- **Depends on**: S1
- **Gate**: bun run test
- **Acceptance**:
  - "`mcpv init` writes the S1 canonical command into `.vscode/mcp.json` (and the generic `.mcp.json`), not the host-server.script path. The merge-aware writer still preserves other servers. A spec asserts the generated command matches `buildCanonicalLaunch` output exactly."
  - "The dev/monorepo host-server path is only emitted when `--mcp-vertex-root` (or a detected sibling checkout) is explicitly present."
- **Evidence**: Default init writes builder-identical published CLI entries to both `.vscode/mcp.json` and `.mcp.json`, preserving sibling servers with merge-aware atomic writers. An explicit `--mcp-vertex-root` still selects the repository host script; absence no longer probes or fails on local checkout paths. The CLI gate passes 235 tests.

### S4 — Reconcile every doc + self-host config to the one command

- **Status**: pending
- **Files**: `docs/mcp-vertex/CROSS-PROJECT-SETUP.md`, `apps/web/src/**` (setup/install surfaces — coordinate: another agent may hold these), `extensions/vscode/src/webviews/setup-github.ts`
- **Depends on**: S1
- **Gate**: bun run lint
- **Acceptance**:
  - "Every user-facing install instruction (canonical guide, web setup page, vscode setup wizard) prints the S1 command. A lint/test greps the docs + wizard strings and fails if `bunx @mcp-vertex/core` (the broken form) reappears."

### S5 — End-to-end external-install smoke gate

- **Status**: pending
- **Files**: `tools/scripts/verify/external-install-smoke.script.ts`, `package.json`
- **Depends on**: S1, S2, S3
- **Gate**: bun run validate
- **Acceptance**:
  - "A CI-friendly smoke: pack the publishable packages (`bun pm pack` or a tarball dry-run), install them into a scratch temp project, run `mcpv init`, then start the written command and assert the server responds to an `overview` call (or a `--help`/handshake if a full stdio round-trip is too heavy). Wired into validate (or a `verify:` target) so the external path can never silently break again."

## acceptance

- `bun run validate` → exit 0.
- One canonical launch command, produced by one function, written by init,
  printed by every doc/wizard, and pointing at a package that actually
  publishes.
- A test proves every preset/doc-referenced plugin is in PUBLISH_ORDER.
- The external-install smoke gate passes.
