#!/usr/bin/env bun
import { join } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@delendai/core/runtime';
import {
	aggregateROI,
	buildValueLookup,
	loadAllPluginManifests,
	measurementsFromSnapshot,
	validatePluginManifest,
	type IRoiMeasurement,
} from '@delendai/core/cli';

import { repoRoot } from '../lib/monorepo-paths';
import { measureSession } from '../metrics/collect-candidate.script';
import {
	classifyToolOwner,
	measureToolListMetrics,
	type IToolListEntry,
} from './token-budget-report-lib';
import type { ITokenizerConfidence } from './tokenizer-real.script';

/**
 * A report, kept in the cache: no page reads it, so committing it under the
 * site's data only left an empty sample there for readers to take as a
 * measurement.
 */
export const TOKEN_ROI_OUTPUT_PATH = '.cache/delendai/reports/token-roi.json';

/**
 * A number that depends on the model — a real token count, a price, a share
 * of a context window. It rides beside a row and never feeds the ranking:
 * removing every annotation leaves the rows and their order as they were.
 */
export interface IRoiAnnotation {
	readonly kind: 'tokens' | 'price' | 'context-share';
	readonly value: number;
	readonly confidence: ITokenizerConfidence;
	/** Where the number came from: a tokenizer profile, a price table. */
	readonly source: string;
}

export interface IRoiDashboardRow {
	readonly pluginId: string;
	readonly roi: number;
	readonly sampleSize: number;
	readonly confidence: 'low' | 'medium' | 'high';
	readonly annotations?: readonly IRoiAnnotation[];
}

/** Why a measured owner has no row. */
export type IRoiUnrankedEntry = {
	readonly pluginId: string;
	readonly reason: 'no-value-declared' | 'value-rejected' | 'not-a-plugin';
};

export interface IRoiDashboardArtifact {
	readonly top: readonly IRoiDashboardRow[];
	readonly bottom: readonly IRoiDashboardRow[];
	/** Valued plugins whose tools were served and never called successfully. */
	readonly unmeasured: readonly string[];
	/** Owners that were measured but cannot be ranked, and why. */
	readonly unranked: readonly IRoiUnrankedEntry[];
	/** The samples every row rests on, one per owner the session served. */
	readonly measurements: readonly IRoiMeasurement[];
	readonly generatedAt: string;
}

const RANK_EDGE = 5;

/**
 * Read the manifest `value` declarations for every first-party plugin.
 * The `value` field is read from the raw manifest record (the core
 * `IPluginManifest` type does not carry it — see `budgets/manifest.ts`).
 */
const loadPluginValues = async (
	root: string,
): Promise<{ pluginId: string; value: unknown }[]> => {
	const manifests = await loadAllPluginManifests(root);
	return manifests.map((rawManifest) => ({
		pluginId: validatePluginManifest(rawManifest).id,
		value: (rawManifest as { value?: unknown }).value,
	}));
};

/** The report for `measurements`, given the declared values. Pure. */
export const roiArtifactFor = (input: {
	readonly measurements: readonly IRoiMeasurement[];
	readonly values: readonly { pluginId: string; value: unknown }[];
	readonly generatedAt: string;
}): IRoiDashboardArtifact => {
	const lookup = buildValueLookup(input.values);
	const reports = aggregateROI(input.measurements, lookup);
	const rows: IRoiDashboardRow[] = reports.flatMap((report) =>
		report.measured
			? [
					{
						pluginId: report.pluginId,
						roi: report.roi,
						sampleSize: report.sampleSize,
						confidence: report.confidence,
					},
				]
			: [],
	);
	const reasons = new Map(
		lookup.unranked.map((entry) => [entry.pluginId, entry.reason]),
	);
	return {
		top: rows.slice(0, RANK_EDGE),
		bottom: rows.slice(-RANK_EDGE).reverse(),
		unmeasured: reports
			.filter((report) => !report.measured)
			.map((report) => report.pluginId),
		unranked: input.measurements
			.filter((m) => lookup.valueFor(m.pluginId) === undefined)
			.map((m) => ({
				pluginId: m.pluginId,
				reason: reasons.get(m.pluginId) ?? 'not-a-plugin',
			})),
		measurements: input.measurements,
		generatedAt: input.generatedAt,
	};
};

/**
 * What in `artifact` no sample supports: a row or an unmeasured entry for
 * an owner the session did not measure, a row whose sample size is not the
 * measured calls, and an owner with successful calls that is neither
 * ranked nor named unranked — the empty report this generator used to
 * write while the session had calls.
 */
export const unsupportedRoiClaims = (
	artifact: IRoiDashboardArtifact,
): readonly string[] => {
	const sampled = new Map(
		artifact.measurements.map((m) => [m.pluginId, m] as const),
	);
	const rows = [...artifact.top, ...artifact.bottom];
	const problems = [
		...rows.flatMap((row) => {
			const sample = sampled.get(row.pluginId);
			if (sample === undefined)
				return [`${row.pluginId}: a row with no measurement behind it`];
			return sample.successfulCalls === row.sampleSize
				? []
				: [
						`${row.pluginId}: sample size ${row.sampleSize}, but ${sample.successfulCalls} calls were measured`,
					];
		}),
		...artifact.unmeasured
			.filter((pluginId) => !sampled.has(pluginId))
			.map((pluginId) => `${pluginId}: unmeasured, and never served`),
	];
	const accounted = new Set([
		...rows.map((row) => row.pluginId),
		...artifact.unranked.map((entry) => entry.pluginId),
	]);
	const dropped = artifact.measurements.filter(
		(m) => m.successfulCalls > 0 && !accounted.has(m.pluginId),
	);
	return [
		...problems,
		...dropped.map(
			(m) =>
				`${m.pluginId}: ${m.successfulCalls} successful calls measured, but neither ranked nor named unranked`,
		),
	];
};

/** `artifact` with `annotate`'s numbers beside each row; the rows stay as they were. */
export const withAnnotations = (
	artifact: IRoiDashboardArtifact,
	annotate: (row: IRoiDashboardRow) => readonly IRoiAnnotation[],
): IRoiDashboardArtifact => {
	const annotated = (rows: readonly IRoiDashboardRow[]) =>
		rows.map((row) => {
			const annotations = annotate(row);
			return annotations.length === 0 ? row : { ...row, annotations };
		});
	return {
		...artifact,
		top: annotated(artifact.top),
		bottom: annotated(artifact.bottom),
	};
};

/** `artifact` with every annotation removed. */
export const withoutAnnotations = (
	artifact: IRoiDashboardArtifact,
): IRoiDashboardArtifact => {
	const bare = (rows: readonly IRoiDashboardRow[]) =>
		rows.map(({ annotations: _annotations, ...row }) => row);
	return {
		...artifact,
		top: bare(artifact.top),
		bottom: bare(artifact.bottom),
	};
};

/**
 * The measurements of one real session. It reuses the metrics gate's boot
 * path (`measureSession`: the swarm preset, `--surface=native`, `REPEATS`
 * calls of the tracked read-only tools) instead of a second route, so the
 * report and the gate measure the same thing and cannot disagree about it.
 */
const measureRoiSession = async (
	pluginIds: readonly string[],
): Promise<readonly IRoiMeasurement[]> => {
	const session = await measureSession();
	const listing = measureToolListMetrics(
		session.tools as readonly IToolListEntry[],
		pluginIds,
	);
	const tools = session.snapshot.tools;
	return measurementsFromSnapshot({
		tools:
			typeof tools === 'object' && tools !== null
				? (tools as Parameters<
						typeof measurementsFromSnapshot
					>[0]['tools'])
				: {},
		schemaBytesByOwner: new Map(
			listing.ownerRows.map((row) => [row.owner, row.toolsListBytes]),
		),
		ownerOf: (tool) => classifyToolOwner(tool, pluginIds),
	});
};

const formatRoi = (roi: number): string => roi.toFixed(4);

export const renderRoiMarkdown = (artifact: IRoiDashboardArtifact): string => {
	const table = (rows: readonly IRoiDashboardRow[]) => [
		'| Plugin | ROI | Sample | Confidence |',
		'| --- | --- | --- | --- |',
		...rows.map(
			(row) =>
				`| ${row.pluginId} | ${formatRoi(row.roi)} | ${row.sampleSize} | ${row.confidence} |`,
		),
	];
	return [
		'## Token ROI per plugin',
		'',
		'`tokenROI = (successful_calls × value) / (schema_bytes + response_tokens)`.',
		'',
		'### Top 5',
		'',
		...table(artifact.top),
		'',
		'### Bottom 5',
		'',
		...table(artifact.bottom),
		'',
		`Unmeasured (served, never called): ${artifact.unmeasured.join(', ') || 'none'}.`,
		`Unranked: ${artifact.unranked.map((entry) => `${entry.pluginId} (${entry.reason})`).join(', ') || 'none'}.`,
		'',
	].join('\n');
};

export const generateTokenRoiDashboard = async (): Promise<{
	readonly artifact: IRoiDashboardArtifact;
	readonly outputPath: string;
}> => {
	const root = repoRoot();
	const outputPath = join(root, TOKEN_ROI_OUTPUT_PATH);
	const values = await loadPluginValues(root);
	const artifact = roiArtifactFor({
		measurements: await measureRoiSession(values.map((v) => v.pluginId)),
		values,
		generatedAt: new Date().toISOString(),
	});
	const unsupported = unsupportedRoiClaims(artifact);
	if (unsupported.length > 0)
		throw new Error(
			`the report claims what the session did not measure:\n  ${unsupported.join('\n  ')}`,
		);
	await withFileMutex(outputPath, async () => {
		await writeFileAtomic(
			outputPath,
			`${JSON.stringify(artifact, null, '\t')}\n`,
		);
	});
	return { artifact, outputPath };
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	const exitCode = await generateTokenRoiDashboard()
		.then((result) => {
			console.log(renderRoiMarkdown(result.artifact));
			console.log(`wrote ${result.outputPath}`);
			return 0;
		})
		.catch((error: unknown) => {
			console.error(
				`token-roi failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return 1;
		});
	process.exit(exitCode);
}
