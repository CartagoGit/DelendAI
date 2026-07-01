/**
 * Brief builder — assembles the canonical audit brief. Pure
 * markdown synthesis: tables and tokens come from
 * `audit-brief.constants.ts`; the rubric, mode helpers, and
 * monorepo badge come from sibling files under `./brief/`.
 *
 * SOLID — SRP owns `buildBrief` + the private phase assemblers.
 * OCP: new scopes are a one-line edit in the constants module.
 * DIP: every dependency is a named import (no hidden globals).
 */

import {
	CROSS_CUTTING_UNIVERSAL_DEFAULTS,
	SCOPE_LABEL,
	SCORE_DIMENSIONS,
	UNIVERSAL_PHASES,
	type ILayerConfig,
	type UniversalAuditScope,
} from '../audit-brief.constants';
import { renderSeverityTable } from './severity-table.service';
import {
	inferMode,
	renderAvailableModes,
	renderMonorepoBadge,
	type AuditMode,
} from './brief-modes.service';

// Re-export `AuditMode` so the public barrel has a single
// imports-it point. Defined in `brief-modes.service.ts` (alongside
// `inferMode`, which returns it); erased by `verbatimModuleSyntax`
// when consumed as a type from this module.
export type { AuditMode };

/**
 * Public short alias for {@link UniversalAuditScope}. Backwards
 * compat for downstream consumers (`src/public/index.ts`,
 * `audit_plan`, external hosts) that historically imported
 * `AuditScope`. Prefer `UniversalAuditScope` directly; this alias
 * keeps both call sites happy without shipping two type names.
 */
export type AuditScope = UniversalAuditScope;

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
// Reading-phase assembler (internal helper)
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
 * Assemble the reading-phase sections for the requested scope.
 * `full` includes all universal phases + all configured layers; a
 * universal scope includes only its own phase; a layer name
 * includes only that layer's generic phase; unknown scopes fall
 * back to all universal phases (safe). The cross-cutting block
 * comes from {@link renderCrossCutting}, with the host's
 * `crossCuttingAdditions` appended to the universal defaults.
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

// ---------------------------------------------------------------------------
// Public brief builder
// ---------------------------------------------------------------------------

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
	const mode: AuditMode =
		options.mode ?? inferMode(scope, configuredLayers, projects);
	const projectName = options.projectName ?? 'the project';
	const configFileName = options.configFileName ?? '<config-file>';
	const dimensionsTable = dimensions.map((d) => `| ${d} | /10 |`).join('\n');
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

${renderAvailableModes()}

---

${renderSeverityTable()}

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
