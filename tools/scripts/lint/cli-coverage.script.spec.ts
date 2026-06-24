import { mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	detectCliCoverage,
	extractRegisteredCommands,
	formatReport,
} from './cli-coverage.script';

describe('cli-coverage.script', async () => {
	it('extracts registered command names from the CLI registry', async () => {
		const commands = extractRegisteredCommands(`
			const listCommand = { name: 'plugin list' };
			export const registerAllCommands = () => [
				{ name: 'status' },
				{ name: "config doctor" },
			];
		`);
		expect(commands).toEqual(['config doctor', 'plugin list', 'status']);
	});

	it('passes when every registered command is named by tests', async () => {
		const root = await makeTmpTree({
			'registry.ts': `
				export const registerAllCommands = () => [
					{ name: 'status' },
					{ name: 'plugin list' },
				];
			`,
			'tests/commands.spec.ts': `
				import { it } from 'vitest';
				it('covers status', () => undefined);
				it('covers plugin list', () => undefined);
				it('keeps enough command tests', () => undefined);
				const covered = ['status', 'plugin list'];
			`,
		});
		try {
			const report = await detectCliCoverage(
				join(root, 'registry.ts'),
				join(root, 'tests'),
			);
			expect(report.findings).toEqual([]);
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});

	it('reports missing command coverage with actionable output', async () => {
		const root = await makeTmpTree({
			'registry.ts': `
				export const registerAllCommands = () => [
					{ name: 'status' },
					{ name: 'metrics' },
				];
			`,
			'tests/commands.spec.ts': `
				import { it } from 'vitest';
				it('covers status', () => undefined);
				it('has another test', () => undefined);
				it('has a third test', () => undefined);
				const covered = ['status'];
			`,
		});
		try {
			const report = await detectCliCoverage(
				join(root, 'registry.ts'),
				join(root, 'tests'),
			);
			expect(report.findings).toHaveLength(1);
			expect(formatReport(report)).toContain('metrics');
		} finally {
			await rm(root, { recursive: true, force: true });
		}
	});
});

const makeTmpTree = async (
	files: Readonly<Record<string, string>>,
): Promise<string> => {
	const root = join(
		tmpdir(),
		`cli-coverage-${Date.now()}-${Math.random().toString(36).slice(2)}`,
	);
	await mkdir(root, { recursive: true });
	for (const [rel, content] of Object.entries(files)) {
		const path = join(root, rel);
		await mkdir(join(path, '..'), { recursive: true });
		await writeFile(path, content, 'utf8');
	}
	return root;
};
