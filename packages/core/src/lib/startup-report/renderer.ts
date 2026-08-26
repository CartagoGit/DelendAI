/**
 * startup-report/renderer.ts — q00009 / f00258.
 *
 * Two renderers for the {@link IStartupReport} model:
 *
 *   - {@link renderStartupReportPlain}  → no ANSI, host-safe (CI, log
 *     files, VS Code Output Channel).
 *   - {@link renderStartupReportAnsi}   → semantic colour tokens
 *     applied as ANSI escape codes; auto-disabled when stdout is not
 *     a TTY (see {@link shouldUseAnsiColors}).
 *
 * Both renderers consume the *same* model; the only difference is the
 * colour layer. Business logic never reaches for an escape code — it
 * always goes through the semantic {@link IColorToken} enum, so the
 * plain renderer is just the "no colour" view of the same data.
 *
 * The five levels (off, compact, medium, high, full) are honoured:
 * `off` returns an empty string for both renderers. Detail granularity
 * increases monotonically from `off` to `full`.
 */

import type { IStartupReport } from './model';
import type { IStartupReportLevel } from './level';
import { levelIncludesPluginCostTable } from './level';

/** Semantic colour tokens. Never escape-coded by business code. */
export type IColorToken =
	| 'ready'
	| 'warning'
	| 'error'
	| 'header'
	| 'budget'
	| 'dim'
	| 'accent';

/** Resolve a token to an ANSI escape code (or empty string for `dim`). */
const ANSI_BY_TOKEN: Readonly<Record<IColorToken, string>> = {
	ready: '\u001B[32m', // green
	warning: '\u001B[33m', // yellow
	error: '\u001B[31m', // red
	header: '\u001B[36m', // cyan
	budget: '\u001B[35m', // magenta
	accent: '\u001B[34m', // blue
	dim: '\u001B[2m', // dim grey
};

const ANSI_RESET = '\u001B[0m';

/**
 * Auto-detect whether ANSI colours should be emitted. Conservative:
 * disabled unless `FORCE_COLOR=1` (or `--color=always`) is set. We
 * default to plain because the MCP stdio stdout must remain clean
 * (q00009 §10.3) and we cannot guarantee the host is a TTY.
 */
export const shouldUseAnsiColors = (
	env: NodeJS.ProcessEnv = process.env,
): boolean => {
	const force = env.FORCE_COLOR;
	const disable = env.NO_COLOR;
	if (disable !== undefined && disable !== '') return false;
	if (force === '1' || force === 'true') return true;
	if (env.MCP_VERTEX_COLOR === 'always') return true;
	if (env.MCP_VERTEX_COLOR === 'never') return false;
	return false;
};

const colourise = (
	text: string,
	token: IColorToken,
	useAnsi: boolean,
): string => (useAnsi ? `${ANSI_BY_TOKEN[token]}${text}${ANSI_RESET}` : text);

const formatBytes = (bytes: number): string => {
	if (bytes === 0) return '0 B';
	if (bytes < 1024) return `${bytes} B`;
	return `${(bytes / 1024).toFixed(1)} KiB`;
};

const formatTokens = (tokens: number): string =>
	tokens === 0 ? '0' : `~${tokens.toLocaleString('en-US')}`;

/**
 * Render the report. Pure: takes the model + env, returns a string.
 * Empty string for `off`.
 */
export const renderStartupReportPlain = (report: IStartupReport): string =>
	renderInternal(report, false);

export const renderStartupReportAnsi = (
	report: IStartupReport,
	env: NodeJS.ProcessEnv = process.env,
): string => renderInternal(report, shouldUseAnsiColors(env));

const renderInternal = (report: IStartupReport, useAnsi: boolean): string => {
	const level = report.identity.startupReportLevel;
	if (level === 'off') return '';

	const lines: string[] = [];

	// ─── Identity / Catalog ────────────────────────────────────────
	const idLines: string[] = [
		colourise('MCP-Vertex ready', 'ready', useAnsi),
		`version        ${report.identity.version}`,
		`workspace      ${report.identity.workspace}`,
		`preset         ${report.identity.preset}`,
		`surface        ${report.identity.surfaceMode}`,
		`startup report ${report.identity.startupReportLevel}${
			report.identity.startupReportLevel === 'medium' ? ' (default)' : ''
		}`,
	];
	for (const line of idLines) lines.push(line);
	lines.push('');

	const catLines: string[] = [
		colourise('Catalog', 'header', useAnsi),
		`plugins        ${report.catalog.pluginsConfigured} configured · ${report.catalog.pluginsLoaded ?? report.catalog.pluginsWarm} loaded · ${report.catalog.pluginsWarm} warm · ${report.catalog.pluginsFailed} failed`,
		`tools          ${report.catalog.toolsAvailable} available · ${report.catalog.toolsExposed} exposed to model`,
		`skills         ${report.catalog.skillsAvailable} available · ${report.catalog.skillsBodiesPreloaded} bodies preloaded`,
		`resources      ${report.catalog.resourcesAvailable} available`,
	];
	for (const line of catLines) lines.push(line);
	lines.push('');

	// ─── Per-request context cost (compact+) ───────────────────────
	const costLines: string[] = [
		colourise('Per-request context cost', 'header', useAnsi),
	];
	costLines.push(
		`exposed schema ${formatBytes(report.reconciliation.exposedSchemaBytesPerRequest)} · ${formatTokens(report.reconciliation.estimatedSchemaTokensPerRequest)}/request`,
	);
	if (report.baseline.source !== 'unset') {
		costLines.push(
			`native equiv.  ${formatTokens(report.reconciliation.nativeEquivalentTokensPerRequest)}/request`,
		);
		costLines.push(
			`avoided        ${formatTokens(report.reconciliation.avoidedTokensPerRequest)}/request · ${report.reconciliation.avoidedPercentage.toFixed(1)}%`,
		);
	}
	for (const line of costLines) lines.push(line);
	lines.push('');

	// ─── Plugin cost table (medium+) ───────────────────────────────
	if (
		levelIncludesPluginCostTable(level) &&
		report.reconciliation.plugins.length > 0
	) {
		const tableLines: string[] = [
			colourise('Plugin cost / request', 'header', useAnsi),
		];
		tableLines.push(
			'  plugin                       tools skills  schema/request  tokens/request  budget',
		);
		for (const plugin of report.reconciliation.plugins) {
			const budget =
				plugin.budget.semantics === 'unbounded-by-plugin'
					? 'n/a'
					: plugin.budget.semantics === 'inherited'
						? `${plugin.budget.value ?? '?'} inherited`
						: plugin.budget.semantics === 'shared'
							? 'shared'
							: `${plugin.budget.value ?? '?'} dedicated`;
			const budgetColoured = colourise(
				budget.padEnd(20),
				'budget',
				useAnsi,
			);
			tableLines.push(
				`  ${plugin.pluginName.padEnd(28)}${String(plugin.exposedToolsCount).padStart(3)}/${String(plugin.availableToolsCount).padStart(3)} ${String(plugin.availableSkillsCount ?? 0).padStart(5)}      ${formatBytes(plugin.exposedSchemaBytesPerRequest).padStart(10)}      ${formatTokens(plugin.estimatedSchemaTokensPerRequest).padStart(10)}    ${budget}`,
			);
			// colourise the budget slice; keep alignment via plain prefix
			const last = tableLines.pop() as string;
			const budgetStart = last.lastIndexOf(budget);
			tableLines.push(last.slice(0, budgetStart) + budgetColoured);
		}
		const totalBytes = report.reconciliation.exposedSchemaBytesPerRequest;
		const totalTools = report.reconciliation.plugins.reduce(
			(s, p) => s + p.availableToolsCount,
			0,
		);
		const totalRow = `  TOTAL${' '.repeat(24)}${String(report.catalog.toolsExposed).padStart(3)}/${String(totalTools).padStart(3)}      ${formatBytes(totalBytes).padStart(10)}      ${formatTokens(report.reconciliation.estimatedSchemaTokensPerRequest).padStart(10)}    n/a*`;
		tableLines.push(totalRow);
		tableLines.push('');
		tableLines.push(
			colourise(
				'* Budgets heterogeneous do not sum when dimensions differ.',
				'dim',
				useAnsi,
			),
		);
		for (const line of tableLines) lines.push(line);
		lines.push('');
	}

	// ─── Managed runtime knobs (compact+) ─────────────────────────
	const runtimeLines: string[] = [
		colourise('Managed runtime', 'header', useAnsi),
		`lazy activation      ${report.runtime.lazyActivation ? 'enabled' : 'disabled'}`,
		`module loading       ${report.runtime.moduleLoading ?? 'unspecified'}`,
		`internal routing     ${report.runtime.internalRouting ? 'enabled' : 'disabled'}`,
		`idle eviction        ${report.runtime.idleEvictionMs ? `${report.runtime.idleEvictionMs / 60_000}m` : 'off'}`,
		`max warm plugins     ${report.runtime.maxWarmPlugins ?? 'unbounded'}`,
		`list_changed needed  ${report.runtime.listChangedRequired ? 'yes' : 'no'}`,
	];
	for (const line of runtimeLines) lines.push(line);
	lines.push('');

	// ─── Warnings (compact+) ───────────────────────────────────────
	if (report.warnings.length > 0) {
		const warnLines: string[] = [colourise('Warnings', 'warning', useAnsi)];
		for (const warning of report.warnings) {
			const token =
				warning.severity === 'error'
					? 'error'
					: warning.severity === 'warning'
						? 'warning'
						: 'dim';
			warnLines.push(
				`${colourise(`[${warning.severity.toUpperCase()}]`, token, useAnsi)} ${warning.code}: ${warning.message}`,
			);
		}
		for (const line of warnLines) lines.push(line);
		lines.push('');
	}

	// ─── High / Full: per-plugin tool & skill listings ─────────────
	if (level === 'high' || level === 'full') {
		const detailLines: string[] = [
			colourise('Plugins (detail)', 'header', useAnsi),
		];
		for (const plugin of report.reconciliation.plugins) {
			detailLines.push(
				`  ${plugin.pluginName.padEnd(24)} status=${plugin.status} tools=${plugin.exposedToolsCount}/${plugin.availableToolsCount} skills=${plugin.availableSkillsCount ?? 0}`,
			);
			if (plugin.availableToolIds !== undefined) {
				detailLines.push(
					`    tools: ${plugin.availableToolIds.join(', ') || 'none'}`,
				);
			}
			if (plugin.availableSkillIds !== undefined) {
				detailLines.push(
					`    skills: ${plugin.availableSkillIds.join(', ') || 'none'}`,
				);
			}
		}
		for (const line of detailLines) lines.push(line);
		lines.push('');
	}

	// ─── Full: configuration snapshot (sanitised) ──────────────────
	if (level === 'full') {
		const fullLines: string[] = [
			colourise('Configuration (sanitised)', 'header', useAnsi),
		];
		fullLines.push(
			`  surface.mode              ${report.identity.surfaceMode}`,
		);
		fullLines.push(
			`  startupReport.level       ${report.identity.startupReportLevel}`,
		);
		fullLines.push(`  baseline.source           ${report.baseline.source}`);
		fullLines.push(
			`  baseline.tokens/request   ${report.baseline.tokensPerRequest}`,
		);
		if (report.diagnostics !== undefined) {
			const { configuration } = report.diagnostics;
			fullLines.push(
				`  redactions                ${configuration.redactions}`,
			);
			fullLines.push(
				`  config                    ${JSON.stringify(configuration.config)}`,
			);
			fullLines.push(
				`  unavailable artifacts     ${configuration.unavailableArtifactKinds.join(', ') || 'none'}`,
			);
			fullLines.push('  plugin diagnostics:');
			for (const plugin of configuration.plugins) {
				fullLines.push(
					`    ${plugin.id} origin=${plugin.origin} source=${plugin.source} active=${plugin.active} schema=${plugin.schemaStatus} permissions=${plugin.permissions?.join(',') || 'none'} capabilities=tools:${plugin.capabilities.tools},prompts:${plugin.capabilities.prompts},resources:${plugin.capabilities.resources},knowledge:${plugin.capabilities.knowledge},skills:${plugin.capabilities.skills} dependencies=${plugin.dependencies?.join(',') || 'none'}`,
				);
			}
			fullLines.push('  artifacts:');
			const artifactCounts = new Map<string, number>();
			for (const artifact of configuration.artifacts) {
				artifactCounts.set(
					artifact.kind,
					(artifactCounts.get(artifact.kind) ?? 0) + 1,
				);
			}
			for (const [kind, count] of artifactCounts) {
				fullLines.push(`    ${kind.padEnd(10)} ${count}`);
			}
		}
		for (const budget of report.budgets) {
			fullLines.push(
				`  budget.${budget.name.padEnd(20)} ${budget.semantics.padEnd(20)} ${budget.value ?? 'n/a'} ${budget.unit}`,
			);
		}
		for (const line of fullLines) lines.push(line);
		lines.push('');
	}

	return lines.join('\n');
};

export const renderStartupReport = (
	report: IStartupReport,
	channel: 'ansi' | 'plain' = 'plain',
): string =>
	channel === 'ansi'
		? renderStartupReportAnsi(report)
		: renderStartupReportPlain(report);

export const RENDER_LEVELS: readonly IStartupReportLevel[] = [
	'off',
	'compact',
	'medium',
	'high',
	'full',
];
