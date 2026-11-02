#!/usr/bin/env bun
import { join } from 'node:path';

import {
	buildTokenBudgetDashboardMarkdown,
	TOKEN_BUDGET_DASHBOARD_PATH,
} from '../report/token-budget-dashboard.script';
import { repoRoot } from '../lib/monorepo-paths';

const normalizeDashboard = (text: string): string =>
	text
		.replace(/^Generated at: .*$/gmu, 'Generated at: <normalized>')
		.replace(/^\| logs_tail \| .*$/gmu, '| logs_tail | <normalized> |');

const firstDiffLine = (left: string, right: string): number | null => {
	const leftLines = left.split('\n');
	const rightLines = right.split('\n');
	const lineCount = Math.max(leftLines.length, rightLines.length);
	for (let index = 0; index < lineCount; index += 1) {
		if (leftLines[index] !== rightLines[index]) {
			return index + 1;
		}
	}
	return null;
};

const main = async (): Promise<number> => {
	const dashboardPath = join(repoRoot(), ...TOKEN_BUDGET_DASHBOARD_PATH);
	const tracked = normalizeDashboard(await Bun.file(dashboardPath).text());
	const generated = normalizeDashboard(
		await buildTokenBudgetDashboardMarkdown(),
	);
	if (tracked === generated) {
		console.log(`[token-dashboard-check] in sync: ${dashboardPath}`);
		return 0;
	}
	const diffLine = firstDiffLine(tracked, generated);
	console.error('[token-dashboard-check] Dashboard is out of sync.');
	if (diffLine !== null) {
		console.error(`First differing line: ${diffLine}`);
	}
	console.error(
		'Regenerate with bun tools/scripts/report/token-budget-dashboard.script.ts and commit the updated dashboard.',
	);
	return 1;
};

const exitCode = await main().catch((error: unknown) => {
	console.error(
		`run-token-dashboard-check failed: ${error instanceof Error ? error.message : String(error)}`,
	);
	return 1;
});

process.exit(exitCode);
