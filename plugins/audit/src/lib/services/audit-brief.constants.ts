/**
 * audit-brief.constants.ts — pure data for the audit brief.
 *
 * Extracted from `audit-brief.service.ts` so `buildBrief` is a pure
 * function over its inputs, not a 500-line module that mixes types,
 * tables, renderers, and the brief assembly.
 *
 * SOLID contract for this module:
 *   - SRP — every export below is data. No markdown is *built* here;
 *          no I/O happens; no function is exported. The service
 *          module owns the rendering and the assembly.
 *   - OCP — adding a new universal scope is a one-line edit to
 *          `UNIVERSAL_SCOPES` + a key in `SCOPE_LABEL` + a key in
 *          `UNIVERSAL_PHASES`. The brief renderer does not change.
 *   - DIP — the brief service depends on these constants through
 *          their named exports, not on a hidden global.
 *   - LSP — every export is a primitive value (`string[]`, `Record`,
 *          `string`, or a type alias). Substituting a more specific
 *          instance (e.g. a host that wants localised labels) is a
 *          drop-in replacement.
 */

/** Universal scope identifiers, in canonical order. Adding a new one
 *  is a one-line edit here + a key in `SCOPE_LABEL`; the brief
 *  renderer auto-discovers it. */
export type UniversalAuditScope =
	| 'full'
	| 'security'
	| 'tokens'
	| 'tests'
	| 'docs';

/** All universal scope identifiers, in canonical order. */
export const UNIVERSAL_SCOPES: readonly UniversalAuditScope[] = [
	'full',
	'security',
	'tokens',
	'tests',
	'docs',
];

/** Human-readable labels for universal scopes. */
export const SCOPE_LABEL: Readonly<Record<UniversalAuditScope, string>> = {
	full: 'Full audit',
	security: 'Operational security',
	tokens: 'Token efficiency / budget',
	tests: 'Test quality & coverage',
	docs: 'Documentation (READMEs, AGENTS, skills)',
};

/**
 * For backwards compatibility: `ALL_SCOPES` is kept as the list of
 * universal scopes. Hosts that previously iterated `ALL_SCOPES` to
 * enumerate all scopes must also include their configured layers.
 */
export const ALL_SCOPES = UNIVERSAL_SCOPES;

/**
 * A host-defined layer scope that the agent will read exhaustively.
 * Configured via the host project's audit plugin options (typically
 * under `plugins.audit.options.layers`).
 */
export interface ILayerConfig {
	/**
	 * Unique identifier used as the `scope` argument (e.g. `core`,
	 * `api`, `frontend`). Must be a valid identifier: lowercase,
	 * hyphens allowed.
	 */
	readonly name: string;
	/** Human-readable label shown in the brief header. */
	readonly label: string;
	/**
	 * Workspace-relative directories or files the LLM must read.
	 * Supports glob-like descriptions (e.g. `src/lib/`,
	 * `packages/core/src/`).
	 */
	readonly paths: readonly string[];
	/**
	 * Additional layer-specific checks to append to the generic
	 * checklist. Each string is rendered as a bullet point in the
	 * reading-phase section.
	 */
	readonly checks?: readonly string[];
}

/** Sections that the brief asks the model to grade, in canonical order. */
export const SCORE_DIMENSIONS: readonly string[] = [
	'Architecture',
	'Contracts & interfaces',
	'Token efficiency',
	'Concurrency / anti-deadlock',
	'Source code quality',
	'Documentation',
	'Tests (structure, coverage, quality)',
	'Operational security',
	'Genericity (project-agnostic)',
];

// ---------------------------------------------------------------------------
// Universal reading phases (repo-agnostic, project-agnostic)
// ---------------------------------------------------------------------------

/**
 * Reading-phase markdown bodies keyed by universal scope. The brief
 * renderer picks one based on the `scope` argument and concatenates
 * it with the cross-cutting invariants block. Each phase is a
 * complete markdown section (with its own `### Fase —` heading) so
 * the model can read the brief top-down and find the section it
 * needs.
 *
 * Pure data, no side effects — the brief builder is the only consumer.
 * Lifting these strings into a constants module keeps `buildBrief` a
 * pure function of its inputs (SRP) and makes the phases easy to
 * test in isolation (pin the markdown, no need to render a full brief).
 *
 * The `full` key is intentionally empty: `full` is a fan-out that
 * concatenates every other phase plus the configured layers; the
 * renderer treats it as a special case.
 */
export const UNIVERSAL_PHASES: Readonly<Record<UniversalAuditScope, string>> = {
	full: '',
	security: `
### Phase — Operational security

- **Atomic writes**: trace every durable write path and verify it uses atomic-write primitives (tmp-file + rename or framework equivalent). A bare \`writeFile\` on shared data = FATAL.
- **Secret redaction**: is \`redactSecrets\` (or equivalent) applied before persisting any user text?
- **Path containment**: is every path input validated against the workspace root? A \`../\` escape = FATAL.
- **Sync I/O in hot paths**: \`*Sync\` calls inside tool/request handlers = BAD.
- **\`@ts-ignore\` / type suppressions**: any occurrence in production code = finding.
- **Hardcoded secrets**: API keys, tokens, private endpoints in source.
`,
	tokens: `
### Phase — Token efficiency

- Confirm the primary orientation tool (\`overview\` or equivalent) stays under the documented budget.
- Any tool description with redundant prose (states what the parameter name already says)?
- Are system instructions compressible without losing semantics?
- Trace the cold-path of a fresh agent: how many calls before it can work? Is that minimum possible?
- Does the system avoid re-reading unmodified resources (hashing, digest, cache)?
`,
	tests: `
### Phase — Tests

Read the spec files for the critical engines:
- Are concurrency paths covered? (two concurrent writers)
- Stale snapshots?
- Do specs test contracts or implementation details?
- Missing fuzzing / property-based testing in parsing logic with multiple validation layers?

Flag: a module with >300 LOC and <3 spec files = under-test risk (MINOR finding).
Canonical pattern: specs colocated with the source; they use injected mocks/stubs, not globals.
`,
	docs: `
### Phase — Documentation

- **Agent guides / AGENTS.md** (or equivalents: \`CONTRIBUTING.md\`, \`CONVENTIONS.md\`, \`docs/agent.md\`): for every declared rule, is there a violation in the code that contradicts it?
- **Skills / runbooks / playbooks**: open each one and verify — correct tool names? Paths that still exist? Any new tools not mentioned? Any stale output example?
- **Scaffolds / templates / generators**: do they accurately describe the current practice, or are they out of date?
- **Module READMEs**: updated after the latest significant changes?
- **Rules enforced in code (lint, typecheck, CI scripts)**: are they in sync with the rules narrated in docs? A doc that says "no X" without a lint that enforces it = MINOR finding.
`,
};

// ---------------------------------------------------------------------------
// Cross-cutting invariants (universal defaults — data only)
// ---------------------------------------------------------------------------

/**
 * Universal defaults for the "cross-cutting invariants" block. These
 * are project-agnostic on purpose: every host benefits from checking
 * them, regardless of language or framework. Hosts that have additional
 * invariants they want surfaced in every scope can pass them via
 * `IBriefOptions.crossCuttingAdditions`; they are rendered AFTER the
 * universal defaults so the brief stays self-explanatory.
 *
 * The historical (mcp-vertex-specific) defaults — `mcp-vertex_metrics`,
 * `ctx.keepLegacy`, `tool-outputs.ts` — were promoted to **host-added**
 * invariants because they describe one project's vocabulary. Other
 * projects will have their own observability primitive, their own
 * keep-legacy semantics, their own generated-typed-outputs workflow.
 * Hosts wire those via `crossCuttingAdditions` from `register()`.
 */
export const CROSS_CUTTING_UNIVERSAL_DEFAULTS: readonly string[] = [
	"- **Observability**: identify the project's canonical observability primitive (metrics, tracing, structured logs, whatever it is) and verify it is present, persists its state across calls, and that a snapshot-diff between two invocations reflects the host's real activity. If it does not exist = MINOR finding; if it exists but lies = FATAL.",
	'- **Configuration flag honoring**: every documented opt-in flag (legacy, migration, dry-run, allow-list, etc.) must be **explicitly honoured or explicitly ignored** in code. A flag mentioned in docs but with no verifiable effect in code = MINOR finding.',
	'- **Generated typed outputs**: if the project generates types from schemas (typed SDK, JSON Schema, OpenAPI, etc.) the generated files must be committed and regenerated as part of the validation gate. A `<generated>` that is missing or out of sync with its source = finding.',
];
