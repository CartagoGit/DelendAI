#!/usr/bin/env bun
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { runFromManifestsGenerator } from '../generate/from-manifests.script.ts';
import {
	buildPresetMetadataSource,
	GENERATED_PRESET_METADATA_PATH,
} from '../generate/preset-metadata.script.ts';
import { buildTokenBudgetDashboardMarkdown } from '../report/token-budget-dashboard.script.ts';

const DASHBOARD_RELATIVE_PATH = 'docs/mcp-vertex/TOKEN-BUDGETS.md';

const normalizeDashboard = (text: string | null): string | null =>
	text === null
		? null
		: text
				.replace(/^Generated at: .*$/gmu, 'Generated at: <normalized>')
				.replace(
					/^\| logs_tail \| .*$/gmu,
					'| logs_tail | <normalized> |',
				);

// r00024 (PRESET-001): `measuredAt` is a fresh ISO timestamp every run by
// design — normalize it away before comparing, same pattern as the token
// dashboard's "Generated at:" line above. A REAL drift (a changed
// toolCount/schemaBytes/estimatedTokens) still fails the check.
const normalizePresetMetadata = (text: string | null): string | null =>
	text === null
		? null
		: text.replace(/measuredAt: '.*?'/gu, "measuredAt: '<normalized>'");

const main = async (): Promise<number> => {
	const workspaceRoot = process.cwd();
	const failures: string[] = [];

	const manifests = await runFromManifestsGenerator([
		'--check',
		`--root=${workspaceRoot}`,
	]);
	if (manifests.exitCode !== 0) {
		failures.push(
			'MANIFESTS: drift detected. Run bun tools/scripts/generate/from-manifests.script.ts and commit the generated outputs.',
		);
	}

	const dashboardPath = resolve(workspaceRoot, DASHBOARD_RELATIVE_PATH);
	const previousDashboard = await readFile(dashboardPath, 'utf8').catch(
		(error: unknown) => {
			if (
				error &&
				typeof error === 'object' &&
				'code' in error &&
				error.code === 'ENOENT'
			) {
				return null;
			}
			throw error;
		},
	);

	try {
		const generatedDashboard = await buildTokenBudgetDashboardMarkdown();
		if (
			normalizeDashboard(generatedDashboard) !==
			normalizeDashboard(previousDashboard)
		) {
			failures.push(
				`TOKEN_DASHBOARD: drift detected. Run bun tools/scripts/report/token-budget-dashboard.script.ts and commit ${DASHBOARD_RELATIVE_PATH}.`,
			);
		}
	} catch (error: unknown) {
		failures.push(
			`TOKEN_DASHBOARD: generation failed. ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	const presetMetadataPath = resolve(
		workspaceRoot,
		GENERATED_PRESET_METADATA_PATH,
	);
	const previousPresetMetadata = await readFile(
		presetMetadataPath,
		'utf8',
	).catch((error: unknown) => {
		if (
			error &&
			typeof error === 'object' &&
			'code' in error &&
			error.code === 'ENOENT'
		) {
			return null;
		}
		throw error;
	});
	try {
		const generatedPresetMetadata = await buildPresetMetadataSource();
		if (
			normalizePresetMetadata(generatedPresetMetadata) !==
			normalizePresetMetadata(previousPresetMetadata)
		) {
			failures.push(
				`PRESET_METADATA: drift detected. Run bun tools/scripts/generate/preset-metadata.script.ts and commit ${GENERATED_PRESET_METADATA_PATH}.`,
			);
		}
	} catch (error: unknown) {
		failures.push(
			`PRESET_METADATA: generation failed. ${error instanceof Error ? error.message : String(error)}`,
		);
	}

	if (failures.length > 0) {
		console.error('Generated artifacts drift:');
		for (const failure of failures) {
			console.error(`- ${failure}`);
		}
		return 1;
	}

	console.log('All generated artifacts are in sync.');
	return 0;
};

process.exit(await main());
