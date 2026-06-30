/**
 * The canonical audit brief — the markdown block that an agent pastes
 * into a fresh model session to elicit an audit in the format this
 * repo expects.
 *
 * ## Scope model
 *
 * Scopes are divided into two categories:
 *
 * - **Universal scopes** (`UNIVERSAL_SCOPES`): built-in, repo-agnostic. They
 *   address concerns that exist in any codebase (security, token efficiency,
 *   test quality, docs hygiene). Always available without host configuration.
 *
 * - **Layer scopes**: host-defined via the plugin's `options.layers` config.
 *   A layer is a logical slice of the codebase (e.g. `core`, `api`, `frontend`,
 *   `database`) with a label, a list of source paths to read, and optional
 *   extra checks. `buildBrief` generates a parameterised reading-phase section
 *   for each layer, so the LLM knows exactly what to open and what to look for.
 *   `full` includes all universal phases + all configured layers.
 *
 * This separation makes the plugin genuinely project-agnostic: the universal
 * scopes are always correct; the layer scopes adapt to whatever the host repo
 * looks like (monorepo, microservice, library, CLI tool, etc.).
 */

// ---------------------------------------------------------------------------
// Universal scopes (built-in, agnostic)
// ---------------------------------------------------------------------------

/** Scopes that are always available regardless of host configuration. */
// Re-exports from `audit-brief.constants.ts` for backwards compatibility.
// The canonical definitions live in the constants module; this file keeps
// the public surface stable by re-exporting the same names.
//
// SOLID — the constants module owns type unions, scope tables, layer
// config, score dimensions, the universal reading phases, and the
// cross-cutting invariant defaults (SRP). This service file is now a
// pure function over those inputs.
export {
	ALL_SCOPES,
	SCOPE_LABEL,
	SCORE_DIMENSIONS,
	UNIVERSAL_SCOPES,
} from './audit-brief.constants';
export type {
	ILayerConfig,
	UniversalAuditScope,
} from './audit-brief.constants';
import {
	CROSS_CUTTING_UNIVERSAL_DEFAULTS,
	type ILayerConfig,
	SCOPE_LABEL,
	SCORE_DIMENSIONS,
	UNIVERSAL_PHASES,
	type UniversalAuditScope,
} from './audit-brief.constants';

/**
 * Public short alias for {@link UniversalAuditScope}. Kept for backwards
 * compatibility with downstream consumers (e.g. the plugin's
 * `src/public/index.ts`, the `audit_plan` tool, external hosts) that
 * historically imported `AuditScope`. New code should prefer
 * `UniversalAuditScope` directly; this alias is the single source of truth
 * that satisfies both call sites without forcing every plugin to ship two
 * type names.
 */
export type AuditScope = UniversalAuditScope;

// ---------------------------------------------------------------------------
// Brief options
// ---------------------------------------------------------------------------

/**
 * The three audit modes the brief supports. Every mode is reachable
 * through the existing `scope` parameter — `mode` is an explicit
 * declaration of intent that the host's API surface (`audit_plan` /
 * `audit_run`) surfaces for human callers and that the brief can use
 * to render a clearer header.
 *
 *  - `general`: whole-project audit (`scope` defaults to `'full'`,
 *               every configured layer is included).
 *  - `specific`: targeted audit of one dimension / one layer (`scope`
 *               must point at a known universal scope or layer name).
 *  - `monorepo`: subset-of-monorepo audit (`projects` filters the
 *               configured layers to the names provided; if `projects`
 *               is empty the whole layer set is included, identical to
 *               `general`).
 */
export type AuditMode = 'general' | 'specific' | 'monorepo';

/** Options that customise {@link buildBrief}'s output. */
export interface IBriefOptions {
	/** Custom scoring dimensions. Defaults to {@link SCORE_DIMENSIONS}. */
	readonly dimensions?: readonly string[];
	/**
	 * Host-configured layers. Passed by the plugin's `register` from
	 * `ctx.options.layers`. Used when `scope` is a layer name or `'full'`.
	 */
	readonly layers?: readonly ILayerConfig[];
	/**
	 * Explicit audit mode. When omitted, the renderer infers it from
	 * `scope` + `projects`: `monorepo` when `projects` is non-empty,
	 * `specific` when `scope` is a non-`full` universal scope or a
	 * layer name, `general` otherwise.
	 */
	readonly mode?: AuditMode;
	/**
	 * Monorepo project filter. When non-empty, only the named layers
	 * are rendered into the brief's reading-phase section (and into
	 * the `availableScopes` returned by the tool). Layer scopes that
	 * are not in the list are dropped from this audit but stay
	 * configured for future runs.
	 */
	readonly projects?: readonly string[];
	/**
	 * Human-readable project name, rendered in the brief header and in
	 * the "no layers configured" fallback. Defaults to `"the project"`.
	 * Keep the value generic — the brief is meant to land in any model
	 * session and should not assume mcp-vertex-specific vocabulary.
	 */
	readonly projectName?: string;
	/**
	 * Path to the host config file, rendered in the "no layers
	 * configured" hint. Defaults to `"<config-file>"` (a placeholder).
	 * Hosts that want to point the model at a concrete file (e.g.
	 * `mcp-vertex.config.json`, `app.toml`, `settings.yaml`) can pass it
	 * here without leaking that path into the agnostic default brief.
	 */
	readonly configFileName?: string;
	/**
	 * Optional list of extra cross-cutting invariants the host wants
	 * every scope to surface. Each entry is rendered as a bullet under
	 * the "Invariantes transversales" block, before the universal
	 * defaults. Use this to inject project-specific "must check this"
	 * rules without forking `buildBrief`.
	 */
	readonly crossCuttingAdditions?: readonly string[];
}

// ---------------------------------------------------------------------------
// Cross-cutting renderer (pure function over its inputs)
// ---------------------------------------------------------------------------

/**
 * Render the cross-cutting invariants block. Universal defaults come
 * first, then the host's `crossCuttingAdditions`. Kept as a function
 * (not a constant in the constants module) because it builds markdown
 * from a join — that is logic, not data, and belongs in the service.
 */
const renderCrossCutting = (additions: readonly string[]): string => {
	const bullets = [...CROSS_CUTTING_UNIVERSAL_DEFAULTS, ...additions].join(
		'\n',
	);
	return `
### ⚠️ Cross-cutting invariants (always, regardless of scope)

These points MUST be checked in **any** audit scope:

${bullets}
`;
};

// ---------------------------------------------------------------------------
// Generic layer reading phase (parameterised by ILayerConfig)
// ---------------------------------------------------------------------------

const buildLayerPhase = (layer: ILayerConfig): string => {
	const pathsList = layer.paths.map((p) => `  - \`${p}\``).join('\n');
	const extraChecks =
		layer.checks && layer.checks.length > 0
			? '\n\n**Layer-specific checks:**\n' +
				layer.checks.map((c) => `- ${c}`).join('\n')
			: '';

	return `
### Phase — ${layer.label}

Read exhaustively the following directories/files:
${pathsList}

For every file you touch, extract the exact snippet (≤ 15 lines) and cite \`file:line\`.

Generic layer checklist:
- **Sync I/O in hot paths**: \`readFileSync\`, \`existsSync\`, etc. in handlers or hot routes = BAD.
- **Mutable globals / \`process.cwd()\`**: paths and configuration must come from context injection, not global variables.
- **Unprotected writes**: any \`writeFile\` / shared-state write without mutex + write-atomic = FATAL.
- **\`@ts-ignore\` / \`@ts-nocheck\` / \`console.log\`** in production code: cite the line.
- **Honoured public contracts**: does the layer honour the interfaces it declares exposing?
- **Logic duplication**: are utilities copy-pasted from another layer that should live in a shared module?${extraChecks}
`;
};

// ---------------------------------------------------------------------------
// Brief builder
// ---------------------------------------------------------------------------

/** Severity bands the brief surfaces to the model (canonical 7-band
 *  scale, pure English). Each row carries the canonical enum token
 *  used in the structured `worstSeverity` field plus a short English
 *  meaning. The full token IS the band label, so the model pastes
 *  exactly what the parser will emit — no translation step. */
const SEVERITY_TABLE_ROWS: ReadonlyArray<{
	readonly band: string;
	readonly enumToken: string;
	readonly emoji: string;
	readonly meaning: string;
}> = [
	{
		band: 'FATAL',
		enumToken: 'FATAL',
		emoji: '🔴',
		meaning: 'Critical: silent bug, security hole, or design error. Must fix.',
	},
	{
		band: 'BAD',
		enumToken: 'BAD',
		emoji: '🟠',
		meaning: 'Serious issue that degrades quality. Should fix soon.',
	},
	{
		band: 'MINOR',
		enumToken: 'MINOR',
		emoji: '🟡',
		meaning: 'A detail worth improving; non-urgent.',
	},
	{
		band: 'OK',
		enumToken: 'OK',
		emoji: '🟢',
		meaning: 'Above expectations; nothing to change.',
	},
	{
		band: 'GOOD',
		enumToken: 'GOOD',
		emoji: '🌟',
		meaning: 'Very good execution.',
	},
	{
		band: 'PERFECT',
		enumToken: 'PERFECT',
		emoji: '💎',
		meaning: 'Perfect implementation; zero defects.',
	},
	{
		band: 'EXEMPLARY',
		enumToken: 'EXEMPLARY',
		emoji: '✨',
		meaning:
			'Reference-quality; worth copying into other projects.',
	},
];

/**
 * Infer the audit mode from the scope and the projects filter when the
 * caller did not pass an explicit `mode`. Pure: same inputs always
 * yield the same inferred mode.
 */
const inferMode = (
	scope: string,
	layers: readonly ILayerConfig[],
	projects: readonly string[] | undefined,
): AuditMode => {
	if (projects && projects.length > 0) return 'monorepo';
	if (scope === 'full') return 'general';
	if (
		scope in SCOPE_LABEL ||
		layers.some((l) => l.name === scope)
	) {
		return 'specific';
	}
	return 'general';
};

/**
 * Build the audit brief in markdown.
 *
 * @param scope - Either a universal scope identifier or the `name` of a
 *   host-configured layer. Pass `'full'` for a complete audit.
 * @param options - Optional overrides for dimensions, layer definitions,
 *   project name, config-file hint, host-specific cross-cutting
 *   invariants, audit mode (`general` / `specific` / `monorepo`), and
 *   the monorepo project filter. Defaults are project-agnostic on
 *   purpose; pass options to brand the output for a specific host.
 */
export const buildBrief = (
	scope: string,
	options: IBriefOptions = {},
): string => {
	const dimensions = options.dimensions ?? SCORE_DIMENSIONS;
	const configuredLayers = options.layers ?? [];
	const projects = options.projects;
	// Apply the monorepo project filter when provided. Empty/missing
	// `projects` ⇒ keep the full configured layer set. Unknown names
	// are kept too (the brief lists them so the model can flag the
	// typo); the `audit_plan` tool rejects unknown project names
	// BEFORE calling `buildBrief`.
	const layers =
		projects && projects.length > 0
			? configuredLayers.filter((l) => projects.includes(l.name))
			: configuredLayers;
	const mode: AuditMode = options.mode ?? inferMode(scope, configuredLayers, projects);
	const projectName = options.projectName ?? 'the project';
	const configFileName = options.configFileName ?? '<config-file>';
	const dimensionsTable = dimensions.map((d) => `| ${d} | /10 |`).join('\n');
	const severityTable = SEVERITY_TABLE_ROWS.map(
		(r) =>
			`| **${r.band}** | ${r.emoji} | \`${r.enumToken}\` | ${r.meaning} |`,
	).join('\n');
	const modeLabel =
		mode === 'general'
			? 'general (whole project)'
			: mode === 'specific'
				? `specific (scope: ${scope})`
				: `monorepo (projects: ${
						projects && projects.length > 0
							? projects.join(', ')
							: '—'
					})`;

	// Resolve label: universal scope label, layer label, or raw scope string.
	const universalLabel =
		scope in SCOPE_LABEL
			? SCOPE_LABEL[scope as UniversalAuditScope]
			: undefined;
	const layerConfig = layers.find((l) => l.name === scope);
	const scopeLabel =
		universalLabel ?? layerConfig?.label ?? `Capa personalizada: ${scope}`;

	// Build the reading phases appropriate for this scope.
	const readingPhases = buildReadingPhases(scope, layers, {
		layers,
		projectName,
		configFileName,
		mode,
		projects: projects ?? [],
		...(options.crossCuttingAdditions !== undefined
			? { crossCuttingAdditions: options.crossCuttingAdditions }
			: {}),
	});

	return `# 📋 Audit brief — mode ${modeLabel}

> **Date**: <YYYY-MM-DD> · **Reviewer**: <Model + Host> · **Scope**: ${scopeLabel} · **Mode**: ${mode}.
> **Methodology**: Exhaustive read of the indicated scope's source. **Automated commands are
> the baseline, not the finish line.** The model MUST read the real source, extract
> snippets with \`file#Lnn\` references, and justify each finding with concrete evidence.
> Audits that only summarise command output are invalid.
>
> If your output drifts from the format, \`audit_consolidate\` will not be able to
> deduplicate your findings against other reviewers'.

---

## 🎯 Scope

${scope === 'full' ? `Audit the entire repo${mode === 'monorepo' ? `, restricted to the selected projects (${(projects ?? []).join(', ')})` : ''} with the full rubric. All reading phases are mandatory.` : `Focus on **${scopeLabel}**. For everything else, a one-line note is enough.`}

> **Available modes** (pass to the tool as \`mode\`, or derive from \`scope\` + \`projects\`):
>
> | Mode | When | \`scope\` | \`projects\` |
> |---|---|---|---|
> | \`general\` | Whole-project audit | \`full\` | _(omit)_ |
> | \`specific\` | A single dimension or layer | any of \`security\` / \`tokens\` / \`tests\` / \`docs\` / a layer name | _(omit)_ |
> | \`monorepo\` | Audit only selected monorepo packages | \`full\` _(or applicable)_ | list of layer names |

---

## 📐 Rubric (7 severity bands — pure English)

| Band | Emoji | Token | Meaning |
|---|---|---|---|
${severityTable}

> The **token column is the canonical enum** used in the structured
> \`worstSeverity\` field of \`audit_consolidate\` output. Always paste
> one of those tokens literally (e.g. \`FATAL\`, \`BAD\`, \`MINOR\`,
> \`OK\`, \`GOOD\`, \`PERFECT\`, \`EXEMPLARY\`). Old reports emitted the
> Spanish variants (\`MUY_MAL\`, \`MEJORABLE\`, \`MUY_BIEN\`, \`PERFECTO\`,
> \`ESPLÉNDIDO\`); the parser still accepts them and normalises to the
> English canonical token, so old audits stay readable.

For each finding use this block:

\`\`\`
### N. <imperative title>
**File**: \`<file>#L<line>\`

\`\`\`typescript
// exact snippet (≤ 15 lines)
\`\`\`

**Problem**: precise description of what is wrong and why.
**Impact**: what breaks, corrupts, or degrades if left unfixed.
**Resolution Track**: [Fixed in slice \`sN\`] | [Deferred to proposal \`xNNNNN\`]
\`\`\`

**Golden rule**: a finding without a code snippet is speculation — not a finding.
Do not write "might" or "possibly" — either you saw it in the code, or you don't report it.

---

## 🔬 Analysis methodology (MANDATORY)

### Phase 0 — Quantitative baseline (allowed commands)

Execute and record the results in the \`## Verified State\` table:
- Tests: \`<repo test command>\` — count and pass/fail.
- Build: \`<build command>\` — clean output or errors.
- Linter: \`<lint command>\` — warnings/errors.
- Approximate LOC for the scope.

**This phase is the floor, not the ceiling.** Continue with the source-reading phases.

${readingPhases}

### Final phase — Write the audit document

Only after completing the reading phases, write the document.
Structure: executive summary → findings (with snippets) → scoreboard → recommendations.

---

## 📊 Final scoring table (mandatory)

Always end with this table. Score 0–10 or \`?\` when you cannot evaluate.
A dimension with a FATAL finding cannot score above 6/10.

${dimensionsTable}

And a closing line: \`**Final note: X/10 — <one-line justification>**\`.

---

## 📝 Priority recommendations (at the end)

A compact table \`| 🔴 P0 | <action> | <file> |\` listing the 3–5 most urgent
actions. Only concrete actions (not "improve documentation").

---

## 🪶 Style

- Always cite \`<file>#L<line>\`.
- Inline snippets where they help (≤ 15 lines).
- Do not inflate: if a dimension is fine, say so in one line and move on.
- Return a **single markdown** starting at the audit header and ending at the
  recommendations table.
`;
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

interface IBuildReadingPhasesOptions {
	readonly layers: readonly ILayerConfig[];
	readonly projectName: string;
	readonly configFileName: string;
	readonly mode: AuditMode;
	readonly projects: readonly string[];
	readonly crossCuttingAdditions?: readonly string[];
}

/**
 * Render a small monorepo badge that the model pastes into its audit
 * report so reviewers can see which slice of the monorepo was covered.
 */
const renderMonorepoBadge = (
	projects: readonly string[],
): string => {
	if (projects.length === 0) return '';
	return [
		'',
		'> **Monorepo mode active**: this brief covers ONLY the following projects/layers:',
		'> ',
		...projects.map((p) => `> - \`${p}\``),
		'',
	].join('\n');
};

/**
 * Assemble the reading-phase sections for the requested scope.
 * `full` includes all universal phases + all configured layers.
 * A universal scope includes only its own phase.
 * A layer name includes only that layer's generic reading phase.
 * Unknown scopes get all universal phases (safe fallback).
 *
 * The cross-cutting invariants block is rendered by {@link renderCrossCutting}
 * with the host's `crossCuttingAdditions` appended to the universal
 * defaults; this keeps the brief agnostic for hosts that never set the
 * additions and self-explanatory for hosts that do.
 */
const buildReadingPhases = (
	scope: string,
	layers: readonly ILayerConfig[],
	options: IBuildReadingPhasesOptions = {
		layers: [],
		projectName: 'the project',
		configFileName: '<config-file>',
		mode: 'general',
		projects: [],
	},
): string => {
	const crossCutting = renderCrossCutting(
		options.crossCuttingAdditions ?? [],
	);
	const monorepoBadge = renderMonorepoBadge(options.projects);

	if (scope === 'full') {
		const layerPhases =
			layers.length > 0
				? layers.map(buildLayerPhase).join('\n')
				: `
### Phase — ${options.projectName} source code

No layers configured. Read the project's top-level directories and look for the
generic layer checklist patterns across the entire source tree.
Add layers in the \`plugins.audit.options.layers\` section of \`${options.configFileName}\`
to get layer-specific reading instructions on subsequent audits.
`;
		return (
			crossCutting +
			monorepoBadge +
			layerPhases +
			UNIVERSAL_PHASES.security +
			UNIVERSAL_PHASES.tokens +
			UNIVERSAL_PHASES.tests +
			UNIVERSAL_PHASES.docs
		);
	}

	// Universal scope (security, tokens, tests, docs)
	if (scope in UNIVERSAL_PHASES && scope !== 'full') {
		return (
			crossCutting +
			monorepoBadge +
			UNIVERSAL_PHASES[scope as Exclude<UniversalAuditScope, 'full'>]
		);
	}

	// Layer scope
	const layer = layers.find((l) => l.name === scope);
	if (layer) {
		return crossCutting + monorepoBadge + buildLayerPhase(layer);
	}

	// Unknown scope — safe fallback: all universal phases
	return (
		crossCutting +
		monorepoBadge +
		UNIVERSAL_PHASES.security +
		UNIVERSAL_PHASES.tokens +
		UNIVERSAL_PHASES.tests +
		UNIVERSAL_PHASES.docs
	);
};
