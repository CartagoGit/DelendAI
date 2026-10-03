import { access } from 'node:fs/promises';
import { join } from 'node:path';

import {
	discoverRoster,
	rankProviders,
	realDiscoveryDeps,
} from '@delendai/auto-agent-selector/public';
import { recommendPlugins } from '@delendai/auto-plugin-selector/public';
import { truncateIfTooLarge } from '@delendai/core/public';
import { runProfileCapture } from '@delendai/perf/public';
import { runEvalHarness } from '@delendai/prompt-eval/public';
import {
	BUILTIN_CLIENT_TABLE,
	detectAgent,
	RecordBuffer,
} from '@delendai/usage-tracking/public';

import {
	ADAPTIVE_OPTIMIZER_DEFAULT_BUDGET_DIAL,
	DEFAULT_ADAPTIVE_OPTIMIZER_MAX_BYTES,
	OPTIMIZATION_CONFIDENCE_AGENT_BONUS,
	OPTIMIZATION_CONFIDENCE_EXPERIMENT_HOOK_BONUS,
	OPTIMIZATION_CONFIDENCE_PROVIDER_MATCH_BONUS,
	OPTIMIZATION_CONFIDENCE_PROVIDER_TOP_BONUS,
	OPTIMIZATION_CONFIDENCE_USAGE_MIRROR_BONUS,
	OPTIMIZATION_DEFAULT_CONFIDENCE,
	OPTIMIZATION_DEFAULT_LATENCY_MS,
	OPTIMIZATION_DEFAULT_RELEVANCE,
	OPTIMIZATION_DEFAULT_SUCCESS_RATE,
	OPTIMIZATION_DEFAULT_TOKEN_COST,
	OPTIMIZATION_LATENCY_COST_TIER_BONUS_MS,
	OPTIMIZATION_LATENCY_PERMISSION_BONUS_MS,
	OPTIMIZATION_LATENCY_PLUGIN_MATCH_BONUS_MS,
	OPTIMIZATION_RELEVANCE_OVERLAP_WEIGHT,
	OPTIMIZATION_RELEVANCE_PLUGIN_MATCH_WEIGHT,
	OPTIMIZATION_SUCCESS_DESCRIPTION_BONUS,
	OPTIMIZATION_SUCCESS_PLUGIN_MATCH_BONUS,
	OPTIMIZATION_SUCCESS_PROMPT_BONUS,
	OPTIMIZATION_SUCCESS_PROVIDER_MATCH_BONUS,
	OPTIMIZATION_SUCCESS_PROVIDER_TOP_BONUS,
} from '../contracts/constants/adaptive-optimizer.constant';
import type {
	IOptimizationCandidate,
	IOptimizationRankedCandidate,
	IOptimizationSignalOverrides,
	IOptimizationSignals,
	IOptimizeRunOutput,
	IOptimizeRunRuntimeOptions,
	IOptimizeRunToolArgs,
} from '../contracts/interfaces/adaptive-optimizer.interface';
import { scoreOptimizationCandidate } from './optimization-scoring.service';

interface IOptimizationProjectSignals {
	readonly pack: 'typescript' | 'generic';
	readonly languages: readonly string[];
	readonly hasDocsSite: boolean;
	readonly isCliTool: boolean;
	readonly hasBackend: boolean;
	readonly hasTests: boolean;
	readonly taskHint?: string | undefined;
}

type TRankedProvider = ReturnType<typeof rankProviders>[number];

const clamp01 = (value: number): number => Math.min(1, Math.max(0, value));

const hasPath = async (absolutePath: string): Promise<boolean> => {
	try {
		await access(absolutePath);
		return true;
	} catch {
		return false;
	}
};

const tokenize = (value: string): readonly string[] =>
	value
		.toLowerCase()
		.split(/[^a-z0-9]+/u)
		.filter((token) => token.length >= 3);

const overlapScore = (
	leftText: string | undefined,
	rightText: string,
): number => {
	if (leftText === undefined || leftText.trim() === '') return 0;
	const left = new Set(tokenize(leftText));
	const right = new Set(tokenize(rightText));
	if (left.size === 0 || right.size === 0) return 0;
	let overlap = 0;
	for (const token of left) {
		if (right.has(token)) overlap += 1;
	}
	return overlap / Math.max(left.size, right.size);
};

const estimateTokenCost = (
	candidate: IOptimizationCandidate,
	task?: string,
): number => {
	const text = [
		task ?? '',
		candidate.prompt ?? '',
		candidate.toolDescription ?? '',
		candidate.model ?? '',
		...(candidate.pluginSet ?? []),
	].join(' ');
	const estimated = Math.ceil(text.length / 4);
	return Math.max(OPTIMIZATION_DEFAULT_TOKEN_COST, estimated);
};

const buildProjectSignals = async (
	workspaceRootAbs: string,
	task?: string,
): Promise<IOptimizationProjectSignals> => {
	const [hasDocsDir, hasWebApp, hasCli, hasTests, hasTypeScript, hasBackend] =
		await Promise.all([
			hasPath(join(workspaceRootAbs, 'docs')),
			hasPath(join(workspaceRootAbs, 'apps/web')),
			hasPath(join(workspaceRootAbs, 'packages/cli')),
			hasPath(join(workspaceRootAbs, 'tests')).then(
				(value) => value,
				() => false,
			),
			hasPath(join(workspaceRootAbs, 'tsconfig.json')),
			hasPath(join(workspaceRootAbs, 'packages/core')),
		]);
	return {
		pack: hasTypeScript ? 'typescript' : 'generic',
		languages: ['typescript'],
		hasDocsSite: hasDocsDir || hasWebApp,
		isCliTool: hasCli,
		hasBackend,
		hasTests,
		...(task === undefined ? {} : { taskHint: task }),
	};
};

const derivePluginRecommendations = (
	candidates: readonly IOptimizationCandidate[],
	projectSignals: IOptimizationProjectSignals,
): ReadonlySet<string> => {
	const ids = new Set<string>();
	for (const candidate of candidates) {
		for (const pluginId of candidate.pluginSet ?? []) {
			ids.add(pluginId);
		}
	}
	if (ids.size === 0) return new Set<string>();
	const fits = recommendPlugins(
		{
			pack: projectSignals.pack,
			languages: projectSignals.languages,
			hasDocsSite: projectSignals.hasDocsSite,
			isCliTool: projectSignals.isCliTool,
			hasBackend: projectSignals.hasBackend,
			hasTests: projectSignals.hasTests,
			...(projectSignals.taskHint === undefined
				? {}
				: { taskHint: projectSignals.taskHint }),
		},
		[...ids].map((pluginId) => ({
			id: pluginId,
			tags: pluginId.split('-'),
			summary: pluginId,
		})),
		{ limit: Math.max(1, ids.size) },
	);
	return new Set(fits.map((fit) => fit.plugin.id));
};

const findProviderSignal = (
	model: string | undefined,
	rankedProviders: readonly TRankedProvider[],
): { topMatch: boolean; anyMatch: boolean; costTier?: number } => {
	if (model === undefined) return { topMatch: false, anyMatch: false };
	const normalized = model.toLowerCase();
	const top = rankedProviders[0]?.candidate;
	const any = rankedProviders.find((row) => {
		const idMatch = row.candidate.id.toLowerCase() === normalized;
		const labelMatch = row.candidate.label.toLowerCase() === normalized;
		return idMatch || labelMatch;
	})?.candidate;
	return {
		topMatch:
			top !== undefined &&
			(top.id.toLowerCase() === normalized ||
				top.label.toLowerCase() === normalized),
		anyMatch: any !== undefined,
		...(any === undefined ? {} : { costTier: any.costTier }),
	};
};

const buildSignals = (
	candidate: IOptimizationCandidate,
	args: IOptimizeRunToolArgs,
	context: {
		readonly rankedProviders: readonly TRankedProvider[];
		readonly recommendedPlugins: ReadonlySet<string>;
		readonly agentKnown: boolean;
		readonly usageMirrorAvailable: boolean;
		readonly optionalExperimentHooksAvailable: boolean;
	},
): IOptimizationSignals => {
	const signalOverrides: IOptimizationSignalOverrides =
		candidate.signals ?? {};
	const providerSignal = findProviderSignal(
		candidate.model,
		context.rankedProviders,
	);
	const pluginMatchCount = (candidate.pluginSet ?? []).filter((pluginId) =>
		context.recommendedPlugins.has(pluginId),
	).length;
	const textSurface = [
		candidate.model ?? '',
		candidate.prompt ?? '',
		candidate.toolDescription ?? '',
		...(candidate.pluginSet ?? []),
	].join(' ');
	const inferredRelevance = clamp01(
		OPTIMIZATION_DEFAULT_RELEVANCE +
			overlapScore(args.task, textSurface) *
				OPTIMIZATION_RELEVANCE_OVERLAP_WEIGHT +
			pluginMatchCount * OPTIMIZATION_RELEVANCE_PLUGIN_MATCH_WEIGHT,
	);
	const inferredConfidence = clamp01(
		OPTIMIZATION_DEFAULT_CONFIDENCE +
			(context.agentKnown ? OPTIMIZATION_CONFIDENCE_AGENT_BONUS : 0) +
			(context.usageMirrorAvailable
				? OPTIMIZATION_CONFIDENCE_USAGE_MIRROR_BONUS
				: 0) +
			(context.optionalExperimentHooksAvailable
				? OPTIMIZATION_CONFIDENCE_EXPERIMENT_HOOK_BONUS
				: 0) +
			(providerSignal.anyMatch
				? OPTIMIZATION_CONFIDENCE_PROVIDER_MATCH_BONUS
				: 0) +
			(providerSignal.topMatch
				? OPTIMIZATION_CONFIDENCE_PROVIDER_TOP_BONUS
				: 0),
	);
	const inferredSuccessRate = clamp01(
		OPTIMIZATION_DEFAULT_SUCCESS_RATE +
			(providerSignal.topMatch
				? OPTIMIZATION_SUCCESS_PROVIDER_TOP_BONUS
				: 0) +
			(providerSignal.anyMatch
				? OPTIMIZATION_SUCCESS_PROVIDER_MATCH_BONUS
				: 0) +
			(pluginMatchCount > 0
				? OPTIMIZATION_SUCCESS_PLUGIN_MATCH_BONUS
				: 0) +
			(candidate.prompt !== undefined
				? OPTIMIZATION_SUCCESS_PROMPT_BONUS
				: 0) +
			(candidate.toolDescription !== undefined
				? OPTIMIZATION_SUCCESS_DESCRIPTION_BONUS
				: 0),
	);
	return {
		successRate: signalOverrides.successRate ?? inferredSuccessRate,
		tokenCost:
			signalOverrides.tokenCost ??
			estimateTokenCost(candidate, args.task),
		latencyMs:
			signalOverrides.latencyMs ??
			OPTIMIZATION_DEFAULT_LATENCY_MS +
				pluginMatchCount * OPTIMIZATION_LATENCY_PLUGIN_MATCH_BONUS_MS +
				(candidate.permissions?.length ?? 0) *
					OPTIMIZATION_LATENCY_PERMISSION_BONUS_MS +
				(providerSignal.costTier ??
					ADAPTIVE_OPTIMIZER_DEFAULT_BUDGET_DIAL) *
					OPTIMIZATION_LATENCY_COST_TIER_BONUS_MS,
		relevance: signalOverrides.relevance ?? inferredRelevance,
		confidence: signalOverrides.confidence ?? inferredConfidence,
		...(typeof signalOverrides.permissionRisk === 'number'
			? { permissionRisk: signalOverrides.permissionRisk }
			: {}),
	};
};

const finalizeOutput = (
	raw: Omit<IOptimizeRunOutput, 'bytes' | 'truncated'>,
	maxBytes: number,
): IOptimizeRunOutput => {
	const direct = truncateIfTooLarge(raw, maxBytes);
	if (!direct.truncated) {
		return { ...raw, bytes: direct.finalBytes, truncated: false };
	}
	for (
		let size = Math.max(1, Math.floor(raw.ranked.length / 2));
		size >= 1;
		size = Math.floor(size / 2)
	) {
		const candidate = { ...raw, ranked: raw.ranked.slice(0, size) };
		const bounded = truncateIfTooLarge(candidate, maxBytes);
		if (!bounded.truncated) {
			return {
				...candidate,
				bytes: bounded.finalBytes,
				truncated: true,
			};
		}
		if (size === 1) break;
	}
	return {
		...raw,
		ranked: raw.ranked.slice(0, 1),
		bytes: truncateIfTooLarge(
			{ ...raw, ranked: raw.ranked.slice(0, 1) },
			maxBytes,
		).finalBytes,
		truncated: true,
	};
};

export const buildOptimizeRunPayload = async (
	args: IOptimizeRunToolArgs,
	options: IOptimizeRunRuntimeOptions,
): Promise<IOptimizeRunOutput> => {
	const roster = await (
		options.discoverRosterFn ?? (() => discoverRoster(realDiscoveryDeps()))
	)().catch(() => ({ available: [], missing: [] }));
	const rankedProviders = rankProviders({
		available: roster.available,
		costQualityTradeoff: ADAPTIVE_OPTIMIZER_DEFAULT_BUDGET_DIAL,
	});
	const detectedAgent = detectAgent(options.hostName, BUILTIN_CLIENT_TABLE);
	const projectSignals = await buildProjectSignals(
		options.workspaceRootAbs,
		args.task,
	);
	const recommendedPlugins = derivePluginRecommendations(
		args.candidates,
		projectSignals,
	);
	const usageMirrorAvailable = typeof RecordBuffer === 'function';
	const optionalExperimentHooksAvailable =
		typeof runEvalHarness === 'function' &&
		typeof runProfileCapture === 'function';
	const ranked: IOptimizationRankedCandidate[] = args.candidates
		.map((candidate) => {
			const signals = buildSignals(candidate, args, {
				rankedProviders,
				recommendedPlugins,
				agentKnown: detectedAgent.kind !== 'unknown',
				usageMirrorAvailable,
				optionalExperimentHooksAvailable,
			});
			return {
				id: candidate.id,
				...scoreOptimizationCandidate(candidate, signals),
			};
		})
		.sort(
			(left, right) =>
				right.score - left.score || left.id.localeCompare(right.id),
		);
	return finalizeOutput(
		{
			ranked,
			budget: args.budget,
			consent: args.consent,
		},
		options.maxBytes || DEFAULT_ADAPTIVE_OPTIMIZER_MAX_BYTES,
	);
};
