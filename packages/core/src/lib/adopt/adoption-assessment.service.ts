import { deriveConfig } from '../bootstrap/derive-config';
import type { IProjectAnalysis } from '../bootstrap/analyze-project';
import {
	PRESET_CATALOG,
	resolvePresetMembers,
} from '../plugins/preset-catalog';
import { FIRST_PARTY_PLUGIN_INDEX } from '../registry/first-party-index';
import { TOKEN_BUDGETS } from '../contracts/constants/token-budgets.constant';
import { buildAdoptProjectWriteEstimate } from './adopt-project-write-estimate';
import type {
	IAdoptionAssessment,
	IAssessmentConflict,
	IAssessmentCost,
	IBuildAdoptionAssessmentOptions,
	IPluginRecommendation,
} from '../contracts/interfaces/adoption-assessment.interface';

export interface IMonorepoAreaAssessment {
	readonly workspacePath: string;
	readonly area: string;
	readonly candidatePresetId: string;
	readonly recommendedPluginIds: readonly string[];
	readonly pluginRecommendations: readonly IPluginRecommendation[];
	readonly rationale: string;
	readonly summary: IAdoptionAssessment['summary'] & {
		readonly framework?: IProjectAnalysis['framework'];
		readonly testRunner: IProjectAnalysis['testRunner'];
	};
}

export type IAdoptionAssessmentWithAreas = IAdoptionAssessment & {
	readonly areaBreakdown?: readonly IMonorepoAreaAssessment[];
};

interface IWorkspaceCandidate {
	readonly workspacePath: string;
	readonly area: string;
	readonly entries: readonly string[];
}

const DOCKER_MARKERS = new Set([
	'dockerfile',
	'docker-compose.yml',
	'docker-compose.yaml',
	'compose.yml',
	'compose.yaml',
	'.dockerignore',
]);
const DATABASE_MARKERS = new Set([
	'prisma',
	'db',
	'database',
	'migrations',
	'schema.prisma',
	'drizzle.config.ts',
	'drizzle.config.js',
	'supabase',
]);
const I18N_MARKERS = new Set(['i18n', 'locales']);
const WORKSPACE_AREA_ROOTS = new Set([
	'apps',
	'packages',
	'libs',
	'services',
	'extensions',
	'tools',
]);
const WEB_FRAMEWORKS = new Set([
	'astro',
	'next',
	'react',
	'remix',
	'sveltekit',
	'angular',
	'vue',
	'nuxt',
]);
const toEntrySet = (entries: readonly string[]): ReadonlySet<string> =>
	new Set(entries.map((entry) => entry.toLowerCase()));

const hasAny = (
	entries: ReadonlySet<string>,
	markers: ReadonlySet<string>,
): boolean => {
	for (const marker of markers) {
		if (entries.has(marker)) return true;
	}
	return false;
};

const normalizePathEntry = (entry: string): string =>
	entry.replaceAll('\\', '/').replace(/^\.\//, '').replace(/\/+$/, '');

const tokenizePathEntry = (entry: string): readonly string[] =>
	normalizePathEntry(entry)
		.toLowerCase()
		.split(/[/.@_-]+/)
		.filter((token) => token.length > 0);

const collectWorkspaceCandidates = (
	topLevelDirs: readonly string[],
): readonly IWorkspaceCandidate[] => {
	const byWorkspace = new Map<
		string,
		{ workspacePath: string; area: string; entries: Set<string> }
	>();
	for (const rawEntry of topLevelDirs) {
		const normalized = normalizePathEntry(rawEntry);
		const segments = normalized
			.split('/')
			.filter((segment) => segment.length > 0);
		const areaSegment = segments[0];
		const workspaceSegment = segments[1];
		if (areaSegment === undefined || workspaceSegment === undefined)
			continue;
		const area = areaSegment.toLowerCase();
		if (!WORKSPACE_AREA_ROOTS.has(area)) continue;
		const workspacePath = `${areaSegment}/${workspaceSegment}`;
		const key = workspacePath.toLowerCase();
		const existing = byWorkspace.get(key);
		if (existing === undefined) {
			byWorkspace.set(key, {
				workspacePath,
				area: areaSegment,
				entries: new Set([workspacePath, normalized]),
			});
			continue;
		}
		existing.entries.add(normalized);
	}
	return [...byWorkspace.values()]
		.map((workspace) => ({
			workspacePath: workspace.workspacePath,
			area: workspace.area,
			entries: [...workspace.entries],
		}))
		.sort((left, right) =>
			left.workspacePath.localeCompare(right.workspacePath),
		);
};

const toWorkspaceTopLevelDirs = (
	workspace: IWorkspaceCandidate,
): readonly string[] => {
	const scoped = new Set<string>();
	for (const entry of workspace.entries) {
		if (entry === workspace.workspacePath) continue;
		const relative = entry.slice(workspace.workspacePath.length + 1);
		if (relative.length === 0) continue;
		scoped.add(relative.split('/')[0] ?? relative);
	}
	return [...scoped];
};

const detectFramework = (
	workspace: IWorkspaceCandidate,
): IProjectAnalysis['framework'] | undefined => {
	for (const token of workspace.entries.flatMap(tokenizePathEntry)) {
		if (WEB_FRAMEWORKS.has(token)) {
			return token as IProjectAnalysis['framework'];
		}
	}
	return undefined;
};

const areaRationaleFor = (
	workspacePath: string,
	candidatePresetId: string,
	analysis: IProjectAnalysis,
	workspaceEntries: ReadonlySet<string>,
): string => {
	if (analysis.framework !== undefined) {
		return `Workspace ${workspacePath} is eligible for ${candidatePresetId} because it exposes ${analysis.framework} markers.`;
	}
	if (analysis.projectType === 'cli') {
		return `Workspace ${workspacePath} is eligible for ${candidatePresetId} because it reads as a CLI-focused area.`;
	}
	if (
		hasAny(workspaceEntries, DATABASE_MARKERS) ||
		hasAny(workspaceEntries, DOCKER_MARKERS)
	) {
		return `Workspace ${workspacePath} is eligible for ${candidatePresetId} because it exposes backend/data markers.`;
	}
	return `Workspace ${workspacePath} stays on the ${candidatePresetId} candidate because no stronger area-specific marker was detected.`;
};

const buildMonorepoAreaBreakdown = (
	analysis: IProjectAnalysis,
	topLevelDirs: readonly string[],
): readonly IMonorepoAreaAssessment[] | undefined => {
	if (analysis.projectType !== 'monorepo') return undefined;
	const workspaces = collectWorkspaceCandidates(topLevelDirs);
	if (workspaces.length < 3) return undefined;
	const breakdown = workspaces.map((workspace) => {
		const workspaceTopLevelDirs = toWorkspaceTopLevelDirs(workspace);
		const workspaceEntries = toEntrySet(workspaceTopLevelDirs);
		const framework = detectFramework(workspace);
		const workspaceNameTokens = tokenizePathEntry(workspace.workspacePath);
		const projectType: IProjectAnalysis['projectType'] =
			workspaceNameTokens.includes('cli')
				? 'cli'
				: framework !== undefined ||
						workspace.area.toLowerCase() === 'apps'
					? 'webapp'
					: 'library';
		const workspaceAnalysis: IProjectAnalysis = {
			...analysis,
			projectType,
			framework,
			monorepoTool: undefined,
			docsConventions: [],
		};
		const candidatePresetId = chooseCandidatePreset(
			workspaceAnalysis,
			workspaceEntries,
			workspaceTopLevelDirs,
		);
		const pluginRecommendations = buildPluginRecommendations(
			workspaceAnalysis,
			workspaceTopLevelDirs,
			candidatePresetId,
		);
		const recommendedPluginIds = pluginRecommendations
			.filter((entry) => entry.recommended)
			.map((entry) => entry.id);
		return {
			workspacePath: workspace.workspacePath,
			area: workspace.area,
			candidatePresetId,
			recommendedPluginIds,
			pluginRecommendations,
			rationale: areaRationaleFor(
				workspace.workspacePath,
				candidatePresetId,
				workspaceAnalysis,
				workspaceEntries,
			),
			summary: {
				projectType,
				language: workspaceAnalysis.language,
				packageManager: workspaceAnalysis.packageManager,
				ciProvider: workspaceAnalysis.ciProvider ?? 'unknown',
				docsConventions: workspaceAnalysis.docsConventions ?? [],
				testRunner: workspaceAnalysis.testRunner,
				...(framework !== undefined ? { framework } : {}),
			},
		};
	});
	const diversity = new Set(
		breakdown.map(
			(entry) =>
				`${entry.candidatePresetId}:${entry.summary.framework ?? entry.summary.projectType}`,
		),
	);
	if (diversity.size <= 1) return undefined;
	return breakdown;
};

const chooseCandidatePreset = (
	analysis: IProjectAnalysis,
	entries: ReadonlySet<string>,
	topLevelDirs: readonly string[],
): string => {
	if (analysis.projectType === 'monorepo') return 'swarm';
	if (analysis.projectType === 'cli') return 'cli-tool';
	const hasDocsSite = (analysis.docsConventions ?? []).some((entry) =>
		entry.startsWith('docs-site:'),
	);
	if (hasDocsSite || WEB_FRAMEWORKS.has(analysis.framework ?? '')) {
		return 'web-app';
	}
	if (hasAny(entries, DATABASE_MARKERS) || hasAny(entries, DOCKER_MARKERS)) {
		return 'backend-api';
	}
	return deriveConfig(analysis, { topLevelDirs }).preset;
};

const pluginSignalAllows = (
	pluginId: string,
	analysis: IProjectAnalysis,
	entries: ReadonlySet<string>,
): boolean => {
	if (pluginId === 'container') return hasAny(entries, DOCKER_MARKERS);
	if (pluginId === 'database') return hasAny(entries, DATABASE_MARKERS);
	if (pluginId === 'docs' || pluginId === 'link-check') {
		return (analysis.docsConventions ?? []).length > 0;
	}
	if (pluginId === 'i18n') return hasAny(entries, I18N_MARKERS);
	if (pluginId === 'env') {
		for (const entry of entries) {
			if (entry.startsWith('.env')) return true;
		}
		return false;
	}
	if (pluginId === 'forge')
		return (analysis.ciProvider ?? 'unknown') !== 'unknown';
	if (pluginId === 'test-convention' || pluginId === 'test-policy') {
		return analysis.testRunner !== 'unknown';
	}
	return true;
};

const rationaleFor = (
	pluginId: string,
	recommended: boolean,
	presetId: string,
	analysis: IProjectAnalysis,
): string => {
	if (recommended) {
		if (pluginId === 'container')
			return 'Recommended because the repo exposes container files at the root.';
		if (pluginId === 'database')
			return 'Recommended because the repo exposes database or migration markers.';
		if (pluginId === 'docs' || pluginId === 'link-check')
			return 'Recommended because the repo already has documented surfaces to preserve.';
		if (pluginId === 'forge')
			return 'Recommended because CI/forge metadata is already present in the repository.';
		if (pluginId === 'i18n')
			return 'Recommended because locale/i18n folders are already present.';
		if (pluginId === 'env')
			return 'Recommended because dotenv-style files are already present.';
		return `Recommended by the ${presetId} adoption surface for this ${analysis.projectType} ${analysis.language} stack.`;
	}
	if (pluginId === 'container')
		return 'Not recommended because no Docker or Compose markers were detected.';
	if (pluginId === 'database')
		return 'Not recommended because no database or migration markers were detected.';
	if (pluginId === 'docs' || pluginId === 'link-check')
		return 'Not recommended because no documentation surface was detected.';
	if (pluginId === 'forge')
		return 'Not recommended because no supported CI/forge marker was detected.';
	if (pluginId === 'i18n')
		return 'Not recommended because no locale/i18n folders were detected.';
	if (pluginId === 'env')
		return 'Not recommended because no dotenv-style files were detected.';
	return `Not recommended by the ${presetId} adoption surface; add it only if this project explicitly needs that capability.`;
};

const buildPluginRecommendations = (
	analysis: IProjectAnalysis,
	topLevelDirs: readonly string[],
	presetId: string,
): readonly IPluginRecommendation[] => {
	const entries = toEntrySet(topLevelDirs);
	const presetMembers = new Set(resolvePresetMembers(presetId));
	return FIRST_PARTY_PLUGIN_INDEX.entries.map((entry) => ({
		id: entry.id,
		recommended:
			presetMembers.has(entry.id) &&
			pluginSignalAllows(entry.id, analysis, entries),
		rationale: rationaleFor(
			entry.id,
			presetMembers.has(entry.id) &&
				pluginSignalAllows(entry.id, analysis, entries),
			presetId,
			analysis,
		),
	}));
};

const coversAll = (
	presetId: string,
	pluginIds: ReadonlySet<string>,
): boolean => {
	const covered = new Set(resolvePresetMembers(presetId));
	for (const pluginId of pluginIds) {
		if (!covered.has(pluginId)) return false;
	}
	return true;
};

/**
 * f00179 S3: when no preset covers the recommended set, sum the
 * `tokenBudgetBytes` exposed by every plugin in
 * `FIRST_PARTY_PLUGIN_INDEX` (populated from each manifest's
 * `IPluginTokenBudget.staticBytes` or legacy `warning`). Returns
 * `undefined` when any plugin lacks a measurement — in that case
 * the caller falls back to the conservative swarm-marginal estimate.
 */
const aggregatePluginBytes = (
	recommendedPluginIds: readonly string[],
): readonly { plugin: string; bytes: number }[] | undefined => {
	const entriesById = new Map(
		FIRST_PARTY_PLUGIN_INDEX.entries.map((entry) => [entry.id, entry]),
	);
	const rows: { plugin: string; bytes: number }[] = [];
	for (const id of recommendedPluginIds) {
		const entry = entriesById.get(id);
		if (entry === undefined || entry.tokenBudgetBytes === undefined) {
			return undefined;
		}
		rows.push({ plugin: id, bytes: entry.tokenBudgetBytes });
	}
	return rows;
};

const buildCost = (
	recommendedPluginIds: readonly string[],
): IAssessmentCost => {
	const pluginSet = new Set(recommendedPluginIds);
	const coveringPreset = [...PRESET_CATALOG]
		.sort(
			(left, right) =>
				left.budget.schemaBytes.value - right.budget.schemaBytes.value,
		)
		.find((preset) => coversAll(preset.id, pluginSet));
	if (coveringPreset !== undefined) {
		return {
			presetId: coveringPreset.id,
			schemaBytes: coveringPreset.budget.schemaBytes.value,
			estimatedTokens: coveringPreset.budget.coldStartTokens.value,
			recommendedPluginCount: recommendedPluginIds.length,
			source: 'preset-budget',
			surfaceMode: coveringPreset.budget.surfaceMode,
			runtimeSurface: coveringPreset.budget.runtimeSurface,
			note: `Measured runtime budget reused from preset ${coveringPreset.id} (${coveringPreset.budget.surfaceMode} surface).`,
		};
	}
	// S3: per-plugin staticBytes aggregation (preferred over
	// the swarm marginal upper bound when every plugin in the set has
	// a real measurement on its manifest).
	const perPlugin = aggregatePluginBytes(recommendedPluginIds);
	if (perPlugin !== undefined) {
		const totalBytes = perPlugin.reduce((sum, row) => sum + row.bytes, 0);
		return {
			presetId: 'plugin-budget',
			schemaBytes: totalBytes,
			estimatedTokens: Math.ceil(
				totalBytes / TOKEN_BUDGETS.bytesPerEstimatedToken,
			),
			recommendedPluginCount: recommendedPluginIds.length,
			source: 'plugin-budget',
			surfaceMode: 'estimated',
			note: `Sum of staticBytes from ${perPlugin.length} plugin manifest(s); no preset covers the recommendation.`,
			perPluginBytes: perPlugin,
		};
	}
	const fallbackBytes =
		recommendedPluginIds.length *
		TOKEN_BUDGETS.presets.swarm.toolsList.marginalPluginWarning!;
	return {
		presetId: 'fallback',
		schemaBytes: fallbackBytes,
		estimatedTokens: Math.ceil(
			fallbackBytes / TOKEN_BUDGETS.bytesPerEstimatedToken,
		),
		recommendedPluginCount: recommendedPluginIds.length,
		source: 'fallback-budget',
		surfaceMode: 'estimated',
		note: 'Fallback upper bound using the existing swarm marginal-plugin warning budget.',
	};
};

const buildConflicts = (
	analysis: IProjectAnalysis,
	options: IBuildAdoptionAssessmentOptions,
): readonly IAssessmentConflict[] => [
	...(analysis.conflicts ?? []).map(
		(summary): IAssessmentConflict => ({
			kind: 'existing-surface',
			summary,
			severity: 'warning',
			exact: true,
		}),
	),
	((): IAssessmentConflict => {
		const hostOptions = {
			projectName: options.projectName ?? analysis.name ?? 'Workspace',
			namespacePrefix: options.namespacePrefix ?? 'mcp-vertex',
			projectPackageName: '@mcp-vertex/adopted',
			mcpServerName: options.mcpServerName ?? 'mcp-vertex',
			existingMcpVertex: true,
			...(options.defaultModel !== undefined
				? { defaultModel: options.defaultModel }
				: {}),
		} as const;
		const estimate = buildAdoptProjectWriteEstimate({
			hostOptions,
			...(options.docsDir !== undefined
				? { docsDir: options.docsDir }
				: {}),
		});
		return {
			kind: 'write-estimate',
			summary:
				'Estimated adopt_project write surface (config + agents/instructions + proposals store).',
			severity: 'info',
			count: estimate.count,
			exact: estimate.exact,
			breakdown: estimate.breakdown,
		};
	})(),
];

export const buildAdoptionAssessment = (
	analysis: IProjectAnalysis,
	topLevelDirs: readonly string[],
	_options: IBuildAdoptionAssessmentOptions = {},
): IAdoptionAssessmentWithAreas => {
	const recommendedPresetId = chooseCandidatePreset(
		analysis,
		toEntrySet(topLevelDirs),
		topLevelDirs,
	);
	const areaBreakdown = buildMonorepoAreaBreakdown(analysis, topLevelDirs);
	const pluginRecommendations = buildPluginRecommendations(
		analysis,
		topLevelDirs,
		recommendedPresetId,
	);
	const recommendedPluginIds = pluginRecommendations
		.filter((entry) => entry.recommended)
		.map((entry) => entry.id);
	return {
		recommendedPresetId,
		recommendedPluginIds,
		pluginRecommendations,
		conflicts: buildConflicts(analysis, _options),
		cost: buildCost(recommendedPluginIds),
		...(areaBreakdown !== undefined ? { areaBreakdown } : {}),
		summary: {
			projectType: analysis.projectType,
			language: analysis.language,
			packageManager: analysis.packageManager,
			ciProvider: analysis.ciProvider ?? 'unknown',
			docsConventions: analysis.docsConventions ?? [],
		},
	};
};
