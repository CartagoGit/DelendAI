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
			note: `Measured runtime budget reused from preset ${coveringPreset.id} (${coveringPreset.budget.surfaceMode} surface).`,
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
): IAdoptionAssessment => {
	const recommendedPresetId = chooseCandidatePreset(
		analysis,
		toEntrySet(topLevelDirs),
		topLevelDirs,
	);
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
		summary: {
			projectType: analysis.projectType,
			language: analysis.language,
			packageManager: analysis.packageManager,
			ciProvider: analysis.ciProvider ?? 'unknown',
			docsConventions: analysis.docsConventions ?? [],
		},
	};
};
