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
 * Resolve whether ANSI colours should be emitted. Automatic colour is only
 * enabled for an actual terminal; MCP clients commonly pipe stderr and may
 * display escape sequences literally. `DELENDAI_COLOR=always` and
 * `FORCE_COLOR=1` remain explicit opt-ins for compatible hosts.
 */
export const shouldUseAnsiColors = (
	env: NodeJS.ProcessEnv = process.env,
): boolean => {
	const force = env.FORCE_COLOR;
	const disable = env.NO_COLOR;
	if (disable !== undefined && disable !== '') return false;
	if (force === '1' || force === 'true') return true;
	if (env.DELENDAI_COLOR === 'always') return true;
	if (env.DELENDAI_COLOR === 'never') return false;
	return process.stderr.isTTY === true;
};

const colourise = (
	text: string,
	token: IColorToken,
	useAnsi: boolean,
): string => (useAnsi ? `${ANSI_BY_TOKEN[token]}${text}${ANSI_RESET}` : text);

const section = (
	title: string,
	description: string,
	token: IColorToken,
	useAnsi: boolean,
): readonly string[] => [
	colourise(`=== ${title} ===`, token, useAnsi),
	colourise(`  ${description}`, 'dim', useAnsi),
];

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

	// ─── Operator summary ──────────────────────────────────────────
	const idLines: string[] = [
		colourise('[info] MCP-Vertex ready', 'ready', useAnsi),
		`version        ${report.identity.version}`,
		`workspace      ${report.identity.workspace}`,
		`preset         ${report.identity.preset}`,
		`surface        ${report.identity.surfaceMode} · ${report.runtime.lazyActivation ? 'lazy loading enabled' : 'eager loading'}`,
		`tools          ${report.catalog.toolsExposed} visible / ${report.catalog.toolsAvailable} available`,
		`plugins        ${report.catalog.pluginsConfigured} configured · ${report.catalog.pluginsLoaded ?? report.catalog.pluginsWarm} loaded · ${report.catalog.pluginsWarm} warm`,
		...(report.identity.surfaceModeReason !== undefined
			? [`  reason: ${report.identity.surfaceModeReason}`]
			: []),
	];
	lines.push(
		...section(
			'Server summary',
			'What is running, which surface is exposed, and how tools are loaded.',
			'ready',
			useAnsi,
		),
	);
	if (report.catalog.pluginsFailed > 0) {
		idLines.push(`plugins failed ${report.catalog.pluginsFailed}`);
	}
	idLines.push(
		`report         ${report.identity.startupReportLevel}${report.identity.startupReportLevel === 'medium' ? ' (default)' : ''}`,
	);
	for (const line of idLines) lines.push(line);
	lines.push('');

	const catLines: string[] = [
		...section(
			'Available capabilities',
			'The skills and resources that can be requested when needed.',
			'accent',
			useAnsi,
		),
		`skills        ${report.catalog.skillsAvailable} available · ${report.catalog.skillsBodiesPreloaded} preloaded`,
		`resources     ${report.catalog.resourcesAvailable} available`,
	];
	for (const line of catLines) lines.push(line);
	lines.push('');

	// ─── Per-request context cost (compact+) ───────────────────────
	const costLines: string[] = [
		...section(
			'Context cost per request',
			'The schema tokens sent to the model for the visible tool surface.',
			'budget',
			useAnsi,
		),
	];
	costLines.push(
		`visible tools  ${formatTokens(report.reconciliation.estimatedSchemaTokensPerRequest)} tokens · ${formatBytes(report.reconciliation.exposedSchemaBytesPerRequest)} of schemas`,
	);
	if (report.baseline.source !== 'unset') {
		costLines.push(
			`full surface   ${formatTokens(report.reconciliation.nativeEquivalentTokensPerRequest)} tokens`,
		);
		costLines.push(
			`saved          ${formatTokens(report.reconciliation.avoidedTokensPerRequest)} tokens · ${report.reconciliation.avoidedPercentage.toFixed(1)}%`,
		);
	}
	for (const line of costLines) lines.push(line);
	lines.push('');

	// ─── Plugin loading summary (medium+) ──────────────────────────
	if (report.reconciliation.plugins.length > 0) {
		const loadedPlugins = report.reconciliation.plugins
			.filter(
				(plugin) =>
					plugin.status === 'active-internal' ||
					plugin.status === 'loaded-hidden',
			)
			.map((plugin) => plugin.pluginName);
		const lazyPlugins = report.reconciliation.plugins
			.filter((plugin) => plugin.status === 'unloaded')
			.map((plugin) => plugin.pluginName);
		const failedPlugins = report.reconciliation.plugins
			.filter(
				(plugin) =>
					plugin.status === 'failed' || plugin.status === 'denied',
			)
			.map((plugin) => plugin.pluginName);
		const inlineList = (names: readonly string[]): string =>
			names.length > 0 ? names.join(', ') : 'none';
		const loadingLines: string[] = [
			...section(
				'Plugin loading',
				'Plugins loaded now and plugins waiting for their first use.',
				'accent',
				useAnsi,
			),
			`  loaded at startup (${loadedPlugins.length}): ${inlineList(loadedPlugins)}`,
			`  lazy loaded on demand (${lazyPlugins.length}): ${inlineList(lazyPlugins)}`,
			...(failedPlugins.length > 0
				? [
						`  unavailable (${failedPlugins.length}): ${inlineList(failedPlugins)}`,
					]
				: []),
		];
		for (const line of loadingLines) lines.push(line);
		lines.push('');
	}

	// ─── Managed runtime knobs (compact+) ─────────────────────────
	const runtimeLines: string[] = [
		...section(
			'Managed runtime',
			'Runtime policies for lazy activation, eviction, and MCP surface refreshes.',
			'header',
			useAnsi,
		),
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
		if (report.identity.surfaceModeReason !== undefined) {
			fullLines.push(
				`  surface.reason            ${report.identity.surfaceModeReason}`,
			);
		}
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
