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

import {
	TOKEN_BUDGETS,
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

interface IGeneratedPresetEntry {
	readonly presetId: string;
	readonly surfaceMode: 'native' | 'adaptive';
	readonly measuredAt: string;
	readonly toolCount: number;
	readonly schemaBytes: number;
	readonly estimatedTokens: number;
}

const measureAllPresets = async (): Promise<
	readonly IGeneratedPresetEntry[]
> => {
	const workspace = createTokenBudgetFixtureWorkspace();
	const measuredAt = new Date().toISOString();
	try {
		const entries: IGeneratedPresetEntry[] = [];
		for (const presetId of TOKEN_BUDGETS.dashboardPresetIds) {
			const row = await measurePresetDashboard(
				workspace,
				presetId,
				NATIVE_SURFACE,
			);
			entries.push({
				presetId,
				surfaceMode: row.surfaceMode,
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

const renderEntry = (entry: IGeneratedPresetEntry): string =>
	[
		`\t${/^[a-z][a-zA-Z0-9]*$/.test(entry.presetId) ? entry.presetId : JSON.stringify(entry.presetId)}: {`,
		`\t\tsurfaceMode: ${JSON.stringify(entry.surfaceMode)},`,
		`\t\tsource: 'generated-runtime-measurement',`,
		`\t\tmeasuredAt: ${JSON.stringify(entry.measuredAt)},`,
		`\t\testimator: ${JSON.stringify(ESTIMATOR_ID)},`,
		`\t\tbytesPerEstimatedToken: TOKEN_BUDGETS.bytesPerEstimatedToken,`,
		`\t\tbudgetBaseline: {`,
		`\t\t\ttoolCount: ${entry.toolCount},`,
		`\t\t\tschemaBytes: ${entry.schemaBytes},`,
		`\t\t\tcoldStartTokens: ${entry.estimatedTokens},`,
		`\t\t},`,
		`\t},`,
	].join('\n');

export const buildPresetMetadataSource = async (): Promise<string> => {
	const entries = await measureAllPresets();
	return [
		'/**',
		' * preset-metadata.generated.ts — GENERATED, do not edit by hand.',
		' *',
		` * Regenerate: bun tools/scripts/generate/preset-metadata.script.ts`,
		' * (r00024 / PRESET-001). `check:generated` fails the build if this',
		' * file drifts from a fresh measurement — the same measurement',
		' * `tools/scripts/report/token-budget-dashboard.script.ts` uses',
		' * (`measurePresetDashboard`, native surface).',
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
	const source = await buildPresetMetadataSource();
	const outputPath = join(repoRoot(), GENERATED_PRESET_METADATA_PATH);
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
		if (generated !== existing) {
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
