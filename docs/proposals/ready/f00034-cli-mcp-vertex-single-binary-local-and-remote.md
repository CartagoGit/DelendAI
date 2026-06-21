---
id: f00034
status: ready
type: proposal
track: core+cli+client+workflow
date: 2026-06-21
kind: feat
title: Single CLI for mcp-vertex — local + remote transport, one binary, private package
related:
    - f00031 # single canonical orchestrator — this proposal adds the human-facing CLI counterpart
    - f00032 # skills + write-side tools — CLI consumes the public surface those tools define
    - a00022 # master unificada — S5 (try/catch in vscode commands) is the only adjacent change
    - l00008 # plugins ↔ project state sync — CLI respects the same durable-write invariants
reservedFiles:
    - packages/cli/
    - packages/cli/package.json
    - packages/cli/tsconfig.json
    - packages/cli/vitest.config.ts
    - packages/cli/src/
    - packages/cli/tests/
    - packages/cli/README.md
    - packages/core/package.json # only the bin field is touched; see S1
---

# f00034 — Single CLI for `@mcp-vertex/core` — `mcp-vertex` / `mcpv`, local + `--remote=stdio`, one private package

## goal

Give humans (and CI scripts) a **single console entrypoint** to govern the repo without an IDE. One binary, two published names (`mcp-vertex`, `mcpv`), one package, one source of truth. The CLI is **a thin shell** over the public surface of `@mcp-vertex/core` and `@mcp-vertex/client` — it adds zero domain logic and never imports from `core/src/lib/*`.

The CLI exists to answer, from a terminal, the questions a developer (or an operator, or a CI job) needs to ask about the repo:

- "What is the state of the repo right now?" → `mcpv status`, `mcpv overview`
- "What is this MCP server actually doing?" → `mcpv plugin list`, `mcpv plugin inspect <name>`
- "How much have we spent / where is the latency / which tool is hot?" → `mcpv metrics`
- "Is the code green? which gate failed?" → `mcpv validate`, `mcpv validate-matrix`
- "What is the effective config? did I misconfigure something?" → `mcpv config {schema,show,get,doctor}`
- "Help me find something in the docs/code/memory." → `mcpv search`, `mcpv docs {list,read}`
- "Help me author a plugin/tool/skill." → `mcpv scaffold <kind>`, `mcpv plugin inspect` (for examples)
- "Set up a fresh repo." → `mcpv init`

The same binary must work **against the local repo** (workspace=`.`) and **against a remote `mcp-vertex` server** (`--remote=stdio` in v1; `--remote=tcp://host:port` parsed but unimplemented in v1). One parser, one set of subcommands, two transports. The remote mode is what lets a human (or a CI runner) without an IDE consume the same tool surface the IDE exposes.

## why

- **The cost of dogfooding is not yet closed for humans.** Every auditor in the `a00021`/`a00023`/`a00024`/`a00026` family — and the master `a00022` S5 (try/catch in 4 `apps/vscode` MCP-client commands) — was forced to look at "what the user sees" through the IDE. There is **no equivalent surface for the shell**: today a developer wanting to ask "what plugins are loaded" runs `bun run validate` and reads the output, or hand-parses `mcp-vertex.config.json`. A single CLI removes the IDE as a hard requirement for inspection.
- **CI wants a structured, scriptable surface.** `f00027` (metrics longitudinal regression gate, in `ready/`) and the upcoming `a024c` (token-budget enforcement, deferred from `a00025`) both need to consume observability from the CLI, not shell into `bun run` and grep stdout. The CLI provides `--json` from the v1.
- **The host and the client are two faces of the same product, not two products.** Separating them into two packages (`cli-host` + `cli-client`) was the first instinct; on review, that's three packages to maintain, three releases to coordinate, three audit surfaces, and the user only ever types one command. The right separation is **one package, one binary, two transports**.
- **The core already exports everything the CLI needs.** `assembleCliConfig` (in `core/public`) and `runCli` are the entire surface; the client (`packages/client/src/lib/transport/stdio.ts`) is already there. We add zero new functionality to the core or the client — we wrap them.
- **Rule 1 of the core ("core stays agnostic") is preserved without exceptions.** The CLI lives in a new `packages/cli`; it imports from `@mcp-vertex/core` only via the public barrel, and a new gate (`tools/scripts/lint/no-internal-core-imports.script.ts`) makes that import discipline mechanical. The audit `a00022` found this exact kind of drift as a recurring risk for "wrapping" packages; the gate is the prevention.

## why this design

- **One package, two bin names** is the right shape: it gives the user a daily-driver (`mcpv`) and a stable, brand-aligned name (`mcp-vertex`) without paying for two packages.
- **The transport is the only thing that varies** between local and remote. A single dispatcher in `packages/cli/src/index.ts` reads `--remote=` and `--workspace=` and routes the same command object to either `transport/local.ts` or `transport/remote-stdio.ts`. The commands themselves don't know which transport is serving them; they only know the context.
- **A hand-rolled parser** (`packages/cli/src/parser.ts`, zero-dep apart from zod) keeps the dep tree clean and matches the style of the core. `commander` is CJS-first; `cac` doesn't support nested subcommands; `yargs` is heavy. A `defineCommand({ name, summary, args, flags, run })` API with zod-validated args is ~100 lines and stays coherent with the rest of the repo.
- **Subcommands default to "output to stdout, never silently write to disk"**. `scaffold` prints to stdout unless `--out=<path>` is passed; `init` refuses to overwrite; `config set` is schema-gated. This is the single biggest UX difference between a CLI for humans and a CLI that bites you at 3 AM.
- **Two transport modes in v1, not three.** `--remote=stdio` covers the CI / multi-workspace case. `--remote=tcp://...` is **parsed and rejected with a "v2" message** in v1 — flag surface is stable from day 1, implementation ships in a follow-up without breaking the parser.
- **The package is `private: true` at the end of v1.** Publishing to npm is a separate decision, gated on a stable v1 + i18n battle-tested + a green audit pass.

## non-goals

- **Replacing the IDE.** The CLI is a **complement**, not a substitute. The IDE keeps its webviews, panels and inline experience.
- **Replacing the host's bin.** We migrate the `bin: mcp-vertex` declaration from `@mcp-vertex/core` to `@mcp-vertex/cli`. `core/cli.ts` becomes a thin re-export (or stays as the canonical entry, with `cli/package.json` declaring `bin` instead — see S1). The user-visible `mcp-vertex` command keeps working.
- **Implementing `--remote=tcp://...` in v1.** The flag is **parsed and validated** in v1 (so v2 can ship without a parser change), but the transport implementation is deferred. v1 only ships `--remote=stdio` (spawns the local `mcp-vertex` binary as a child process and talks stdio via `@mcp-vertex/client`).
- **An interactive REPL.** No `mcpv` without arguments. A `mcpv help` (or `mcpv --help`) lists subcommands; subcommands take flags. A REPL is a v2 conversation.
- **Write-side tools that bypass the durable primitives.** Anything in the CLI that mutates state (S5: `scaffold`, `init`, `config set`, `config doctor --fix`) uses `withFileMutex` + `writeFileAtomic` from the core's public surface. No exception. This is enforced by tests, not by convention.
- **Publishing `@mcp-vertex/cli` to npm in v1.** The package is `private: true` until the v1 ships, `bun run site:strict` is green, and the i18n coverage check passes. Then we flip `private: false` and let `bun run release` do its job. Until then the binary is invoked from the monorepo (`bun run mcp-vertex -- status`, `bunx --workspaces mcp-vertex status`).
- **Touching any existing `outputSchema`.** The CLI propagates the core's `outputSchema` byte-for-byte in both local and remote modes. If a future core change modifies a schema, the CLI's type tests fail loudly. Rule 8 stays unbroken.

## architecture

```
packages/
├── core/                    (sin cambios funcionales; pierde el `bin: mcp-vertex`)
├── client/                  (sin cambios)
└── cli/                     NUEVO · private: true
    ├── package.json         (bin: mcp-vertex + bin: mcpv; workspace deps: core + client)
    ├── tsconfig.json        (extiende tsconfig.base.json)
    ├── vitest.config.ts     (extiende vitest.shared.ts)
    ├── src/
    │   ├── index.ts                  entrypoint; dispatcha modo local/remoto
    │   ├── parser.ts                 defineCommand, parseArgs, --json, --help
    │   ├── format/{text,json,table}.ts
    │   ├── exit-codes.ts
    │   ├── i18n.ts                   mini-i18n de --help (claves en ui.ts)
    │   ├── generated/help-translations/<lang>.ts   (12 locales, generated)
    │   ├── transport/
    │   │   ├── local.ts              reusa assembleCliConfig del core
    │   │   ├── remote-stdio.ts       spawnea el bin y habla por @mcp-vertex/client
    │   │   └── remote-flag.ts        parseRemoteFlag (v1 rechaza tcp:// con "v2")
    │   ├── commands/
    │   │   ├── status.ts
    │   │   ├── overview.ts
    │   │   ├── plugin/{list,inspect}.ts
    │   │   ├── validate.ts
    │   │   ├── validate-matrix.ts
    │   │   ├── metrics.ts
    │   │   ├── config/{schema,show,get,set,doctor,doctor-fix}.ts
    │   │   ├── search.ts
    │   │   ├── docs/{list,read}.ts
    │   │   ├── scaffold.ts
    │   │   ├── init.ts
    │   │   ├── help.ts
    │   │   └── registry.ts            single point of registration
    │   └── lib/                       helpers internos (no exportados)
    ├── tests/                        *.spec.ts colocalizados
    └── README.md
```

**Data flow for a single command invocation** (`mcpv status`):

1. `index.ts` parses `--remote=`, `--workspace=`, `--lang=`, `--json`, `--no-color` (flags handled before any subcommand).
2. `parser.ts` resolves the subcommand (`status`) and validates its args (none in this case) with zod.
3. `index.ts` chooses the transport: `--remote=stdio` → `transport/remote-stdio.ts`; otherwise → `transport/local.ts`.
4. The transport builds the `commandContext`: workspace paths (via `resolveWorkspaceContained`), assembled config (via `assembleCliConfig`), metrics registry, plugin list.
5. The command (`commands/status.ts`) is called with `(args, ctx)`. It reads from the context, never from the filesystem outside the workspace.
6. The result is passed through `format/{text,json,table}.ts` based on `--json` / `--format=`.
7. Output goes to stdout; diagnostics go to stderr; the process exits with the `ExitCode` from `commands/status.ts` (or a default from `exit-codes.ts`).

**The two transports produce the same shape** for the same command, verified by a property test: `local_then_remote_same_shape`.

**The CLI never imports from `core/src/lib/*`.** Enforced by `tools/scripts/lint/no-internal-core-imports.script.ts` (S7). Allowlist: only `packages/cli/tests/integration/public-surface.spec.ts` is permitted to import the public barrel directly to assert the contract.

## slices

### S1 — Esqueleto del package, dos binarios, sin tocar lógica

- **Status**: pending
- **Files**:
  - `packages/cli/package.json` (NEW; `private: true`; `bin: { "mcp-vertex": "./dist/index.js", "mcpv": "./dist/index.js" }`; `workspace:*` deps on `@mcp-vertex/core` and `@mcp-vertex/client`; scripts: `test`, `typecheck`, `build`, `lint`)
  - `packages/cli/tsconfig.json` (NEW; extends `tsconfig.base.json`)
  - `packages/cli/vitest.config.ts` (NEW; extends `vitest.shared.ts`)
  - `packages/cli/src/index.ts` (NEW; minimal: prints `mcp-vertex 0.1.0` and exits 0; reserved for the dispatcher)
  - `packages/cli/tests/index.spec.ts` (NEW; 2 tests: version flag, `--help` lists "status/overview/...")
  - `packages/core/package.json` (1 line edit: drop the `bin: mcp-vertex` block, keep `exports` and `main` untouched)
  - `packages/core/src/cli.ts` (NO change in behaviour; add a JSDoc note that the canonical CLI lives at `@mcp-vertex/cli`, kept here for backward compat with the published 0.1.0 of `@mcp-vertex/core`)
  - `package.json` (root): add `"cli": "bun packages/cli/src/index.ts"` to `scripts` for in-monorepo use; add `packages/cli` to the implicit workspaces filter (it's already covered by `packages/*`)
- **Gate**:
  - `bun run validate` (root) — verde
  - `bun --filter @mcp-vertex/cli test` — verde
  - `bun packages/cli/src/index.ts --version` — imprime `0.1.0`
- **Acceptance**:
  - From the monorepo root: `bun run cli -- status` (alias for the new package) returns the help text with the list of subcommands declared in S2 (it may be a stub that prints "no subcommand registered yet").
  - `node_modules/.bin/mcp-vertex` resolves to `packages/cli/dist/index.js` (post-build) and prints the version.
  - `node_modules/.bin/mcpv` resolves to the same file and behaves identically (single entrypoint, two bin names).
  - The 1-line edit to `packages/core/package.json` does not break any consumer test (`bun run validate`).
- **Implementation note (deferred)**: when S1 lands, `bin: mcp-vertex` no longer comes from `core`. The docstring on `core/src/cli.ts` is the only user-facing hint that the canonical CLI moved; nothing in the contract changes.

### S2 — Parser propio + formatters + exit codes + i18n

- **Status**: pending
- **Files**:
  - `packages/cli/src/parser.ts` (NEW; `defineCommand({ name, summary, args, flags, run })`, `parseArgs(argv, registry)`, `printHelp(command, lang)`; zero-dep; uses zod for arg/flag validation, already a transitive dep of `core`)
  - `packages/cli/src/format/text.ts` (NEW; `formatRows`, `formatTable`; respects `--no-color` via `supportsColor` on stdout)
  - `packages/cli/src/format/json.ts` (NEW; `formatJson(value)` — stable key order, ISO timestamps, NDJSON stream for list outputs)
  - `packages/cli/src/format/table.ts` (NEW; thin wrapper around `format/text` + box-drawing for `--format=table`)
  - `packages/cli/src/exit-codes.ts` (NEW; enum: `OK=0`, `USAGE=2`, `NOT_FOUND=3`, `VALIDATION=4`, `RUNTIME=5`, `REMOTE=6`, `INTERNAL=70`)
  - `packages/cli/src/i18n.ts` (NEW; `t(key, lang)`, `loadHelpTranslations(lang)`; reads from `apps/web/src/i18n/langs/<lang>.ts` via a build-time generated `packages/cli/src/generated/help-translations.ts` to avoid a runtime import of the web bundle)
  - `tools/scripts/i18n/generate-cli-translations.script.ts` (NEW; bun script that reads the 12 locales in `apps/web/src/i18n/langs/` and emits a flat `Record<key, string>` per locale under `packages/cli/src/generated/help-translations/<lang>.ts`)
  - `packages/cli/tests/parser.spec.ts` (NEW; ≥12 cases: positional, short flag, long flag, `--key=value`, `--key value`, unknown flag, missing required arg, zod validation error, i18n `t()`, multi-byte in args, empty argv, `--help` short-circuit)
  - `packages/cli/tests/format.spec.ts` (NEW; ≥6 cases: stable JSON, table width, `--no-color`, NDJSON, truncation, escape)
- **Gate**:
  - `bun --filter @mcp-vertex/cli test` — verde
  - `bun --filter @mcp-vertex/cli typecheck` — verde
  - `bun run validate` (root) — verde (the new gate from S7 already runs and must pass)
- **Acceptance**:
  - `mcpv --help` prints the list of registered subcommands in `--lang=en` by default, in the system locale if `--lang` is unset and `LANG` is one of the 12 supported, and in `en` otherwise.
  - `mcpv bogus` exits 2 with the `USAGE` exit code and a single-line error pointing to `mcpv help`.
  - `mcpv <sub> --json` switches the formatter globally; the JSON is stable (sorted keys) and parseable with `bun -e`.
  - The parser is **zero-dep** apart from zod (already in the dep tree via core).
  - **Zero runtime file I/O** in the parser. `i18n.ts` only reads the generated `help-translations.ts` from the dist bundle.
- **Implementation note (deferred)**: at this point there are 0 subcommands registered. The parser, formatters and i18n are exercised by a 2-test smoke in S1's `index.spec.ts` (`mcpv --version`, `mcpv --help`).

### S3 — Subcomandos read-only (modo local + remoto-stdio)

- **Status**: pending
- **Files**:
  - `packages/cli/src/commands/status.ts` (NEW; uses `assembleCliConfig` + `createMetricsRegistry` to print a 1-screen summary: workspace, plugins loaded, plugins with errors, paths resolved, mode)
  - `packages/cli/src/commands/overview.ts` (NEW; consumes the same engine as `mcp-vertex_overview`; `--full` for verbose, default is compact)
  - `packages/cli/src/commands/plugin-list.ts` (NEW; table with namespace, source, options)
  - `packages/cli/src/commands/plugin-inspect.ts` (NEW; shows tools/prompts/skills/knowledge for one plugin, with their `outputSchema` summary)
  - `packages/cli/src/commands/validate.ts` (NEW; thin wrapper that invokes `bun run validate` from the root, parses its stdout/stderr, prints a structured summary, exits with the root script's exit code)
  - `packages/cli/src/commands/validate-matrix.ts` (NEW; consumes the same engine as `mcp-vertex_get_validation_matrix`; `--json` for CI)
  - `packages/cli/src/commands/metrics.ts` (NEW; `--reset` and `--persist` only in local mode; in remote-stdio it surfaces what the server reports)
  - `packages/cli/src/commands/config/{schema,show,get,doctor}.ts` (NEW; `config schema` runs `bun run config:schema` and pretty-prints; `config show` reads the resolved config; `config get <dot.path>` returns the value; `config doctor` runs `diagnoseConfigFile` from core and prints a coloured, sorted list of issues)
  - `packages/cli/src/commands/help.ts` (NEW; recursive `help <subcommand>`; respects `--lang`)
  - `packages/cli/src/commands/registry.ts` (NEW; `registerAllCommands()`; the only file that knows the order of registration)
  - `packages/cli/src/transport/local.ts` (NEW; `runLocal(command, ctx)` that wires the command to `assembleCliConfig` + the engine it asks for; the engines are pure functions from the core, so the local transport is just a thin async dispatcher)
  - `packages/cli/src/transport/remote-stdio.ts` (NEW; `runRemoteStdio(command, ctx)` that spawns the `mcp-vertex` binary (resolved via `which mcp-vertex || node_modules/.bin/mcp-vertex`) and pipes one `tools/call` request via the existing `packages/client/src/lib/transport/stdio.ts`; **propagates `outputSchema` byte-for-byte**)
  - `packages/cli/src/index.ts` (UPDATE; the dispatcher reads `--remote=stdio | --workspace=<path> | --lang= | --json | --no-color` and routes to the right transport)
  - `packages/cli/tests/commands/*.spec.ts` (NEW; one spec per command, ≥4 cases each: happy path, `--json` shape stable, error path, i18n of `--help`)
  - `packages/cli/tests/transport/local.spec.ts` + `remote-stdio.spec.ts` (NEW; ≥3 cases each: local calls `assembleCliConfig`, remote-stdio spawns + speaks stdio, both surface the same shape)
- **Gate**:
  - `bun --filter @mcp-vertex/cli test` — verde
  - `bun --filter @mcp-vertex/cli typecheck` — verde
  - `bun run validate` (root) — verde
  - `bun run cli -- status` (from root) — exits 0, prints the summary
  - `bun run cli -- overview --json | bun -e 'process.stdin.pipe(new Bun.WritableStream({ write(c){ JSON.parse(c); } }))'` — exits 0 (JSON parseable)
  - `bun run cli -- config get plugins.docs.options.roots[0]` — exits 0 and prints `docs` (or whatever the active config has)
- **Acceptance**:
  - **All 9 subcommands work in local mode against the current monorepo.**
  - **All 8 subcommands that make sense remotely (skip `validate` in remote, since the gate is local-only) work in `--remote=stdio` mode** by spawning a child `mcp-vertex` and re-using `@mcp-vertex/client`'s stdio transport.
  - The local and remote paths produce **the same JSON shape** for the same command (verified by a property test: `local_then_remote_same_shape`).
  - `outputSchema` of the underlying tool is preserved end-to-end (verified by a `schema_propagation` test that compares the CLI's `--json` output's keys with the tool's `outputSchema.required`).
  - **`--workspace=../..` is rejected with exit code `USAGE`** before any file I/O happens (covered by the containment gate from S7).
  - **`--remote=unknown` is rejected with exit code `USAGE`** and a message that lists `stdio` and `tcp://host:port` (the latter as "planned v2, not implemented").
- **Implementation note (deferred)**: at this point the user can already replace 90% of the IDE inspection flow with `mcpv` from a terminal. The remaining 10% (`search`, `docs`, `scaffold`, `init`, write-side `config set`) lands in S4–S5.

### S4 — Subcomandos de búsqueda e inspección

- **Status**: pending
- **Files**:
  - `packages/cli/src/commands/search.ts` (NEW; wraps `search_search`; flags: `--include`, `--exclude`, `--regex`, `--max=N`)
  - `packages/cli/src/commands/docs-list.ts` (NEW; wraps `docs_docs_list`; flags: `--tag`, `--max=N`)
  - `packages/cli/src/commands/docs-read.ts` (NEW; wraps `docs_docs_read`; flags: `--raw`, `--check-stale`)
  - `packages/cli/tests/commands/{search,docs-list,docs-read}.spec.ts` (NEW; ≥3 cases each: hit, miss, `--json` shape)
- **Gate**:
  - `bun --filter @mcp-vertex/cli test` — verde
  - `bun --filter @mcp-vertex/cli typecheck` — verde
  - `bun run validate` (root) — verde
  - `bun run cli -- search "assembleCliConfig" --max=5` — exits 0 and prints up to 5 hits in the current monorepo
  - `bun run cli -- docs list --tag=proposal` — exits 0 and prints the proposal-tagged docs
- **Acceptance**:
  - All three commands work in both local and `--remote=stdio` modes.
  - The `--json` output of `search` mirrors the `outputSchema` of `search_search` exactly (verified by the same `schema_propagation` test from S3).
  - **`docs read <id>` with an unknown id exits with `NOT_FOUND` (3)**, not `RUNTIME` (5) — the engine distinguishes "no such doc" from "engine errored".

### S5 — Subcomandos de escritura segura (mutex + atomic write)

- **Status**: pending
- **Files**:
  - `packages/cli/src/commands/scaffold.ts` (NEW; wraps `mcp-vertex_scaffold`; **outputs to stdout by default** for piping in CI: `mcpv scaffold tool --name=foo > foo.ts`; `--out=<path>` for direct write, which goes through `withFileMutex` + `writeFileAtomic`)
  - `packages/cli/src/commands/init.ts` (NEW; creates a minimal `mcp-vertex.config.json`; refuses to overwrite; respects `--workspace=`)
  - `packages/cli/src/commands/config-set.ts` (NEW; mutates one key, validated against the JSON Schema from `bun run config:schema`; writes via `withFileMutex` + `writeFileAtomic`; refuses to write if the schema would reject the new value)
  - `packages/cli/src/commands/config-doctor-fix.ts` (NEW; the `--fix` mode of `config doctor`; only auto-fixes the corrections the core marks as "safe")
  - `packages/cli/tests/commands/{scaffold,init,config-set,config-doctor-fix}.spec.ts` (NEW; ≥5 cases each: happy path, `--out` writes atomically, conflict on existing file, schema rejection, kill-during-write integrity)
  - `packages/cli/tests/integration/durable-write.spec.ts` (NEW; spawns a real child process that calls `mcpv config set` while a parallel `mcpv config get` runs; asserts the read never sees a partial state)
- **Gate**:
  - `bun --filter @mcp-vertex/cli test` — verde
  - `bun --filter @mcp-vertex/cli typecheck` — verde
  - `bun run validate` (root) — verde
  - `bun run cli -- scaffold tool --name=foo --dry-run` — prints the generated tool file to stdout, exits 0, **does not write any file**
  - `bun run cli -- init --workspace=.` — refuses to overwrite when `mcp-vertex.config.json` already exists (exits `VALIDATION`)
  - The integration test (`durable-write.spec.ts`) passes: 16 concurrent readers never observe a partial config.
- **Acceptance**:
  - All four commands use `withFileMutex` + `writeFileAtomic` from the core's public surface — **never** raw `fs.writeFileSync` or `fs.promises.writeFile` on workspace files. Verified by a grep test in S7.
  - `scaffold` defaults to stdout output (CI-friendly); the file is only created on disk when `--out=<path>` is passed.
  - `init` is **idempotent and safe**: running it twice in a row without flags exits `VALIDATION` with a clear message. Running it with `--force` overwrites, but only after a backup.
  - `config set` is **schema-gated**: trying to set `plugins.docs.options.roots = "string-not-array"` exits `VALIDATION` with the JSON-Schema error verbatim from zod, never silently coerces.

### S6 — Modo remoto `--remote=stdio` (polishing, no new subcommands)

- **Status**: pending
- **Files**:
  - `packages/cli/src/transport/remote-stdio.ts` (UPDATE; resolve binary path: `process.env.MCP_VERTEX_BIN || which("mcp-vertex") || join(repoRoot, "packages/cli/dist/index.js")`; verify it exists; spawn with `--quiet`; pipe `tools/call` requests)
  - `packages/cli/src/transport/remote-flag.ts` (NEW; `parseRemoteFlag("stdio" | "tcp://host:port")`; v1 rejects `tcp://` with exit `REMOTE` and message "tcp transport planned for v2")
  - `packages/cli/tests/transport/remote-stdio-integration.spec.ts` (NEW; spawns the real binary, runs `mcpv --remote=stdio status`, asserts it matches the local `mcpv status` shape)
- **Gate**:
  - `bun --filter @mcp-vertex/cli test` — verde
  - `bun run validate` (root) — verde
  - `bun run cli --remote=stdio status` — exits 0 and prints the same summary as `mcpv status`
  - `bun run cli --remote=tcp://localhost:1234 status` — exits `REMOTE` (6) with a one-line message
- **Acceptance**:
  - The remote-stdio path is functionally identical to the local path for read-only commands. The integration test (`remote-stdio-integration.spec.ts`) is a **regression test**: any future change that breaks shape parity fails CI.
  - The `tcp://` parser is implemented but rejects with a clear "v2" message — no silent fallback, no fake success.
  - The child process is killed cleanly on parent SIGINT (reuses `gracefulShutdown` from `core/public`).

### S7 — Gates + i18n completo + publicación interna

- **Status**: pending
- **Files**:
  - `tools/scripts/lint/no-internal-core-imports.script.ts` (NEW; bun script; greps `packages/cli/src/**/*.ts` for any import of `@mcp-vertex/core/dist/lib/*` or `../../core/src/lib/*`; exits 1 with a per-violation report; allowlist: `packages/cli/tests/**` for the public-surface regression test)
  - `tools/scripts/lint/cli-coverage.script.ts` (NEW; bun script; walks `packages/cli/src/commands/*.ts`, checks that each command has a corresponding `*.spec.ts` with ≥3 `test()` cases, fails with a per-file report otherwise)
  - `packages/cli/src/generated/help-translations/` (12 files, one per locale; generated by the script from S2)
  - `apps/web/src/i18n/langs/<lang>.ts` (UPDATE; add `cliHelp` key in all 12 locales, even if v1 only ships a subset of the keys — the `apps/web/scripts/check-i18n.ts` gate already enforces complete coverage)
  - `package.json` (root; `scripts`): add `"lint:cli": "bun tools/scripts/lint/no-internal-core-imports.script.ts && bun tools/scripts/lint/cli-coverage.script.ts"`; add `"lint:cli"` to the `validate` chain
  - `package.json` (root; `scripts`): add `"lint:cli:i18n": "bun tools/scripts/i18n/check-cli-translations.script.ts"`; this new script verifies the 12 generated `help-translations.ts` are in sync with the keys used in `commands/*.ts` (no missing keys in any locale, no unused keys)
  - `docs/CROSS-IDE.md` (UPDATE; one new section: "Console access (mcp-vertex / mcpv)" pointing to `packages/cli/README.md`)
  - `packages/cli/README.md` (NEW; install, usage, subcommand table, `--json` examples, i18n table)
  - `docs/proposals/index.json` (UPDATE; add the f00034 entry)
- **Gate**:
  - `bun run validate` (root) — verde
  - `bun run lint:cli` — verde
  - `bun run lint:cli:i18n` — verde
  - `bun run site:strict` — verde (the i18n check in `apps/web/scripts/check-i18n.ts` is part of `site:strict`)
  - `bun run cli -- status --lang=es` — exits 0 and prints the help/summary in Spanish
  - `bun run cli -- status --lang=ja` — exits 0 and prints in Japanese
  - `bun run cli -- status --lang=zz` — exits 0 and **falls back to English** with no error
- **Acceptance**:
  - The new gate `lint:cli` catches a regression in < 1 s (it's a grep, not a build). It runs as part of `bun run validate`.
  - The new gate `lint:cli:i18n` catches any drift between the keys used in `commands/*.ts` and the 12 generated translation files.
  - `apps/web/src/i18n/langs/*.ts` is complete for the new `cliHelp` namespace in **all 12 locales** (rule 9 of `AGENTS.md`).
  - The README of `packages/cli` is the single source of truth for "how to use the CLI". `docs/CROSS-IDE.md` and `docs/PLUGINS-MCP-VERTEX.md` get a one-line cross-link.
  - At the end of S7, the package is **still `private: true`**. Flipping to public is **explicitly not part of this proposal** — it's a separate decision (when the v1 has been stable in main for ≥1 minor cycle and the i18n is battle-tested). The acceptance for S7 says `private: true` stays.

## dependency graph

```
S1 (esqueleto, bin migration)
  │
  ▼
S2 (parser, formatter, exit codes, i18n gen script)
  │
  ├──► S3 (read-only commands, local + remote-stdio transports)
  │       │
  │       ├──► S4 (search, docs — depends on S3's transport wiring)
  │       │
  │       └──► S5 (write-side: scaffold, init, config set, config doctor --fix)
  │               │
  │               └──► S6 (remote-stdio integration test + remote-flag parser)
  │
  └──► S7 (gates: no-internal-imports, cli-coverage, i18n, public surface)
          (depends on S2, S3, S4, S5, S6 all being present)
```

**No slice requires another slice to be done to start.** S2 only needs S1; S3 only needs S2; S4 and S5 only need S3. The dependency is "must run validate after each", not "must wait for a human".

**Parallelisation**: S4 and S5 are independent once S3 is green. S6 can be done in parallel with S7. Total wall-clock for a single agent is roughly sequential; for a swarm, two parallel agents on S4+S5 save ~1 day.

## acceptance

- `bun run validate` (root) is green after every slice.
- `bun --filter @mcp-vertex/cli test` is green; coverage on `packages/cli/src/commands/` ≥ 85 % statements.
- `bun --filter @mcp-vertex/cli typecheck` is green; **zero** imports from `@mcp-vertex/core/src/lib/*` (enforced by the new gate `lint:cli`).
- `bun run cli -- status`, `overview`, `plugin list`, `validate`, `validate-matrix`, `metrics`, `config {schema,show,get,doctor}`, `search`, `docs {list,read}`, `scaffold`, `init` all exit 0 against the current monorepo in local mode.
- `bun run cli --remote=stdio <subcommand>` works for every read-only subcommand and produces the same `--json` shape as the local path.
- `bun run cli --remote=tcp://...` exits with a clear "v2" message (no silent fallback).
- `mcp-vertex` and `mcpv` resolve to the same file and behave identically.
- i18n coverage: `--help` is translated to all 12 locales; `--lang=zz` falls back to `en`; `bun run lint:cli:i18n` is green.
- `bun run site:strict` is green (the web i18n gate is part of the chain).
- `apps/vscode` MCP-client commands get **no regression** from this proposal: the only adjacent change was `a00022` S5 (try/catch in 4 commands) and is independent.
- The package is `private: true` at the end of f00034. Publishing to npm is **out of scope**.

## risks and mitigations

1. **The parser may grow flag-parsing bugs that the existing tests don't catch.** Mitigated by the 12+ cases in `parser.spec.ts` and the per-command specs. If a subcommand slips through with broken flag parsing, `lint:cli` doesn't catch it — the per-command test does.
2. **The remote-stdio integration test is slow and environment-dependent.** It spawns a real child process. Mitigated by gating it behind a `BUN_TEST_TIMEOUT=10000` and skipping it in `--reporter=dot` mode if `CI` is set with a one-line comment in the test (this is **the only** test in the repo that may be skipped on CI, and the reason is documented inline).
3. **`bun run validate` gets slower by ~1 s per run** because of the new `lint:cli` + `lint:cli:i18n` gates. Acceptable: a 1 s grep gate is the right cost for a 100 %-mechanical guarantee.
4. **The `bin: mcp-vertex` migration in S1 is a user-facing change.** A user with `@mcp-vertex/core@0.1.0` installed globally who upgrades to a version where the bin is gone will lose the `mcp-vertex` command. Mitigated by: (a) `core/src/cli.ts` keeps its `if (import.meta.main) runCli(...)` entrypoint, and (b) the new `cli/package.json` declares `mcp-vertex` in `bin`, so `npm i @mcp-vertex/cli` reinstalls the command. The CHANGELOG entry for this transition is a one-liner owned by `bun run release`.
5. **A `search` hit may include text that the user did not want exposed** (e.g. a secret embedded in a doc). Mitigated by the existing `redactSecrets` in `core/public` — the CLI uses it for any `text`-typed output, not just memory/proposals. This is **a rule, not a per-call opt-in**, and it is enforced by a test in `packages/cli/tests/integration/redaction.spec.ts`.
6. **The i18n script (`generate-cli-translations.script.ts`) may produce stale files** if a developer adds a new `t('foo.bar')` key in a command and forgets to run it. Mitigated by `lint:cli:i18n` (it fails on any missing key) and by hooking the script into `bun run dev` so the file is regenerated on save in dev mode.

## notes

### Decisions taken by the orchestrator (open to user veto before S1)

These are the choices made in the absence of a synchronous answer from the user. They are listed here so they can be reverted in S1 without re-doing the whole proposal:

1. **One package, two bin names** (`mcp-vertex` and `mcpv`, both pointing to `dist/index.js`), not one name. Reason: `mcp-vertex` was already the published bin of `core`; `mcpv` is the daily-driver short form. Re-cluttering the user's PATH is not worth the savings.
2. **v1 ships `--remote=stdio` only.** The `--remote=tcp://...` flag is parsed and rejected with a clear "v2" message, so the flag surface is stable from v1. Reasonable: TCP brings auth/TLS/multi-tenant decisions that are out of scope for a CLI proposal.
3. **`packages/cli` is `private: true` at the end of f00034.** Publishing to npm is a separate, later decision. Reasonable: it lets the v1 iterate without semver pressure, and the audit M26 (master unificada) gets a stable package to audit before it goes public.
4. **The parser is hand-rolled** (`parser.ts`, zero-dep apart from zod). Reasonable: the repo is Bun + zero-dep-friendly, and the alternative (`commander`/`cac`/`yargs`) all bring non-trivial weight.
5. **`scaffold` outputs to stdout by default** (CI-friendly: `mcpv scaffold tool --name=foo > foo.ts`). Writing to disk is opt-in via `--out=<path>`. Reasonable: a CLI for humans should not write files silently.
6. **`config set` is schema-gated**, never silent-coerces. Reasonable: the whole point of `mcpv config get/set` is to give the user precise control, and silent coercion is the bug that turns into a 2-day incident.

### Audit & governance

- **Master unificada (`a00022`)** flagged the absence of a CLI for the human side of the repo. f00034 is the proposal that closes that gap. After S7, the master audit's "no console surface" finding moves to `Resolved` in the next consolidation.
- **a00022 S5 (try/catch in 4 vscode commands)** is **not** re-implemented here. The two proposals are complementary: `a00022` S5 fixes the IDE surface; f00034 adds a non-IDE surface. The two do not share files.
- **AGENTS.md** is not edited by this proposal. All 10 invariants are preserved:
  1. Core stays agnostic — f00034 imports only from `core/public`; new gate enforces it.
  2. No `process.cwd()` in engines — the CLI's `--workspace=` is resolved via `resolveWorkspaceContained` from `core/public`.
  3. Async I/O in hot paths — the CLI is one-shot; not a hot path; but every write uses `writeFileAtomic` (covers rule 4).
  4. Durable writes — covered by S5.
  5. Workspace-scoped path inputs contained — `resolveWorkspaceContained` is mandatory in the local transport; covered by a test in S3.
  6. Secrets never persisted — covered by `redaction.spec.ts` (risk 5).
  7. Token budget — the CLI's `--help` is < 50 lines per subcommand; `overview` reuses the existing compact form; no new budget consumer.
  8. `outputSchema` for every public tool — the CLI's commands are not MCP tools; they wrap MCP tools and **propagate** the `outputSchema`; `schema_propagation` test enforces it.
  9. i18n complete or it doesn't ship — `lint:cli:i18n` and `apps/web/scripts/check-i18n.ts` enforce it on the CLI side; S7 acceptance is the gate.
  10. `tools/` and `scripts/` are TypeScript-exclusive — the new bun scripts in S2/S7 follow the `*.script.ts` convention.

### Verification commands

- `bun run validate` — root gate (typecheck + lint + lint:cli + lint:cli:i18n + tests).
- `bun --filter @mcp-vertex/cli test` — CLI suite (parser, formatters, commands, transports, integration).
- `bun --filter @mcp-vertex/cli typecheck` — CLI typecheck.
- `bun run cli -- status` — local smoke.
- `bun run cli --remote=stdio status` — remote smoke.
- `bun run cli -- search "assembleCliConfig" --max=5 --json` — search via remote.
- `bun run cli -- config doctor` — doctor on the active config.
- `bun run lint:cli` — internal-import gate + coverage gate.
- `bun run lint:cli:i18n` — i18n coverage gate.
- `bun run site:strict` — web i18n gate (touches `apps/web` and verifies `cliHelp` is complete in all 12 locales).
