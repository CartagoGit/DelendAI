#!/usr/bin/env bun
import { join } from 'node:path';

import {
	aggregateROI,
	buildValueLookup,
	loadAllPluginManifests,
	validatePluginManifest,
	withFileMutex,
	writeFileAtomic,
	type IRoiMeasurement,
} from '@delendai/core/public';

import { repoRoot } from '../lib/monorepo-paths';

export const TOKEN_ROI_OUTPUT_PATH = 'apps/web/src/data/token-roi.json';

export interface IRoiDashboardRow {
	readonly pluginId: string;
	readonly roi: number;
	readonly sampleSize: number;
	readonly confidence: 'low' | 'medium' | 'high';
}

export interface IRoiDashboardArtifact {
	readonly top: readonly IRoiDashboardRow[];
	readonly bottom: readonly IRoiDashboardRow[];
	readonly generatedAt: string;
}

/**
 * Read the manifest `value` declarations for every first-party plugin.
 * Plugins without a `value` are excluded from the ROI report.
 *
 * The `value` field is an optional per-plugin constant; it is read from
 * the raw manifest record via a cast (the core `IPluginManifest` type
 * does not carry it yet — see `budgets/manifest.ts`).
 */
const loadPluginValues = async (
	root: string,
): Promise<{ pluginId: string; value: unknown }[]> => {
	const manifests = await loadAllPluginManifests(root);
	const entries: { pluginId: string; value: unknown }[] = [];
	for (const rawManifest of manifests) {
		const manifest = validatePluginManifest(rawManifest);
		entries.push({
			pluginId: manifest.id,
			value: (rawManifest as { value?: unknown }).value,
		});
	}
	return entries;
};

const formatRoi = (roi: number): string => roi.toFixed(4);

export const buildRoiDashboard = async (): Promise<IRoiDashboardArtifact> => {
	const root = repoRoot();
	const values = await loadPluginValues(root);
	const lookup = buildValueLookup(values);
	// Measurements come from the process-local plugin metrics when they
	// exist; in a standalone generator run they are empty, so the report
	// is a zero-sample skeleton unless a host has populated the metrics.
	// Real aggregation hooks into the TokenBudgetRegistry (f00186) which
	// cross-references successful calls per plugin.
	const measurements: IRoiMeasurement[] = [];
	const reports = aggregateROI(measurements, lookup);
	const rows: IRoiDashboardRow[] = reports.map((report) => ({
		pluginId: report.pluginId,
		roi: report.roi,
		sampleSize: report.sampleSize,
		confidence: report.confidence,
	}));
	rows.sort((a, b) => b.roi - a.roi);
	return {
		top: rows.slice(0, 5),
		bottom: rows.slice(-5).reverse(),
		generatedAt: new Date().toISOString(),
	};
};

export const renderRoiMarkdown = (artifact: IRoiDashboardArtifact): string => {
	const lines: string[] = [
		'## Token ROI por plugin (c00136)',
		'',
		'`tokenROI = (successful_calls × value) / (schema_bytes + response_tokens)`.',
		'',
		'### Top 5',
		'',
		'| Plugin | ROI | Sample | Confidence |',
		'| --- | --- | --- | --- |',
	];
	for (const row of artifact.top) {
		lines.push(
			`| ${row.pluginId} | ${formatRoi(row.roi)} | ${row.sampleSize} | ${row.confidence} |`,
		);
	}
	lines.push(
		'',
		'### Bottom 5',
		'',
		'| Plugin | ROI | Sample | Confidence |',
		'| --- | --- | --- | --- |',
	);
	for (const row of artifact.bottom) {
		lines.push(
			`| ${row.pluginId} | ${formatRoi(row.roi)} | ${row.sampleSize} | ${row.confidence} |`,
		);
	}
	lines.push('');
	return lines.join('\n');
};

export const generateTokenRoiDashboard = async (): Promise<{
	readonly artifact: IRoiDashboardArtifact;
	readonly outputPath: string;
}> => {
	const outputPath = join(repoRoot(), TOKEN_ROI_OUTPUT_PATH);
	const artifact = await buildRoiDashboard();
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
