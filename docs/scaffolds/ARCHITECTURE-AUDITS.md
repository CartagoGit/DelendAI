---
applies-to: docs/proposals/**/a*.md
---

# Architecture: audits

## Purpose

Audits are a special kind of proposal (prefix `a`, kind `audit`) designed to evaluate a scope of the codebase, document findings, and specify the resolution tracks for those findings. By modeling audits as proposals, we track their execution, review, and validation through the standard proposal lifecycle.

## Filename Convention

Every audit must follow the exact filename structure:
`{numAuditoria}-{DD}-{MM}-{YYYY}-{controladorModelo}-{modelo}-{queSeHaAuditado}.md`

Where:
- `numAuditoria` is the chronological identifier, zero-padded to 5 digits per f00014 (e.g., `a00021`).
- `DD`, `MM`, `YYYY` is the day, month, and 4-digit year (e.g., `21-06-2026`).
- `controladorModelo` is the client/runner driving the model (e.g., `antigravity`, `claude-code`, `codex`, `copilot`).
- `modelo` is the AI model used (e.g., `deepmind`, `gpt-5-5`, `opus-4-8`).
- `queSeHaAuditado` describes the audited scope (e.g., `repositorio`, `plugins`, `apps`, `web`, `extensionvscode`).

## Required Shape

An audit proposal must be structured with the following metadata and sections:

### 1. Frontmatter
Must include standard proposal frontmatter with `kind: audit`, `id: aNNNNN` (5-digit padded), and the appropriate status/track:
```yaml
---
id: a00021
kind: audit
title: "Auditoría Independiente — [Revisor] ([Modelo])"
status: ready # or in-progress, review, done
date: YYYY-MM-DD
track: archive # or the specific component track being audited
ownership:
  - { agent: implementation_runner, task: 's1: Execute audit and document findings' }
acceptance:
  - { command: bun run validate, expect: exit0 }
---
```

### 2. Required Sections (in canonical order)

- **`## Goal`**: Contains the scope of the audit, date of execution, audited HEAD commit hash, and the revisor/model.
- **`## Why`**: Contains the detailed audit verdict (estimated score, layers evaluation, cross-cutting hygiene, token/loop analysis, and top actions) structured with H3 subheadings.
- **`## Non-goals`**: Explicitly states what is out of scope for the audit.
- **`## Slices`**: The slices of work that can be resolved *within the audit itself* (e.g. S1 for audit execution, S2..SN for immediate fixes/cleanups done during the audit).
- **`## Acceptance`**: Standard acceptance criteria for closing the audit.
- **`## Verified State`**: Quantitative facts about the codebase state during validation (LOC, test count, coverage, Biome warnings, build commands, etc.).
- **`## Findings`**: A prioritized list/table of findings with severity, description, file references, and **Resolution Track** (separating what is resolved in the audit's own slices from what is deferred to individual proposals).
- **`## Scoreboard`**: A tabular evaluation of different dimensions (e.g. Core, Plugins, Concurrency, Security) with a score out of 10 and detailed comments.

### 3. Optional Sections
- **`## Notes`**: Any additional context or remarks.

---

## Separation of Resolutions (Slices vs. Proposals)

Every finding in `## Findings` must declare a **Resolution Track**:
1. **Resolved in Audit Slices**: If the fix is minor, trivial, or directly manageable during the audit, it should be mapped to a slice (e.g., `S2 — fix Biome deprecation warning`) and resolved before the audit is closed.
2. **Deferred to Individual Proposals**: If the fix is a larger feature, significant refactoring, or a complex bug, it must be split into a separate, new proposal (e.g., `f00120`, `x00122`) and linked as a follow-up.

### Lifecycle & Status Rules

- **Pending Tasks**: If the audit has tasks or slices to be executed within its own scope, the proposal must be created under `docs/proposals/ready/` with `status: ready` and all slices set to `pending`.
- **No Internal Tasks**: If the audit has no internal tasks (e.g., all findings are deferred to separate proposals, or there are no findings), the audit should be created directly under `docs/proposals/done/audits/` with `status: done` and reference/link the deferred proposals.

---

## Mandatory Audit Methodology

**This is not optional.** Before writing a single line of the audit document, the auditor MUST perform exhaustive qualitative analysis of the actual source code. Audits that rely solely on running automated commands (`bun run validate`, `biome ci`) without reading and reasoning about the code are **invalid**.

### Phase 1 — Structural orientation (tools allowed)

Run automated commands to collect baselines: LOC counts, test counts, coverage, Biome warnings, build output. This is the *floor*, not the ceiling, of what an audit covers.

### Phase 2 — Exhaustive LLM code reading (REQUIRED, no shortcuts)

The auditor **must read and reason about** the actual source files in the following order. For each layer, open the files and extract concrete evidence:

#### 2.1 Core packages (`packages/core`, `packages/client`)
- Read `src/lib/contracts/`, `src/lib/plugins/`, `src/lib/cli/`, `src/lib/bootstrap/`, `src/lib/scaffold/`, `src/lib/tools/`.
- Identify: contract violations (`process.cwd()` in engines), placeholder/dead code, sync I/O in hot paths, missing `outputSchema`, broken barrel exports.
- Extract: actual TypeScript snippets with real line numbers for every finding.

#### 2.2 Every plugin (`plugins/*`)
- Read the plugin's `src/` directory: engines, tools, shared utilities, schemas.
- Identify: non-atomic writes, duplicated logic, host-specific vocabulary leaking into generic plugin contracts, missing mutex wrapping, `@ts-ignore` / `@ts-nocheck`, leftover `console.log`.
- Confirm each finding with a code excerpt and file reference (`file#LNN`).

#### 2.3 Extensions (`extensions/*`)
- Read `extensions/vscode/src/` — host integration, activation, webview bridge, service wiring.
- Identify: UI panel lifecycle issues, message passing without validation, missing error boundaries, VS Code API misuse.

#### 2.4 UI extension (`packages/ui-extension`)
- Read components, panels, command palette, brand assets.
- Identify: hardcoded strings that should be i18n keys, missing semantic HTML, accessibility gaps, host-import violations.

#### 2.5 Apps (`apps/web`)
- Read Astro pages, i18n keys, Pagefind configuration, generated content pipelines.
- Identify: missing translation keys, broken `data-pagefind-body` annotations, stale generated docs, SEO gaps.

#### 2.6 Tools and scripts (`tools/`, `scripts/`)
- Read entrypoints (`*.script.ts`) and their supporting modules.
- Identify: forbidden non-TS extensions, missing error handling, `process.cwd()` usage, duplicated logic with core utilities.

#### 2.7 Test suite (`tests/`, `*.spec.ts` colocated)
- Read spec files for the most critical engines.
- Identify: untested concurrency paths, stale snapshots, specs that test implementation details instead of contracts, missing mutation/property-based tests.

#### 2.8 Concurrency & locking analysis
- Trace every durable write path (anything that writes a JSON file) and verify it uses `withFileMutex` + `writeFileAtomic`.
- Identify any read-only path that bypasses the mutex and could observe torn state.
- Document every identified deadlock scenario in a table with: scenario, risk, existing mitigation, and gap.

#### 2.9 Token-efficiency analysis
- Enumerate every tool that contributes to the hot path (`overview`, `auto_work`, `round-context`).
- Verify the compact budget invariant is not regressed.
- Identify any instruction prose in tool descriptions that is redundant or compressible.

#### 2.10 Skills & cross-cutting concerns
- Read `skills/` and check alignment between skill instructions and current implementation (stale paths, wrong tool names, missing new tools).
- Check `AGENTS.md` hard rules for any violations found in the codebase.
- Scan for `redactSecrets` coverage on every durable store.

### Phase 3 — Synthesize and write

Only after completing Phase 2 does the auditor write the audit document. Every finding in `## Findings` MUST include:
- A real file reference with line numbers.
- A concrete code snippet that demonstrates the issue.
- A clear explanation of the impact.
- A resolution track (slice vs. deferred proposal).

Findings without code evidence are **not findings** — they are speculation and must not appear in the audit.

---

## Template

Use the following template to create new audit proposals:

```markdown
---
id: aNNN
kind: audit
title: "Auditoría — [Revisor/Model]"
status: ready
date: YYYY-MM-DD
track: archive
ownership:
  - { agent: implementation_runner, task: 's1: Execute audit and document findings' }
acceptance:
  - { command: bun run validate, expect: exit0 }
---

# aNNN — Auditoría — [Revisor/Model]

## Goal

- **Audited Scope**: [e.g. packages/core and plugins/proposals]
- **Audited HEAD**: [e.g. `0f54f33`]
- **Revisor / Model**: [e.g. Gemini 3.5 Flash]
- **Date**: YYYY-MM-DD

## Why

### 0. Veredicto rápido
[Escribe el veredicto general en 1-2 párrafos, indicando la nota media estimada (ej. 9.2/10) y la salud global del código.]

### 1. Por capas (Núcleo, Cliente, Plugins, Aplicaciones, etc.)
- **Núcleo (`packages/core`)**: [Evaluación del núcleo, desacoplamiento y primitivas.]
- **Cliente (`packages/client`)**: [Evaluación de la capa de cliente y servicios.]
- **Plugins (`plugins/*`)**: [Inspección y estado de los plugins del monorepo.]
- **Aplicaciones (`apps/*` / `extensions/*`)**: [Evaluación de la app web Astro, extensión VS Code u otras.]

### 2. Higiene transversal
- **Redacción de secretos**: [Verificación de que se usa `redactSecrets` antes de persistir.]
- **Workspace containment**: [Verificación de que se contiene el path con `resolveWorkspaceContained`.]
- **console.log residual**: [Verificación de que no hay logs en código de producción.]
- **@ts-ignore / @ts-nocheck**: [Verificación de que no hay directivas de exclusión de tipos en producción.]

### 3. Eficiencia / tokens / bucles / bloqueos
- **Eficiencia de tokens**: [Análisis de consumo de tokens (lazy knowledge, overview compacto).]
- **Bucles / bloqueo**: [Análisis de posibles bucles (continuity policy, loop detector) y bloqueos concurrentes.]

### 4. Top acciones para 10/10 (prioridad)
1. **[Acción 1]**: [Descripción]
2. **[Acción 2]**: [Descripción]

## Non-goals

- [Describe what is NOT covered by this audit]

## Slices

- global_gate: lint

### s1 — Execute audit and document findings
- files: docs/proposals/in-progress/aNNN-auditoria-[slug].md
- gate: lint
- status: pending

### s2 — [Immediate Fix Description]
- files: [files to modify]
- gate: lint
- status: pending

## Acceptance

- `bun run validate` is green (exit code 0).
- All immediate fixes (S2..) are implemented and verified.
- The audit report is fully documented and synchronized.

## Verified State

| Aspect | Metric / Command | Result / Count |
|---|---|---|
| LOC | count LOC | ~20,000 LOC |
| Test suite | `bun run test` | 441 tests passed |
| Biome lint | `biome ci` | 0 errors, 1 warning |

## Findings

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| H1 | P0 | [Description of severe issue] | [file link](file:///...) | Resolved in slice `s2` |
| H2 | P1 | [Description of medium issue] | [file link](file:///...) | Deferred to Proposal `xNNN` |

## Scoreboard

| Dimension | Score | Comments |
|---|---:|---|
| Core Packages | 9.5 | Excellent design |
| Plugins | 8.8 | Some minor síncrono I/O |
| Security | 7.0 | Lacks some controls |
| **Total (Average)** | **8.4** | **Solid foundation** |
```

## Validation

Run `bun run lint:proposals` to ensure the audit proposal conforms to the sections, frontmatter, and canonical order.
Run `bun run lint:scaffolds` to ensure this scaffold stays discoverable and well-formed.

Before running an audit, read `skills/audit-playbook/SKILL.md` — it contains the step-by-step protocol for the mandatory qualitative LLM code-reading phases that must precede writing any audit document.
