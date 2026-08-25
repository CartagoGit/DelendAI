#!/usr/bin/env bun
import { readFile, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';

import { withFileMutex, writeFileAtomic } from '@mcp-vertex/core/public';

import { runFromManifestsGenerator } from '../generate/from-manifests.script.ts';
import { generateTokenBudgetDashboard } from '../report/token-budget-dashboard.script.ts';

const DASHBOARD_RELATIVE_PATH = 'docs/mcp-vertex/TOKEN-BUDGETS.md';

const restoreDashboard = async (
	outputPath: string,
	previous: string | null,
): Promise<void> => {
	if (previous === null) {
		await rm(outputPath, { force: true }).catch(() => undefined);
		return;
	}
	await withFileMutex(outputPath, async () => {
		await writeFileAtomic(outputPath, previous);
	});
};

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
		const generatedDashboard = await generateTokenBudgetDashboard();
		if (generatedDashboard.markdown !== previousDashboard) {
			failures.push(
				`TOKEN_DASHBOARD: drift detected. Run bun tools/scripts/report/token-budget-dashboard.script.ts and commit ${DASHBOARD_RELATIVE_PATH}.`,
			);
			await restoreDashboard(
				generatedDashboard.outputPath,
				previousDashboard,
			);
		}
	} catch (error: unknown) {
		failures.push(
			`TOKEN_DASHBOARD: generation failed. ${error instanceof Error ? error.message : String(error)}`,
		);
		await restoreDashboard(dashboardPath, previousDashboard);
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
