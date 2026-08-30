// effect-boundary-authorized: Owns the persisted KPI history store and pairs direct filesystem reads with atomic writes under a file mutex.
import { access } from 'node:fs/promises';

import {
	joinUnderRoot,
	resolveAgainstRoots,
	SafeWorkspaceReader,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import type {
	IKpiEconomicsValue,
	IKpiEconomicsValueInput,
	IKpiHistoryEconomics,
	IKpiHistoryEntry,
	IKpiHistoryMetricBinding,
	IKpiHistoryPersistOptions,
	IKpiHistoryPersistResult,
	IKpiHistoryReadOptions,
	IKpiHistoryReadResult,
	IKpiHistoryStore,
	IKpiHistoryStorageOptions,
	TKpiHistoryEconomicsStatus,
} from '../contracts/kpi-history.interface';

export const DEFAULT_KPI_HISTORY_RETENTION_DAYS = 30;
export const DEFAULT_KPI_HISTORY_WINDOW_DAYS = 7;

const DAY_MS = 86_400_000;

const resolveHistoryPath = (options: IKpiHistoryStorageOptions): string => {
	const contained = resolveAgainstRoots(
		options.workspaceRootAbs,
		[options.workspaceRootAbs],
		options.cacheDir,
	);
	if (!contained.ok) {
		throw new Error(
			`Configured project KPI cache directory is outside the workspace: ${contained.reason ?? options.cacheDir}`,
		);
	}
	return joinUnderRoot(contained.abs, 'results/project-kpis/history.json');
};

const asIsoString = (value: Date): string => value.toISOString();

const parseTime = (value: string): number => {
	const parsed = Date.parse(value);
	if (Number.isNaN(parsed)) {
		throw new Error(`Invalid ISO timestamp in KPI history: ${value}`);
	}
	return parsed;
};

const isPositiveInteger = (value: unknown): value is number =>
	typeof value === 'number' && Number.isInteger(value) && value > 0;

const asFiniteNumber = (value: unknown): number | undefined =>
	typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const defaultStore = (retentionDays: number): IKpiHistoryStore => ({
	contract: 'project-kpis.history',
	version: 1,
	updatedAt: new Date(0).toISOString(),
	retentionDays,
	entries: [],
});

const parseStore = (
	content: string,
	retentionDays: number,
): IKpiHistoryStore => {
	const parsed = JSON.parse(content) as Partial<IKpiHistoryStore>;
	if (parsed.contract !== 'project-kpis.history' || parsed.version !== 1) {
		throw new Error(
			'KPI history store has an unsupported contract or version.',
		);
	}
	if (!Array.isArray(parsed.entries)) {
		throw new Error('KPI history store is missing its entries array.');
	}
	return {
		contract: 'project-kpis.history',
		version: 1,
		updatedAt:
			typeof parsed.updatedAt === 'string'
				? parsed.updatedAt
				: new Date(0).toISOString(),
		retentionDays: isPositiveInteger(parsed.retentionDays)
			? parsed.retentionDays
			: retentionDays,
		entries: parsed.entries,
	};
};

const readStore = async (
	options: IKpiHistoryStorageOptions,
	pathAbs: string,
	retentionDays: number,
): Promise<IKpiHistoryStore> => {
	const pathExists =
		options.pathExists ??
		(async (path: string): Promise<boolean> => {
			try {
				await access(path);
				return true;
			} catch {
				return false;
			}
		});
	const readTextFile =
		options.readTextFile ??
		(async (path: string) =>
			(
				await new SafeWorkspaceReader(
					options.workspaceRootAbs,
				).readText(path)
			).content);
	if (!(await pathExists(pathAbs))) {
		return defaultStore(retentionDays);
	}
	const content = await readTextFile(pathAbs);
	return parseStore(content, retentionDays);
};

const compareEntries = (
	left: IKpiHistoryEntry,
	right: IKpiHistoryEntry,
): number => {
	const delta =
		parseTime(left.snapshot.generatedAt) -
		parseTime(right.snapshot.generatedAt);
	if (delta !== 0) {
		return delta;
	}
	return left.persistedAt.localeCompare(right.persistedAt);
};

const trimToRetention = (
	entries: readonly IKpiHistoryEntry[],
	now: Date,
	retentionDays: number,
): IKpiHistoryEntry[] => {
	const cutoff = now.getTime() - retentionDays * DAY_MS;
	return entries
		.filter((entry) => parseTime(entry.snapshot.generatedAt) >= cutoff)
		.sort(compareEntries);
};

const inferEconomicsStatus = (
	binding: IKpiHistoryMetricBinding,
): TKpiHistoryEconomicsStatus => {
	if (binding.metric.value === undefined) {
		return 'unavailable';
	}
	if (binding.metric.status === 'measured') {
		return 'provider-reported';
	}
	if (binding.metric.status === 'estimated') {
		return 'configured-estimate';
	}
	return binding.fallbackStatus;
};

const buildEconomicsValue = (
	unit: IKpiEconomicsValue['unit'],
	binding: IKpiHistoryMetricBinding,
	explicit?: IKpiEconomicsValueInput,
): IKpiEconomicsValue => {
	if (explicit !== undefined) {
		const explicitValue = asFiniteNumber(explicit.value);
		return {
			status: explicit.status,
			unit,
			source: explicit.source,
			methodology: explicit.methodology,
			confidence: explicit.confidence,
			...(explicitValue !== undefined ? { value: explicitValue } : {}),
			...(explicit.observedAt !== undefined
				? { observedAt: explicit.observedAt }
				: binding.metric.observedAt !== undefined
					? { observedAt: binding.metric.observedAt }
					: {}),
			...(explicit.note !== undefined
				? { note: explicit.note }
				: binding.metric.note !== undefined
					? { note: binding.metric.note }
					: {}),
		};
	}
	const inferredStatus = inferEconomicsStatus(binding);
	const inferredValue = asFiniteNumber(binding.metric.value);
	const methodology =
		inferredStatus === 'provider-reported'
			? 'Persisted directly from a measured IKpiSnapshot metric.'
			: inferredStatus === 'configured-estimate'
				? 'Persisted directly from an estimated IKpiSnapshot metric using configured pricing or baseline inputs.'
				: binding.unavailableMethodology;
	return {
		status: inferredStatus,
		unit,
		source: binding.metric.source,
		methodology,
		confidence: binding.metric.status,
		...(inferredValue !== undefined && inferredStatus !== 'unavailable'
			? { value: inferredValue }
			: {}),
		...(binding.metric.observedAt !== undefined
			? { observedAt: binding.metric.observedAt }
			: {}),
		...(binding.metric.note !== undefined
			? { note: binding.metric.note }
			: {}),
	};
};

const buildEconomics = (
	options: IKpiHistoryPersistOptions,
): IKpiHistoryEconomics => ({
	costUsd: buildEconomicsValue(
		'usd',
		{
			metric: options.snapshot.usage.costUsd,
			fallbackStatus: 'unavailable',
			unavailableMethodology:
				'No provider-reported cost, configured estimate or explicit subscription evidence was persisted for this snapshot.',
		},
		options.economics?.costUsd,
	),
	tokenSavings: buildEconomicsValue(
		'tokens',
		{
			metric: options.snapshot.usage.tokensSaved,
			fallbackStatus: 'unavailable',
			unavailableMethodology:
				'No baseline-backed token savings evidence was persisted for this snapshot.',
		},
		options.economics?.tokenSavings,
	),
	financialSavingsUsd: buildEconomicsValue(
		'usd',
		{
			metric: {
				status: 'unavailable',
				unit: 'usd',
				source: 'project-kpis/S3',
				note: 'Financial savings require an explicit baseline and attributable cost evidence.',
			},
			fallbackStatus: 'unavailable',
			unavailableMethodology:
				'Financial savings were left unavailable because no explicit baseline-backed USD evidence was provided.',
		},
		options.economics?.financialSavingsUsd,
	),
});

const buildEntry = (
	options: IKpiHistoryPersistOptions,
	now: Date,
): IKpiHistoryEntry => ({
	snapshot: options.snapshot,
	persistedAt: asIsoString(now),
	economics: buildEconomics(options),
});

export const persistKpiSnapshotHistory = async (
	options: IKpiHistoryPersistOptions,
): Promise<IKpiHistoryPersistResult> => {
	const now = options.now ?? new Date();
	const retentionDays =
		options.retentionDays ?? DEFAULT_KPI_HISTORY_RETENTION_DAYS;
	const pathAbs = resolveHistoryPath(options);
	const withMutex = options.withFileMutex ?? withFileMutex;
	const writeTextFileAtomic = options.writeTextFileAtomic ?? writeFileAtomic;
	const nextEntry = buildEntry(options, now);

	return withMutex(pathAbs, async () => {
		const current = await readStore(options, pathAbs, retentionDays);
		const staged = [
			...current.entries.filter(
				(entry) =>
					entry.snapshot.generatedAt !==
					nextEntry.snapshot.generatedAt,
			),
			nextEntry,
		];
		const retained = trimToRetention(staged, now, retentionDays);
		const nextStore: IKpiHistoryStore = {
			contract: 'project-kpis.history',
			version: 1,
			updatedAt: asIsoString(now),
			retentionDays,
			entries: retained,
		};
		await writeTextFileAtomic(pathAbs, JSON.stringify(nextStore, null, 2));
		return {
			pathAbs,
			stored: nextEntry,
			retainedEntries: retained.length,
			prunedEntries: staged.length - retained.length,
		};
	});
};

export const readKpiHistoryWindow = async (
	options: IKpiHistoryReadOptions,
): Promise<IKpiHistoryReadResult> => {
	const now = options.now ?? new Date();
	const retentionDays =
		options.retentionDays ?? DEFAULT_KPI_HISTORY_RETENTION_DAYS;
	const pathAbs = resolveHistoryPath(options);
	const store = await readStore(options, pathAbs, retentionDays);
	const effectiveRetentionDays = options.retentionDays ?? store.retentionDays;
	const to = options.to ?? asIsoString(now);
	const toMs = parseTime(to);
	const windowDays = options.windowDays ?? DEFAULT_KPI_HISTORY_WINDOW_DAYS;
	const from =
		options.from ?? asIsoString(new Date(toMs - windowDays * DAY_MS));
	const fromMs = parseTime(from);
	const retained = trimToRetention(
		store.entries,
		now,
		effectiveRetentionDays,
	);
	const filtered = retained.filter((entry) => {
		const timestamp = parseTime(entry.snapshot.generatedAt);
		return timestamp >= fromMs && timestamp <= toMs;
	});
	const sorted = [...filtered].sort(compareEntries);
	const limited =
		options.limit !== undefined && options.limit > 0
			? sorted.slice(-options.limit)
			: sorted;
	return {
		pathAbs,
		retentionDays: effectiveRetentionDays,
		totalEntries: retained.length,
		window: {
			from,
			to,
			windowDays,
		},
		entries: limited,
	};
};
