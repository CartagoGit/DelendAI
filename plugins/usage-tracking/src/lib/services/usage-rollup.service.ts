// effect-boundary-authorized: Maintains persisted usage rollups by cleaning orphaned temp siblings around atomic summary writes.
import { rm } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';

import { redactSecrets, safeListDir } from '@delendai/core/public';
import { withFileMutex, writeFileAtomic } from '@delendai/core/runtime';

import type { IDelegationRollup } from '../contracts/delegation-rollup.interface';
import type { IInvocationRecordTelemetry } from '../contracts/invocation-record.interface';
import type { IInvocationTelemetryRollup } from '../contracts/usage-rollup.interface';
import { buildCostPerCorrect } from './cost-per-correct.helper';
import {
	bucketByAxis,
	buildIssues,
	latencyOf,
	summarizeLatencies,
	telemetryTotalTokensOf,
} from './usage-rollup-buckets.helper';
import { buildDelegationRollup } from './delegation-rollup.service';
import {
	buildSummary,
	readInvocationLog,
	type IBuildSummaryOptions,
	withinWindow,
} from '../rollup';
import { readSummaryFile } from '../summary-file.service';
import type { IDegradation, IInvocationRecord, IUsageSummary } from '../types';
import type { ILimitsConfig } from '../circuit-breaker';

export type {
	IInvocationTelemetryBucket,
	IInvocationTelemetryIssue,
	ICostPerCorrectRow,
	IInvocationTelemetryRollup,
	IInvocationTelemetryTotals,
} from '../contracts/usage-rollup.interface';

type InvocationTelemetrySummary = IUsageSummary & {
	readonly invocationTelemetry: IInvocationTelemetryRollup;
	/** Delegations with and without a manifest, per kind of task. */
	readonly delegation: IDelegationRollup;
	readonly skippedRows: number;
};

const removeSummarySiblingTmpFiles = async (absPath: string): Promise<void> => {
	const dir = dirname(absPath);
	const prefix = `${basename(absPath)}.`;
	const entries = (await safeListDir(dir)).entries;
	await Promise.all(
		entries
			.filter(
				(entry) =>
					entry.isFile() &&
					entry.name.startsWith(prefix) &&
					entry.name.endsWith('.tmp'),
			)
			.map((entry) => rm(join(dir, entry.name), { force: true })),
	);
};

export const buildInvocationTelemetryRollup = (
	records: readonly IInvocationRecord[],
	windowDays: number,
	now: number = Date.now(),
): IInvocationTelemetryRollup => {
	const telemetryRecords = withinWindow(
		records,
		windowDays,
		now,
	) as IInvocationRecordTelemetry[];
	const latencies = telemetryRecords
		.map((record) => latencyOf(record))
		.filter((value): value is number => value !== null);
	const successfulCalls = telemetryRecords.reduce(
		(acc, record) => acc + (record.outcome === 'success' ? 1 : 0),
		0,
	);
	const failedCalls = telemetryRecords.length - successfulCalls;
	const retries = telemetryRecords.reduce(
		(acc, record) => acc + (record.retry ? 1 : 0),
		0,
	);
	const iterationsObserved = telemetryRecords.reduce(
		(acc, record) => acc + Math.max(record.iteration ?? 0, 0),
		0,
	);
	const schemaIncongruences = telemetryRecords.reduce(
		(acc, record) => acc + (record.errorTelemetry?.incongruence ? 1 : 0),
		0,
	);
	return {
		generatedAt: new Date(now).toISOString(),
		windowDays,
		totals: {
			calls: telemetryRecords.length,
			successfulCalls,
			failedCalls,
			retries,
			iterationsObserved,
			inputTokens: telemetryRecords.reduce(
				(acc, record) => acc + (record.usage?.inputTokens ?? 0),
				0,
			),
			outputTokens: telemetryRecords.reduce(
				(acc, record) => acc + (record.usage?.outputTokens ?? 0),
				0,
			),
			totalTokens: telemetryRecords.reduce(
				(acc, record) => acc + telemetryTotalTokensOf(record),
				0,
			),
			costUsd: telemetryRecords.reduce(
				(acc, record) => acc + (record.costUsd ?? 0),
				0,
			),
			...summarizeLatencies(latencies),
			withCorrelation: telemetryRecords.reduce(
				(acc, record) => acc + (record.correlation?.id ? 1 : 0),
				0,
			),
			schemaIncongruences,
		},
		byPlugin: bucketByAxis(telemetryRecords, 'plugin', 'calls'),
		byTool: bucketByAxis(telemetryRecords, 'tool', 'calls'),
		byModel: bucketByAxis(telemetryRecords, 'model', 'totalTokens'),
		byAgent: bucketByAxis(telemetryRecords, 'agent', 'calls'),
		byRequestType: bucketByAxis(telemetryRecords, 'requestType', 'calls'),
		byOutcome: bucketByAxis(telemetryRecords, 'outcome', 'calls'),
		byError: bucketByAxis(telemetryRecords, 'error', 'calls'),
		byDay: bucketByAxis(telemetryRecords, 'day', 'calls'),
		issues: buildIssues(telemetryRecords),
		costPerCorrect: buildCostPerCorrect(telemetryRecords),
	};
};

const writeSummaryUnlocked = async (
	absPath: string,
	summary: InvocationTelemetrySummary,
): Promise<void> => {
	await removeSummarySiblingTmpFiles(absPath);
	const { text } = redactSecrets(`${JSON.stringify(summary, null, '\t')}\n`);
	await writeFileAtomic(absPath, text);
};

export const regenerateUsageSummary = async (
	invocationsPath: string,
	summaryPath: string,
	windowDays: number,
	now: number = Date.now(),
	limits?: ILimitsConfig | undefined,
	options: Omit<IBuildSummaryOptions, 'limits'> = {},
): Promise<InvocationTelemetrySummary> => {
	const { records, skippedRows } = await readInvocationLog(invocationsPath);
	return withFileMutex(summaryPath, async () => {
		const prior = await readSummaryFile(summaryPath);
		const summary = buildSummary(records, windowDays, now, {
			limits,
			degradations:
				options.degradations ??
				(prior?.degradations as readonly IDegradation[] | undefined) ??
				[],
		});
		const enriched = {
			...summary,
			invocationTelemetry: buildInvocationTelemetryRollup(
				records,
				windowDays,
				now,
			),
			delegation: buildDelegationRollup(records, windowDays, now),
			skippedRows,
		} satisfies InvocationTelemetrySummary;
		await writeSummaryUnlocked(summaryPath, enriched);
		return enriched;
	});
};
