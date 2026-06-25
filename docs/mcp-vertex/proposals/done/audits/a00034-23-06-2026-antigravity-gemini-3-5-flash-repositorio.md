---
id: a00034
status: done
type: proposal
track: audit+concurrency+docs+testing
date: 2026-06-23
kind: audit
title: Exhaustive Qualitative Audit
shipped-in:
  - 43d452d
related:
  - a00033
  - f00037
  - f00046
ownership:
  - {
      agent: implementation_runner,
      task: 'S1: Perform exhaustive qualitative audit and document findings.',
    }
globalGate: lint
acceptance:
  - { command: bun run validate, expect: exit0 }
  - { command: bun run lint:proposals, expect: exit0 }
---

# a00034 — Exhaustive Qualitative Audit

## Goal

Perform an exhaustive qualitative audit of the `mcp-vertex` monorepo at HEAD commit `43d452d`. The goal is to analyze the codebase against `AGENTS.md` hard rules and conventions, identify design gaps, concurrent safety issues, under-testing, and legacy references, triaging them into actionable deferred proposals.

## Verified State

| Aspect | Source / Command | Result |
|---|---|---|
| HEAD Commit | `git log -1` | `43d452d` (feat: add conventions plugin with configuration files) |
| Test suite | `bun run test` | 226/226 files passed, 1629/1629 tests passed |
| Monorepo Build | `bun run build` | Built 19 packages/plugins successfully |
| Static Analysis | `biome ci .` / `typecheck` | `typecheck` ok, biome warnings in `.continue/config` and CLI let ctx |
| Codebase size | `find packages plugins extensions apps tools -name '*.ts' | xargs wc -l` | 119,018 lines of TypeScript code |

## Findings

| ID | Severity | Description | Files | Resolution Track |
|---|---|---|---|---|
| H1 | P2 | The `conventions` plugin is missing its source code/implementation (`src/` and `tests/`) despite its package layout being added in commit `43d452d`. | `plugins/conventions/package.json` | Deferred to proposal `f00037` (ready) |
| H2 | P3 | `agent-lock-engine.ts` is over 300 LOC (413 lines) but only has 2 spec files instead of the required ≥3. | [agent-lock-engine.ts#L170](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/locks/agent-lock-engine.ts#L170) | Deferred to a new testing proposal |
| H3 | P3 | `sync-proposal-registry.ts` is over 300 LOC (603 lines) but only has 2 spec files instead of the required ≥3. | [sync-proposal-registry.ts#L510](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L510) | Deferred to a new testing proposal |
| H4 | P3 | The `round-context` sub-modules (`round-context-digest.ts`, etc., totalling ~500 LOC) have 0 dedicated unit test spec files. | [round-context.ts#L1](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/swarm/round-context.ts#L1) | Deferred to a new testing proposal |
| H5 | P1 | `log-store.ts` reads (`readAllFiles`) are not protected by the file mutex, risking torn reads under concurrent writes. | [log-store.ts#L64](file:///home/cartago/_projects/mcp-vertex/plugins/logs/src/lib/log-store.ts#L64) | Deferred to a new bugfix proposal |
| H6 | P3 | Token budget skills refer to legacy/unqualified tool names like `proposal_board` and `state_health` instead of qualified names. | [mcp-vertex-token-budget-discipline/SKILL.md#L11](file:///home/cartago/_projects/mcp-vertex/skills/mcp-vertex-token-budget-discipline/SKILL.md#L11) | Deferred to a new documentation proposal |

---

### 1. Conventions plugin implementation missing
**File**: `plugins/conventions/package.json`

```json
	"main": "./dist/index.js",
	"files": [
		"dist",
		"README.md",
		"LICENSE"
	],
```

**Problem**: The `plugins/conventions/` directory was bootstrapped with `package.json`, `tsconfig.json`, and `vitest.config.ts` in commit `43d452d`, but its `src/` directory, linter profiles, and unit tests do not exist on disk.
**Impact**: Any attempt to load this plugin (`--plugins=conventions`) fails at startup, and the consumer-facing `mcpv conventions` commands promised by `f00037` cannot be implemented against the plugin.
**Resolution Track**: Deferred to proposal `f00037` (currently in `ready` state).

---

### 2. Lock engine is undertested
**File**: [`agent-lock-engine.ts#L170`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/locks/agent-lock-engine.ts#L170)

```typescript
export async function runAgentLockEngine(
	args: IAgentLockArgs,
	deps: IAgentLockDeps = {},
): Promise<IAgentLockResponse> {
```

**Problem**: The `agent-lock-engine.ts` module contains critical concurrency logic and holds 413 lines of code (exceeding the 300 LOC threshold for core engines), but only has 2 spec files (`agent-lock-contention.spec.ts` and `concurrent-claims.spec.ts`).
**Impact**: Higher risk of regression in locking safety or stale-claim GC logic when modifications are introduced.
**Resolution Track**: Deferred to a new testing proposal.

---

### 3. Sync proposal registry is undertested
**File**: [`sync-proposal-registry.ts#L510`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/proposals/sync-proposal-registry.ts#L510)

```typescript
export async function syncProposalRegistry(
	root: string,
	layout: Pick<
		IHostPathLayout,
		'proposalsDir' | 'proposalIndexFile'
	> = DEFAULT_PATH_LAYOUT,
```

**Problem**: `sync-proposal-registry.ts` is 603 lines of code and contains vital proposal indexing, folder relocation, and state transitions, but only has 2 spec files (`sync-proposal-registry-race.spec.ts` and `sync-proposal-registry-reconcile.spec.ts`).
**Impact**: Greater likelihood of silent failures or concurrency bugs going undetected during registry sync or auto-resolution of blocked proposals.
**Resolution Track**: Deferred to a new testing proposal.

---

### 4. Round context sub-modules lack unit tests
**File**: [`round-context.ts#L1`](file:///home/cartago/_projects/mcp-vertex/plugins/proposals/src/lib/swarm/round-context.ts#L1)

```typescript
export * from './round-context-types';
export * from './round-context-hash';
export * from './round-context-sources';
export * from './round-context-resume';
export * from './round-context-digest';
```

**Problem**: The `round-context` logic was split from a monolith into five sub-modules totaling ~500 lines of code. However, there are zero dedicated unit test spec files targeting these sub-modules (e.g., `round-context-digest.spec.ts` or `round-context-hash.spec.ts`).
**Impact**: Changes to digest building, SHA-256 fingerprinting, or age calculations are not validated in isolation.
**Resolution Track**: Deferred to a new testing proposal.

---

### 5. Log store reads are not mutex-protected
**File**: [`log-store.ts#L64`](file:///home/cartago/_projects/mcp-vertex/plugins/logs/src/lib/log-store.ts#L64)

```typescript
	const readAllFiles = async (): Promise<readonly ILogEvent[]> => {
		await mkdir(logsDir, { recursive: true });
		const names = (await readdir(logsDir))
			.filter((name) => DATE_RE.test(name))
			.sort();
		const events: ILogEvent[] = [];
		for (const name of names) {
			const content = await readFile(join(logsDir, name), 'utf8').catch(
				() => '',
			);
```

**Problem**: The `readAllFiles` private helper in `log-store.ts` reads the log files directly using `readFile` without acquiring the associated file mutex. Under concurrent writes (via `appendEvent` which uses `withFileMutex`), this read can overlap with an active append.
**Impact**: High risk of torn reads (reading a partially written log line), leading to JSON parsing errors and skipped entries during routine queries (`logs_tail`, `logs_query`).
**Resolution Track**: Deferred to a new bugfix proposal.

---

### 6. Legacy/Unqualified tool names in budget skills
**File**: [`mcp-vertex-token-budget-discipline/SKILL.md#L11`](file:///home/cartago/_projects/mcp-vertex/skills/mcp-vertex-token-budget-discipline/SKILL.md#L11)

```markdown
14:    `proposals_compact_status`, not `proposal_board` verbose.
15: 3. About to call a tool with no `compact` flag and a potentially large
16:    result (`search`, `state_health`, `audit_consolidate`)? -> bound it
```

**Problem**: The budget-related skills (`mcp-vertex-token-budget-discipline/SKILL.md` and `token-budget-playbook/SKILL.md`) document tools using legacy or unqualified names (`proposal_board`, `state_health`, `audit_consolidate`, `search`) instead of their canonical, namespace-qualified names (`proposals_proposal_board`, `proposals_state_health`, `audit_audit_consolidate`, `search_search`).
**Impact**: Downstream agents parsing the skills to guide their own execution will fail to map these tools because they lack the mandatory namespace prefixes.
**Resolution Track**: Deferred to a new documentation proposal.

## Scoreboard

| Dimension | Score | Comments |
|---|---:|---|
| Core contracts & Decoupling | 9.0 | Decoupling is strictly respected. No domain logic leaks into core, and CLI/meta-tools are highly robust. |
| Durability & Mutexes | 8.5 | Great usage of atomic writes and file mutexes overall, but log reads lack mutex coverage, presenting a slight torn-read risk. |
| Test suite & Coverage | 6.5 | All existing tests are green and isolation is excellent, but three major proposal/lock engine components exceeding 300 LOC are undertested. |
| Documentation & Skills | 7.5 | manifest/check-skills sync is clean, but budget skills carry stale references to unqualified/legacy tool names. |
| **Total (Average)** | **7.9** | **The codebase is technically sound and highly robust, but requires hardening in test coverage for core engines and minor alignment in budget documentation.** |
