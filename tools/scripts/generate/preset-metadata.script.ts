#!/usr/bin/env bun
/**
 * preset-metadata.script.ts — r00024 (PRESET-001).
 *
 * Generates `packages/core/src/lib/contracts/constants/preset-metadata.generated.ts`
 * from a REAL runtime measurement — the exact same one the token dashboard
 * uses (`measurePresetDashboard`, native surface): connect an in-memory MCP
 * client per preset, measure its real `tools/list` payload, derive an
 * estimated-token figure with the same heuristic estimator the tokenizer
 * report uses. No manually-kept tool counts, no second measurement path
 * that could silently diverge from the dashboard's numbers.
 *
 * `role` (what a preset is *for*) is NOT here — it is human policy, not a
 * measurement; see `preset-roles.constant.ts`.
 *
 * Usage:
 *   bun tools/scripts/generate/preset-metadata.script.ts            # generate + write
 *   bun tools/scripts/generate/preset-metadata.script.ts --check     # exit 1 on drift
 */
import { join } from 'node:path';
import { readFile } from 'node:fs/promises';

import {
	PRESET_KIND,
	withFileMutex,
	writeFileAtomic,
} from '@mcp-vertex/core/public';

import { repoRoot } from '../lib/monorepo-paths';
import {
	DASHBOARD_SURFACES,
	measurePresetDashboard,
} from '../report/token-budget-dashboard.script.ts';
import {
	createTokenBudgetFixtureWorkspace,
	destroyTokenBudgetFixtureWorkspace,
} from '../report/token-budget-report-lib';
import { estimateTokensFromBytes } from '../report/tokenizer-real.script.ts';

export const GENERATED_PRESET_METADATA_PATH =
	'packages/core/src/lib/contracts/constants/preset-metadata.generated.ts';

/** The estimator id `estimateTokensFromBytes` implements — kept as a
 * literal string (not derived) so a reader of the generated file knows
 * exactly what produced `estimatedTokens` without chasing an import. */
const ESTIMATOR_ID = 'heuristic-4-bytes-per-token';

const NATIVE_SURFACE = DASHBOARD_SURFACES[0];

export const PRESET_METADATA_IDS = [...PRESET_KIND] as const;

export interface IGeneratedPresetEntry {
	readonly presetId: (typeof PRESET_METADATA_IDS)[number];
	readonly measurementSurface: 'native' | 'adaptive';
	readonly measuredAt: string;
	readonly toolCount: number;
	readonly schemaBytes: number;
	readonly estimatedTokens: number;
}

export const orderPresetMetadataEntries = (
	entries: readonly IGeneratedPresetEntry[],
): readonly IGeneratedPresetEntry[] => {
	const byId = new Map<
		IGeneratedPresetEntry['presetId'],
		IGeneratedPresetEntry
	>();
	for (const entry of entries) {
		if (!PRESET_METADATA_IDS.includes(entry.presetId)) {
			throw new Error(
				`preset-metadata: unknown preset id "${entry.presetId}" in generated entries`,
			);
		}
		if (byId.has(entry.presetId)) {
			throw new Error(
				`preset-metadata: duplicate preset id "${entry.presetId}" in generated entries`,
			);
		}
		byId.set(entry.presetId, entry);
	}

	const missing = PRESET_METADATA_IDS.filter(
		(presetId) => !byId.has(presetId),
	);
	if (missing.length > 0) {
		throw new Error(
			`preset-metadata: missing generated entries for ${missing.join(', ')}`,
		);
	}

	return PRESET_METADATA_IDS.map((presetId) => byId.get(presetId)!);
};

const measureAllPresets = async (
	measuredAt = new Date().toISOString(),
): Promise<readonly IGeneratedPresetEntry[]> => {
	const workspace = createTokenBudgetFixtureWorkspace();
	try {
		const entries: IGeneratedPresetEntry[] = [];
		for (const presetId of PRESET_METADATA_IDS) {
			const row = await measurePresetDashboard(
				workspace,
				presetId,
				NATIVE_SURFACE,
			);
			entries.push({
				presetId,
				measurementSurface: row.surfaceMode,
				measuredAt,
				toolCount: row.toolCount,
				schemaBytes: row.schemaBytes,
				estimatedTokens: estimateTokensFromBytes(row.schemaBytes),
			});
		}
		return entries;
	} finally {
		destroyTokenBudgetFixtureWorkspace(workspace);
	}
};

/**
 * Single-quoted string literal — matches this repo's Biome style
 * exactly (a `JSON.stringify`-produced double-quoted literal gets
 * silently rewritten to single quotes by the pre-commit format hook,
 * which means the generator's raw output would never byte-match the
 * committed file and `check:generated` would report permanent false
 * drift — reproduced once via a clean clone before this fix). None of
 * these values can contain a `'` (an ISO timestamp, a fixed estimator
 * id, or a preset id), so a plain wrap is safe.
 */
const sq = (value: string): string => `'${value}'`;

const renderEntry = (entry: IGeneratedPresetEntry): string =>
	[
		`\t${/^[a-z][a-zA-Z0-9]*$/.test(entry.presetId) ? entry.presetId : sq(entry.presetId)}: {`,
		`\t\tmeasurementSurface: ${sq(entry.measurementSurface)},`,
		"\t\truntimeSurface: 'managed',",
		`\t\tsource: 'generated-runtime-measurement',`,
		`\t\tmeasuredAt: ${sq(entry.measuredAt)},`,
		`\t\testimator: ${sq(ESTIMATOR_ID)},`,
		`\t\tbytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,`,
		`\t\tbudgetBaseline: {`,
		`\t\t\ttoolCount: ${entry.toolCount},`,
		`\t\t\tschemaBytes: ${entry.schemaBytes},`,
		`\t\t\tcoldStartTokens: ${entry.estimatedTokens},`,
		`\t\t},`,
		`\t},`,
	].join('\n');

/** Compare generated content without treating a measurement timestamp as
 * drift. The timestamp is provenance, not a metric, and must not force a
 * commit when the measured payload is unchanged. */
export const normalizeMeasuredAt = (text: string): string =>
	text.replace(/measuredAt: '.*?'/gu, "measuredAt: '<normalized>'");

export const buildPresetMetadataSource = async (
	input: {
		readonly measuredAt?: string;
		readonly entries?: readonly IGeneratedPresetEntry[];
	} = {},
): Promise<string> => {
	const entries = orderPresetMetadataEntries(
		input.entries ?? (await measureAllPresets(input.measuredAt)),
	);
	return [
		'/**',
		' * preset-metadata.generated.ts — GENERATED, do not edit by hand.',
		' *',
		` * Regenerate: bun tools/scripts/generate/preset-metadata.script.ts`,
		' * (r00024 / PRESET-001). `check:generated` fails the build if this',
		' * file drifts from a fresh measurement — the same measurement',
		' * `tools/scripts/report/token-budget-dashboard.script.ts` uses',
		' * (`measurePresetDashboard`, native surface). `measurementSurface` is',
		' * deliberately separate from the managed runtime default: these values',
		' * are the comparable full-surface budget baseline. `runtimeSurface`',
		' * records the normal host surface and is not a runtime cache directive.',
		' */',
		"import { TOKEN_BUDGETS } from './token-budgets.constant';",
		"import type { IPresetMetadataEntry } from '../interfaces/preset-budget-profile.interface';",
		'',
		'export const PRESET_METADATA = {',
		entries.map(renderEntry).join('\n'),
		'} satisfies Record<string, IPresetMetadataEntry>;',
		'',
	].join('\n');
};

export const generatePresetMetadata = async (): Promise<{
	readonly source: string;
	readonly outputPath: string;
}> => {
	const outputPath = join(repoRoot(), GENERATED_PRESET_METADATA_PATH);
	const existing = await readFile(outputPath, 'utf8').catch(() => null);
	const measuredAt = existing?.match(/measuredAt: '(.*?)'/u)?.[1];
	const freshSource = await buildPresetMetadataSource();
	// A timestamp records when the metrics last changed; it is not itself a
	// reason to dirty the generated artifact. Preserve it when the measured
	// values are unchanged, so repeated generation is idempotent.
	const source =
		existing !== null &&
		measuredAt !== undefined &&
		normalizeMeasuredAt(existing) === normalizeMeasuredAt(freshSource)
			? freshSource.replace(
					/measuredAt: '.*?'/gu,
					`measuredAt: '${measuredAt}'`,
				)
			: freshSource;
	await withFileMutex(outputPath, async () => {
		await writeFileAtomic(outputPath, source);
	});
	return { source, outputPath };
};

const isMainModule = (): boolean => {
	const entry = process.argv[1];
	return entry !== undefined && import.meta.url === `file://${entry}`;
};

if (isMainModule()) {
	const checkOnly = process.argv.includes('--check');
	if (checkOnly) {
		const { readFile } = await import('node:fs/promises');
		const outputPath = join(repoRoot(), GENERATED_PRESET_METADATA_PATH);
		const [generated, existing] = await Promise.all([
			buildPresetMetadataSource(),
			readFile(outputPath, 'utf8').catch(() => null),
		]);
		if (
			existing === null ||
			normalizeMeasuredAt(generated) !== normalizeMeasuredAt(existing)
		) {
			console.error(
				`preset-metadata: drift detected. Run bun tools/scripts/generate/preset-metadata.script.ts and commit ${GENERATED_PRESET_METADATA_PATH}.`,
			);
			process.exit(1);
		}
		console.log('preset-metadata: up to date.');
		process.exit(0);
	}
	const exitCode = await generatePresetMetadata()
		.then((result) => {
			console.log(`wrote ${result.outputPath}`);
			return 0;
		})
		.catch((error: unknown) => {
			console.error(
				`preset-metadata generation failed: ${error instanceof Error ? error.message : String(error)}`,
			);
			return 1;
		});
	process.exit(exitCode);
}
