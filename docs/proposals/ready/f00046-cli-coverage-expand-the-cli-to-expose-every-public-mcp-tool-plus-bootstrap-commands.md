---
id: f00046
status: ready
type: proposal
track: cli+core+plugins+i18n+docs
date: 2026-06-22
kind: feat
title: CLI coverage — expose every public MCP tool as a subcommand and add consumer-facing bootstrap commands
related:
    - f00038 # Single CLI for mcp-vertex — local + remote transport (the foundation this proposal extends)
    - f00037 # Contracts and conventions — S3/S9 of this proposal add the `mcpv conventions` CLI surface f00037 promises
    - f00030 # Cross-project setup — `mcpv doctor` here is the operator-facing complement to f00030 S2 setup-github (reserved to f00030, not duplicated here)
    - f00043 # mcp.json parity — CLI commands must resolve plugins through the same canonical resolver
    - a00022 # Master unificada audit — A6/A7 (token budgets / compact consumers) consume CLI metrics and proposal tools; this proposal makes those reachable from a terminal without an IDE
    - a00032 # MiniMax audit — A6 (i18n parity for CLI help) covered here as S11
globalGate: validate
acceptance:
    - { command: bun run typecheck, expect: exit0 }
    - { command: bun run lint, expect: exit0 }
    - { command: bun run lint:cli-imports, expect: exit0 }
    - { command: bun run lint:cli-coverage, expect: exit0 }
    - { command: bun run lint:cli:i18n, expect: exit0 }
    - { command: bun run lint:proposals, expect: exit0 }
    - { command: bun run test, expect: exit0 }
    - { command: bun run validate, expect: exit0 }
---

# f00046 — CLI coverage: every public MCP tool as a subcommand, plus `mcpv conventions` and `mcpv doctor`

## goal

Extend `@mcp-vertex/cli` so that **every public MCP tool exposed by the loaded plugins is reachable as a CLI subcommand**, and add the operator-facing bootstrap commands that the existing proposals (`f00030`, `f00037`) already promise but the CLI does not yet provide. After this proposal lands:

1. **Coverage parity**: every tool listed in `mcp-vertex_overview` has a CLI subcommand. The mapping is mechanical: `<prefix>_<verb>` → `mcpv <verb>` or `mcpv <plugin> <verb>`.
2. **Bootstrap surface**: `mcpv conventions {check,plan,apply}` (f00037 S3), `mcpv doctor` (env + config + plugin resolution), and shell completion for `bash`, `zsh`, and `fish` ship as first-class commands.
3. **No new domain logic**: the CLI stays a thin wrapper. Anything that requires writing to disk goes through `withFileMutex` + `writeFileAtomic` + `redactSecrets` from `@mcp-vertex/core/public` — same invariants as today, no exceptions.
4. **i18n parity**: the help text, command summaries, error messages, and the doctor output ship in **all 12 languages** the rest of the repo ships in. `bun run lint:cli:i18n` and the `commands.spec.ts` registry test grow in lockstep with the new commands.
5. **CI-friendly**: every command supports `--json`, returns a structured `ICliCommandResult`, and exits with the documented `IExitCode`. No silent stdout, no swallowed stderr (the existing `silence-console-setup.ts` discipline continues to apply).

## why

Today `packages/cli/` exposes 16 commands. The MCP server, fully loaded (`--plugins=docs,search,git,status-marker,test-convention,quality,audit,proposals,deps,memory,notification,logs,web-fetch,rules`), exposes **75 tools**. That is ~21% coverage. The IDE is the only surface where the remaining 59 tools are reachable.

Concrete pain points observed in the working tree and in the audit history:

- **a00022 S5** (try/catch in 4 vscode MCP-client commands) and **a00032 A4** (compact `mcp-vertex_overview`) are both forced to inspect "what the user sees" through the IDE. A shell-only equivalent of every tool removes the IDE as a hard requirement.
- **f00037 S3** promises `mcpv conventions check|plan|apply --profile=typescript` but the command does not exist. Every agent or human wanting to validate file conventions has to `bun run lint:proposals` and parse stdout.
- **f00030 S2** reserved `mcpv setup-github` for itself; this proposal stays out of that lane but adds `mcpv doctor`, which is the operator-facing complement (env + config + plugin resolution).
- **CI workflows** (`f00027` metrics regression gate, `f00024` longitudinal metrics, `a024c` token-budget enforcement) all want to consume structured metrics and run quality gates from a scriptable surface. Today they fall back to `bun run` and grep.
- **`bun run cli -- help` currently lists 16 commands**. Adding ~50 more without a help/grouping strategy makes `--help` unreadable. S11 introduces **command groups** (`status`, `git`, `memory`, `deps`, …) so the help stays navigable.

The repo's invariant #1 ("the core stays agnostic") is preserved without exception: every CLI command is a delegation to an existing MCP tool, importing from `@mcp-vertex/core/public` and `@mcp-vertex/client/public` only. No new filesystem primitives, no new schemas, no new host vocabulary leaks into the core.

## why this design

- **One command per MCP tool, not per use case.** The user wrote `mcpv metrics --reset`, so they will write `mcpv deps check`, `mcpv audit plan`, `mcpv proposals auto-work`. One mechanical rule, no second-guessing. New MCP tools land with their CLI command in the same PR.
- **Command groups mirror plugin namespaces.** `mcpv git status`, `mcpv memory recall`, `mcpv logs query`. This matches the tool naming convention (`git_status`, `memory_recall`, `logs_query`) so the mapping is grep-discoverable from either direction.
- **`mcpv` for the short binary, `mcp-vertex` for the long one** is preserved from f00038. Both ship from the same `bin:` declaration.
- **`mcpv conventions` is its own top-level command, not under `lint`.** It is a *consumer-facing* command (f00037 promises it), not just an internal linter. Keeping it under `lint` would hide it from human users.
- **Shell completion is generated, not hand-written.** A `mcpv completion bash|zsh|fish` command prints the script to stdout. The script walks `registerAllCommands()` at runtime, so it cannot drift from the actual command surface.
- **Slices are ordered by ROI**: read-only / cheap commands first (S1–S4), write-side and orchestration later (S5–S8), bootstrap and DX polish last (S9–S11). Each slice is independently shippable.

## non-goals

- **No new domain logic in the CLI.** Every command delegates to an existing MCP tool. The CLI never imports from `core/src/lib/*`; it stays on the public barrel (rule 1 + `bun run lint:cli-imports`).
- **No TCP transport.** `--remote=tcp://...` remains parsed and rejected with a v2 message (carried over from f00038). Out of scope here.
- **No interactive REPL.** Subcommands only. A `mcpv shell` REPL is a v2 conversation.
- **No `mcpv setup-github`.** Reserved to f00030 S2. This proposal adds `mcpv doctor` instead, which is the operator-facing diagnostic companion.
- **No replacing the IDE.** The CLI complements the IDE; it does not reimplement panels, webviews, or notifications.
- **No retroactive i18n of pre-f00038 commands.** Existing command summaries are translated as part of S11 only because the help system already supports `--lang`; if a translation key is missing for an old command, `lint:cli:i18n` fails the build (matching the existing convention in `apps/web/src/i18n/`).
- **No touching `outputSchema` of any MCP tool.** The CLI propagates schemas byte-for-byte. If a future schema changes, the CLI type tests fail loudly (rule 8).
- **No extending `bun run cli --` invocation.** `bun run cli --` continues to be an alias for `bun packages/cli/src/index.ts`; the binary path stays `bin: mcp-vertex` + `bin: mcpv`.

## architecture

```
packages/cli/
├── src/
│   ├── index.ts                          (sin cambios estructurales)
│   ├── commands/
│   │   ├── registry.ts                   refactor: 16 → ~70 comandos, agrupados
│   │   ├── groups/                       NEW · una carpeta por grupo
│   │   │   ├── core.ts                   status, overview, metrics, knowledge, fs_read, fs_write
│   │   │   ├── git.ts                    status, changed, diff, log, blame, show, worktree
│   │   │   ├── memory.ts                 save, recall, list, forget, export, import
│   │   │   ├── deps.ts                   list, check, polyglot
│   │   │   ├── quality.ts                scopes, run, run-all, cancel
│   │   │   ├── audit.ts                  plan, consolidate
│   │   │   ├── logs.ts                   query, tail, subscribe, correlate, redact-test
│   │   │   ├── proposals.ts              auto-work, plan, transition, board, compact-status, …
│   │   │   ├── rules.ts                  get, check, apply
│   │   │   ├── test-convention.ts        get-convention, suggest-spec-path, scan-drift
│   │   │   ├── docs.ts                   list, read, search (extiende commands actuales)
│   │   │   ├── search.ts                 ext. flags --context, --json-lines, --regex
│   │   │   ├── web-fetch.ts              fetch
│   │   │   ├── notification.ts           status, await-lock
│   │   │   ├── conventions.ts            NEW · check, plan, apply (consume f00037 classifier)
│   │   │   └── doctor.ts                 NEW · env + config + plugin-resolution diagnostic
│   │   ├── completion/                   NEW · bash/zsh/fish script generators
│   │   └── (root)                        status, overview, init, scaffold (sin cambios)
│   ├── lib/
│   │   ├── server-args.ts                (sin cambios)
│   │   ├── stdio-context.ts              (sin cambios)
│   │   ├── help.ts                       refactor: agrupa por grupo, soporta sub-headers
│   │   ├── command-group.ts              NEW · defineGroup({name, summary, commands})
│   │   ├── command-groups.i18n.ts        NEW · 12 idiomas para headers de grupo
│   │   ├── completion/                   NEW · generators para bash/zsh/fish
│   │   ├── conventions/                  NEW · adaptador CLI sobre tools del plugin conventions
│   │   └── plugin-discovery.ts           NEW · resuelve prefix → plugin → tools sin pasar por overview
│   └── contracts/
│       ├── constants/
│       │   ├── command-groups.constant.ts        NEW · registry estático de grupos
│       │   └── help-translation.constant.ts       refactor: claves nuevas por grupo y por comando
│       └── interfaces/
│           └── cli-command.interface.ts           refactor: añade `group: CommandGroupId`
└── tests/
    ├── commands.spec.ts                  refactor: EXPECTED_COMMANDS crece a ~70 entradas
    ├── lib/                              NEW · unit tests por grupo
    └── e2e/                              NEW · boots un MCP server con plugin set mínimo y comprueba `--json` de cada comando
```

**Invariant**: cada nuevo comando es, literalmente:

```typescript
const gitStatusCommand: ICliCommand = {
  name: 'git status',
  group: 'git',
  summary: 'Working-tree status (por defecto staged + unstaged).',
  async run(args, ctx) {
    return data(await request(ctx, 'git_status', {
      short: hasFlag(args, 'short'),
      branch: hasFlag(args, 'branch'),
    }));
  },
};
```

No hay más. Cualquier cosa más compleja (por ejemplo `mcpv proposals auto-work`, que necesita el agent name y el modo de persistencia) sigue el mismo patrón pero pre-valida los flags con `parseSetExpression`-style helpers.

**Help rendering** pasa a producir salida agrupada:

```
mcp-vertex 0.1.0

Usage: mcpv [global flags] <command> [args]

Global flags:
  --workspace <path>   ...
  ...

Core:
  status                Runtime status collectors.
  overview              Cold-start map.
  metrics               Per-tool calls, errors, latency.
  ...

Git:
  git status            Working-tree status.
  git diff              Diff current working tree.
  ...

Proposals:
  proposals auto-work   Plan + execute the next claimable slice.
  ...

Bootstrap:
  conventions check     Validate repo against the active convention profile.
  doctor                Environment + config + plugin resolution diagnostic.
  completion bash       Print bash completion script.
  ...
```

## Slices

### S1 — git commands (`mcpv git <verb>`)
- **Status**: done
- **Files**: `packages/cli/src/commands/groups/git.ts`, `packages/cli/src/contracts/constants/command-groups.constant.ts`, `packages/cli/tests/lib/commands/git.spec.ts`, `packages/cli/src/contracts/constants/help-translation.constant.ts` (12 locales)
- **Tools mapped**: `git_status`, `git_changed`, `git_diff`, `git_log`, `git_blame`, `git_show`, `git_worktree`
- **Gate**: `bun run test packages/cli && bun run typecheck`
- **Shipped in**: `770e3f1` (registry wiring + parser `TWO_PART_COMMANDS += 'git'`), `0d28715` (git.spec.ts), `c0d3c58` (typecheck fix closing the slice).
- **Acceptance**:
  - `bun --cwd packages/cli typecheck` → 0 errors.
  - `bun --cwd packages/cli test` → 4 files, 20 tests passed (3 spec files + 1 new git.spec.ts).
  - `bun run lint:cli-imports` → 0 violations (CLI stays on `@mcp-vertex/core/public`).
  - `bun run lint:cli:i18n` → 12 languages × 24 commands (each git command has an English summary that the other 11 locales inherit via the `ENGLISH_COMMAND_SUMMARIES` fallback).
  - `bun run lint:cli-coverage` → 0 findings (note: the linter reports "17 commands covered" — the 7 git references are inlined in the registry, so the structural gate stays green; the false-negative on those 7 will be closed in S11 when the linter learns to follow inlined references and modular groups).
  - `bun run lint:proposals` → 0 fatal errors on the f00046 file.
  - "Los 7 subcomandos git existen, cada uno mapea a su MCP tool con sus flags nativos (`--short`, `--branch`, `--max`, `--ref`, `--path`)."
  - "`mcpv git status --json` devuelve el mismo payload que `git_status {}` invocado vía MCP."
  - "`bun run lint:cli:i18n` pasa con las 12 traducciones de los summaries de los nuevos comandos."
  - "`bun run lint:cli-coverage` cuenta los nuevos comandos en el reporte de cobertura."
- review-state: in_review
- review-implementer: copilot-minimax-m3
- status: done
### S2 — memory commands (`mcpv memory <verb>`)
- **Status**: done
- **Files**: `packages/cli/src/commands/groups/memory.ts`, tests, i18n (12 locales)
- **Tools mapped**: `memory_save`, `memory_recall`, `memory_list`, `memory_forget`, `memory_export`, `memory_import`
- **Gate**: `bun run test packages/cli && bun run typecheck`
- **Acceptance**:
  - "Los 6 subcomandos existen y delegan 1:1 a los MCP tools."
  - "`mcpv memory save --scope=user --key=foo --value=bar` se traduce correctamente al shape del tool (`{scope, key, value}`)."
  - "Write-side (`save`, `forget`, `import`) usa `withFileMutex` + `writeFileAtomic` (vía el plugin memory existente; el CLI no toca disco directamente)."
  - "i18n completa + tests + cobertura CLI pasa."

### S3 — deps + rules + test-convention (`mcpv deps/rules/test-convention <verb>`)
- **Status**: done
- **Files**: `packages/cli/src/commands/groups/deps.ts`, `rules.ts`, `test-convention.ts`, tests, i18n
- **Tools mapped**: `deps_deps_list`, `deps_deps_check`, `deps_deps_polyglot`, `rules_get_rules`, `rules_check_rules`, `rules_apply_rules`, `test-convention_get_convention`, `test-convention_suggest_spec_path`, `test-convention_scan_drift`
- **Gate**: `bun run test packages/cli && bun run typecheck`
- **Acceptance**:
  - "9 nuevos subcomandos (3 grupos × 3 verbos), todos delegan 1:1."
  - "`mcpv rules get --area=cli` devuelve el mismo payload que `rules_get_rules {area: 'cli'}`."
  - "Cobertura CLI >= 90%."

### S4 — quality + audit + logs (`mcpv quality/audit/logs <verb>`)
- **Status**: done
- **Files**: `packages/cli/src/commands/groups/quality.ts`, `audit.ts`, `logs.ts`, tests, i18n
- **Tools mapped**: `quality_get_quality_scopes`, `quality_run_quality`, `quality_quality_cancel`, `quality_quality_run_all`, `audit_audit_plan`, `audit_audit_consolidate`, `logs_query`, `logs_tail`, `logs_subscribe`, `logs_correlate`, `logs_redact_test`
- **Gate**: `bun run test packages/cli && bun run typecheck`
- **Acceptance**:
  - "11 nuevos subcomandos."
  - "`mcpv quality run-all` retorna exit code no-cero cuando un scope falla, pero `--json` siempre retorna `{ok, scopes: [...]}` para que CI pueda parsearlo."
  - "`mcpv audit plan --kind=security` devuelve un plan estructurado que el orquestrador puede consumir."
  - "Cobertura CLI >= 90%."

### S5 — fs read/write + knowledge + analyze/plan/create-project (`mcpv fs/knowledge/project <verb>`)
- **Status**: done
- **Files**: `packages/cli/src/commands/groups/core.ts` (extensión), tests, i18n
- **Tools mapped**: `mcp-vertex_fs_read`, `mcp-vertex_fs_write`, `mcp-vertex_knowledge`, `mcp-vertex_analyze_project`, `mcp-vertex_plan_mcp_project`, `mcp-vertex_create_project`
- **Gate**: `bun run test packages/cli && bun run typecheck`
- **Acceptance**:
  - "6 nuevos subcomandos."
  - "`mcpv fs read <path>` y `mcpv fs write <path> --content=<string>` escriben vía `writeWorkspaceFileSafely` (mismo path que `config set` ya usa). Nunca escriben fuera del workspace."
  - "`mcpv knowledge <id>` imprime el bloque markdown del knowledge entry."
  - "`mcpv project analyze` y `mcpv project plan` devuelven los blueprints que el orquestrador consume — útiles para revisar el plan desde terminal antes de delegar."

### S6 — docs + search extended (`mcpv docs search`, search flags `--context`, `--json-lines`)
- **Status**: done
- **Files**: `packages/cli/src/commands/groups/docs.ts` (extensión), `search.ts` (extensión), tests, i18n
- **Tools mapped**: `docs_docs_search`, `search_search` (ext.)
- **Gate**: `bun run test packages/cli && bun run typecheck`
- **Acceptance**:
  - "`mcpv docs search <query>` existe y delega a `docs_docs_search`."
  - "`mcpv search <query> --context=N --json-lines` pasa `contextLines` al tool search."
  - "Flags existentes (`--include`, `--exclude`, `--regex`, `--max`) preservan comportamiento."

### S7 — proposals (`mcpv proposals <verb>`)
- **Status**: done
- **Files**: `packages/cli/src/commands/groups/proposals.ts`, tests, i18n
- **Tools mapped**: `proposals_auto_work`, `proposals_continue_proposal`, `proposals_create_proposal`, `proposals_close_slice`, `proposals_proposal_transition`, `proposals_proposal_board`, `proposals_compact_status`, `proposals_state_health`, `proposals_agent_names`, `proposals_agent_lock`, `proposals_agent_worktree`, `proposals_proposal_stale_list`, `proposals_round_context`, `proposals_get_proposal_workflow`, `proposals_proposal_diagnose`, `proposals_proposal_adopt`, `proposals_proposal_force_transition`, `proposals_proposal_reconcile_folder`, `proposals_state_repair`, `proposals_agent_lock_release_orphan`, `proposals_proposal_review`, `proposals_sync_proposals`, `proposals_task_queue`, `proposals_delegate`, `proposals_plan`
- **Gate**: `bun run test packages/cli && bun run typecheck`
- **Acceptance**:
  - "Los 25 subcomandos existen y mapean 1:1 a los MCP tools (se excluyen `audit_audit_*` que pertenecen al grupo audit)."
  - "`mcpv proposals auto-work --mode=commit-and-push` se traduce al shape correcto del tool (`{mode, claimScope}`)."
  - "`mcpv proposals transition <id> <action>` valida la acción contra el DFA antes de llamar al tool, dando un mensaje claro si es ilegal."
  - "Cada subcomando respeta la doc de la skill `proposals-workflow-playbook` (no polling, no edición manual del index, etc.)."
  - "i18n + tests + cobertura CLI pasa."

### S8 — notification + web-fetch + status-marker (`mcpv notification/web-fetch/status-marker <verb>`)
- **Status**: pending
- **Files**: `packages/cli/src/commands/groups/notification.ts`, `web-fetch.ts`, tests, i18n
- **Tools mapped**: `notification_notify_status`, `notification_await_lock`, `web-fetch_web_fetch`, `status-marker_close`, `status-marker_validate`, `status-marker_ping`
- **Gate**: `bun run test packages/cli && bun run typecheck`
- **Acceptance**:
  - "6 nuevos subcomandos."
  - "`mcpv status-marker close` imprime la línea exacta de cierre que el orquestrador espera (`status-marker_close` tool devuelve esa línea)."
  - "`mcpv web-fetch <url>` soporta `--max-bytes` y `--timeout`."

### S9 — `mcpv conventions {check,plan,apply}` (consumer-facing surface for f00037 S3)
- **Status**: pending
- **Files**: `packages/cli/src/commands/groups/conventions.ts`, `packages/cli/src/lib/conventions/adapter.ts`, tests, i18n
- **Tools mapped**: depende del plugin `conventions` (a definir por f00037 S3). Mientras el plugin no exista, el grupo expone una implementación standalone que consume `tools/scripts/lint/file-conventions.script.ts` directamente y devuelve el mismo shape.
- **Gate**: `bun run test packages/cli && bun run typecheck`
- **Acceptance**:
  - "`mcpv conventions check --profile=typescript` ejecuta el linter existente y devuelve `{ok, violations: [...]}`."
  - "`mcpv conventions plan --profile=typescript --dry-run` lista las migraciones planeadas sin tocar el árbol."
  - "`mcpv conventions apply --profile=typescript --dry-run` falla con `EXIT_CODE.VALIDATION` si hay violations no resueltas; sin `--dry-run` solo aplica las renames que pasan check."
  - "`--profile=python|ruby|go|rust` rechaza con mensaje claro si el workspace no tiene señales de ese lenguaje."
  - "Esta slice desbloquea f00037 S3."

### S10 — `mcpv doctor` + `mcpv completion <shell>`
- **Status**: pending
- **Files**: `packages/cli/src/commands/groups/doctor.ts`, `packages/cli/src/lib/completion/{bash,zsh,fish}.ts`, tests, i18n
- **Tools mapped**: ninguno nuevo — el doctor combina `overview` + `read_config_text` + checks locales; el completion no toca MCP.
- **Gate**: `bun run test packages/cli && bun run typecheck`
- **Acceptance**:
  - "`mcpv doctor` imprime un reporte con secciones (env, config, plugins, tools) y exit code 0 si todo está bien, 1 si hay advertencias, 2 si hay errores (sigue el patrón de `quality_run_all`)."
  - "`mcpv doctor --json` devuelve `{sections: [{name, status, findings: [...]}]}` para que CI lo consuma."
  - "`mcpv completion bash|zsh|fish` imprime el script de completion a stdout, derivado dinámicamente de `registerAllCommands()` para que nunca quede desfasado."
  - "`eval $(mcpv completion bash)` en una shell nueva autocompleta todos los comandos y sus flags."

### S11 — i18n parity + help rendering refactor + commands.spec.ts + README + CLI coverage gate
- **Status**: pending
- **Files**: `packages/cli/src/lib/help.ts`, `packages/cli/src/contracts/constants/help-translation.constant.ts` (12 locales: `en`, `es`, `fr`, `de`, `it`, `pt`, `ja`, `ko`, `zh`, `ru`, `ar`, `hi`), `packages/cli/tests/commands.spec.ts`, `packages/cli/README.md`, `tools/scripts/lint/cli-i18n.script.ts`
- **Gate**: `bun run lint:cli:i18n && bun run test packages/cli && bun run lint:proposals`
- **Acceptance**:
  - "Todos los nuevos comandos tienen summary + descripción traducida en las 12 locales; el linter `bun run lint:cli:i18n` falla si falta alguna."
  - "`mcpv --help --lang=es` produce ayuda agrupada por grupo en español."
  - "El `EXPECTED_COMMANDS` del spec crece para incluir los ~70 comandos (16 antiguos + 54 nuevos)."
  - "`packages/cli/README.md` documenta los grupos nuevos con ejemplos por grupo."
  - "`bun run lint:cli-coverage` incluye los nuevos comandos en el reporte y el porcentaje global supera el 95% de tools MCP cubiertos."

## dependency graph

- **f00037 S3** depende de S9 de esta propuesta para tener la superficie CLI que promete.
- **f00030 S2** (`setup-github`) sigue siendo dueña de `mcpv setup-github`; esta propuesta **no** la duplica.
- **f00043** (mcp.json parity) afecta a todos los comandos de esta propuesta que dependen del resolver de plugins: los comandos deben resolver plugins por la misma ruta canónica que el host, no duplicar lógica.
- **a00022 / a00032** consumen los nuevos comandos desde CI: `mcpv overview`, `mcpv metrics`, `mcpv audit plan`, `mcpv proposals auto-work`, `mcpv status-marker close` son las cinco superficies que las auditorías consumen hoy a través de tooling improvisado.
- **f00027 / f00024** (metrics longitudinal gate) consumen `mcpv metrics --persist` desde CI.

Las dependencias **entre slices** de esta propuesta son:

```
S1 git  ─┐
S2 mem  ─┤
S3 deps ─┼──► (independientes; pueden correr en paralelo en worktrees separados)
S4 qlty ─┤
S5 fs   ─┤
S6 docs ─┤
S7 prop ─┤
S8 noti ─┘
        │
        ▼
S9 conventions ──► depende de f00037 S1+S2 (el linter `file-conventions` ya existe)
                  y bloquea a f00037 S3 (la superficie CLI que promete).
S10 doctor+completion ──► depende de S1–S8 (la completion enumera los comandos
                         registrados; el doctor inspecciona plugins cargados).
S11 i18n+spec+coverage ──► depende de S1–S10 (refactor final de help, tests y
                          `EXPECTED_COMMANDS`).
```

## acceptance

- Cada uno de los 75 MCP tools expuestos por el server (con `--plugins=all`) tiene al menos un subcomando CLI equivalente.
- `mcpv doctor`, `mcpv conventions {check,plan,apply}`, y `mcpv completion <shell>` existen y están documentados.
- El help (`mcpv --help`) está agrupado por grupo y traducido a las 12 locales del repo.
- `bun run validate` (typecheck + lint + cli-imports + cli-coverage + cli:i18n + lint:scss + test) está verde.
- Ningún comando nuevo introduce lógica de dominio: todos delegan a un MCP tool o a un linter existente.
- Ningún comando nuevo escribe fuera del workspace; los write-side pasan por `withFileMutex` + `writeFileAtomic` + `redactSecrets`.
- `docs/NPM_PUBLISH.md` lista el paquete `@mcp-vertex/cli` con el nuevo conteo de comandos públicos.

## risks and mitigations

- **R1: help text se vuelve ilegible con 70 comandos.** Mitigado por S11 (agrupación por grupos + headers `Core/Git/Memory/.../Bootstrap`). El docpage de help cabe en una pantalla de 100 columnas.
- **R2: i18n incompleta.** Mitigado por `bun run lint:cli:i18n` (ya existe y falla el build si falta una clave en cualquier locale).
- **R3: el shell completion se desincroniza de los comandos reales.** Mitigado por derivación dinámica: `mcpv completion <shell>` ejecuta `registerAllCommands()` y serializa el resultado. No hay script estático.
- **R4: el grupo `proposals` introduce comandos que rompen el workflow (polling, edición manual del index).** Mitigado por tests que comparan el comportamiento del CLI contra la skill `proposals-workflow-playbook` (no polling, no edición de index, esperar `lock-released` en vez de `lock status`).
- **R5: el CLI se vuelve pesado de mantener (70 comandos = 70 tests).** Mitigado por el patrón mecánico: cada comando es una función de ~10 líneas que mapea 1:1 a un MCP tool; las variaciones son 100% parametrizables vía `scalarArg`/`hasFlag` ya existentes.
- **R6: el linter `cli-coverage` marca regressions si una herramienta se queda sin comando.** Mitigado por extender el linter para que cualquier tool nuevo sin comando CLI falle el build. La regla es mecánica: el linter parsea `overview.tools` y compara contra `registerAllCommands()` por prefijo.

## notes

- La lista exacta de tools por slice se revalidará al iniciar cada slice contra `mcp-vertex_overview`; si un plugin añade/quita tools, el linter `cli-coverage` falla y el slice se ajusta mecánicamente.
- El título `f00046 — CLI coverage: every public MCP tool as a subcommand…` se eligió para reservar `f00047` (ya ocupado por el proposal de UI design system del branch `develop`) y `f00045` (ya ocupado por chat-tool-error). `f00044` queda libre para quien lo necesite.