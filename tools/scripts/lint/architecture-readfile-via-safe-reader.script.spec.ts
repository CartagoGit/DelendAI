import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	formatReadFileViaSafeReaderReport,
	scanReadFileViaSafeReader,
} from './architecture-readfile-via-safe-reader.script.ts';

const writePlugin = async (
	root: string,
	pluginId: string,
	permissions: readonly string[],
	files: Readonly<Record<string, string>>,
): Promise<void> => {
	const pluginRoot = join(root, 'plugins', pluginId);
	await mkdir(join(pluginRoot, 'src/lib'), { recursive: true });
	await writeFile(
		join(pluginRoot, 'plugin.manifest.ts'),
		[
			'import { definePluginManifest, TOKEN_BUDGETS } from "@delendai/core/public";',
			'',
			'export default definePluginManifest({',
			`	id: '${pluginId}',`,
			`	package: '@delendai/${pluginId}',`,
			"\tversion: '0.1.0',",
			"\tvisibility: 'public',",
			"\tsummary: 'fixture plugin for lint testing',",
			"\ttags: ['fixture'],",
			"\tmaturity: 'experimental',",
			`\tpermissions: [${permissions.map((value) => `'${value}'`).join(', ')}],`,
			"\tpresets: ['dogfood'],",
			'\ttokenBudget: TOKEN_BUDGETS.toolPayloads.search,',
			"\tdependencies: ['@delendai/core'],",
			"\tcapabilities: ['fixture'],",
			'});',
		].join('\n'),
		'utf8',
	);
	for (const [rel, content] of Object.entries(files)) {
		const abs = join(pluginRoot, rel);
		await mkdir(join(abs, '..'), { recursive: true });
		await writeFile(abs, content, 'utf8');
	}
};

const withFixture = async (
	callback: (root: string) => Promise<void>,
): Promise<void> => {
	const trimmed = await mkdtemp(join(tmpdir(), 'lint-safe-reader-'));
	try {
		await callback(trimmed);
	} finally {
		await rm(trimmed, { recursive: true, force: true });
	}
};

describe('architecture-readfile-via-safe-reader lint', () => {
	it('flags direct readFile imports in a filesystem-read plugin', async () => {
		await withFixture(async (root) => {
			await writePlugin(root, 'demo', ['filesystem-read'], {
				'src/lib/demo.ts': [
					'import { readFile } from "node:fs/promises";',
					'export const run = async () => await readFile("x", "utf8");',
				].join('\n'),
			});
			const findings = await scanReadFileViaSafeReader(root);
			expect(
				findings.some((finding) => finding.rule === 'READFILE_IMPORT'),
			).toBe(true);
			expect(
				findings.some((finding) => finding.rule === 'READFILE_CALL'),
			).toBe(true);
		});
	});

	it('flags namespace-style fs.readFile calls in a filesystem-read plugin', async () => {
		await withFixture(async (root) => {
			await writePlugin(root, 'demo', ['filesystem-read'], {
				'src/lib/demo.ts': [
					'import * as fs from "node:fs/promises";',
					'export const run = async () => await fs.readFile("x", "utf8");',
				].join('\n'),
			});
			const findings = await scanReadFileViaSafeReader(root);
			expect(
				findings.some((finding) => finding.rule === 'READFILE_CALL'),
			).toBe(true);
		});
	});

	it('passes when the plugin uses SafeWorkspaceReader instead', async () => {
		await withFixture(async (root) => {
			await writePlugin(root, 'demo', ['filesystem-read'], {
				'src/lib/demo.ts': [
					'import { SafeWorkspaceReader } from "@delendai/core/public";',
					'export const run = async (root: string) => await new SafeWorkspaceReader(root).readText("src/index.ts");',
				].join('\n'),
			});
			const findings = await scanReadFileViaSafeReader(root);
			expect(findings).toHaveLength(0);
		});
	});

	it('ignores plugins without filesystem-read permission', async () => {
		await withFixture(async (root) => {
			await writePlugin(root, 'demo', ['process'], {
				'src/lib/demo.ts': [
					'import { readFile } from "node:fs/promises";',
					'export const run = async () => await readFile("x", "utf8");',
				].join('\n'),
			});
			const findings = await scanReadFileViaSafeReader(root);
			expect(findings).toHaveLength(0);
		});
	});

	it('ignores safe-reader implementation files by filename', async () => {
		await withFixture(async (root) => {
			await writePlugin(root, 'demo', ['filesystem-read'], {
				'src/lib/safe-reader.ts': [
					'import { readFile } from "node:fs/promises";',
					'export const run = async () => await readFile("x", "utf8");',
				].join('\n'),
			});
			const findings = await scanReadFileViaSafeReader(root);
			expect(findings).toHaveLength(0);
		});
	});

	it('formats an actionable report', async () => {
		const report = formatReadFileViaSafeReaderReport([
			{
				pluginId: 'demo',
				relPath: 'plugins/demo/src/lib/demo.ts',
				line: 4,
				rule: 'READFILE_IMPORT',
				detail: 'Use SafeWorkspaceReader.',
			},
		]);
		expect(report).toContain('1 violation');
		expect(report).toContain('plugins/demo/src/lib/demo.ts:4');
		expect(report).toContain('SafeWorkspaceReader');
	});
});
