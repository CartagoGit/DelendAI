import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	buildGraph,
	computeAffected,
	main,
	resolveVitestProjectName,
	type IAffectedResult,
	writeAffectedArtifacts,
} from './affected.script';

const here = dirname(fileURLToPath(import.meta.url));
const workspaceRoot = resolve(here, '../../..');

describe('affected.script vitest project resolution', () => {
	it('uses the explicit Vitest project name when the config declares one', () => {
		const tmpDir = `/tmp/affected-vitest-resolve-${Date.now()}`;
		mkdirSync(tmpDir, { recursive: true });
		try {
			writeFileSync(
				`${tmpDir}/vitest.config.ts`,
				[
					'export default {',
					'  test: {',
					"    name: 'short-name',",
					'  },',
					'};',
				].join('\n'),
			);

			expect(
				resolveVitestProjectName(tmpDir, '@mcp-vertex/example'),
			).toBe('short-name');
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('falls back to the package name when no Vitest project name exists', () => {
		const tmpDir = `/tmp/affected-vitest-fallback-${Date.now()}`;
		mkdirSync(tmpDir, { recursive: true });
		try {
			writeFileSync(
				`${tmpDir}/vitest.config.ts`,
				[
					'export default {',
					'  test: {',
					"    include: ['tests/**/*.spec.ts'],",
					'  },',
					'};',
				].join('\n'),
			);

			expect(
				resolveVitestProjectName(tmpDir, '@mcp-vertex/example'),
			).toBe('@mcp-vertex/example');
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});

	it('computes a Vitest project set distinct from package names on the live workspace graph', () => {
		const graph = buildGraph(workspaceRoot);
		const result = computeAffected(['plugins/git/src/index.ts'], graph);

		expect(result.affected).toContain('@mcp-vertex/git');
		expect(result.vitestProjects).toContain('git');
		expect(result.vitestProjects).not.toContain('@mcp-vertex/git');
	});
});

describe('affected.script artifact writing', () => {
	it('preserves the package-name set and emits a second Vitest-project set', () => {
		const tmpDir = `/tmp/affected-vitest-write-${Date.now()}`;
		mkdirSync(tmpDir, { recursive: true });
		try {
			const result: IAffectedResult = {
				mode: 'diff',
				base: 'base',
				head: 'head',
				rootFiles: [],
				directByWorkspace: new Map(),
				affected: ['@mcp-vertex/git', '@mcp-vertex/core'],
				vitestProjects: ['git', 'core'],
				upstream: [],
				downstream: [],
			};

			writeAffectedArtifacts(result, {
				outputPath: `${tmpDir}/affected.json`,
				setPath: `${tmpDir}/.affected-set`,
				vitestSetPath: `${tmpDir}/.affected-vitest-set`,
			});

			const payload = JSON.parse(
				readFileSync(`${tmpDir}/affected.json`, 'utf8'),
			) as { affected: string[]; vitestProjects: string[] };
			expect(payload.affected).toEqual([
				'@mcp-vertex/git',
				'@mcp-vertex/core',
			]);
			expect(payload.vitestProjects).toEqual(['git', 'core']);

			expect(readFileSync(`${tmpDir}/.affected-set`, 'utf8').trim()).toBe(
				'@mcp-vertex/git\n@mcp-vertex/core',
			);
			expect(
				readFileSync(`${tmpDir}/.affected-vitest-set`, 'utf8').trim(),
			).toBe('git\ncore');
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});

describe('affected.script CLI', () => {
	it('--all writes the default Vitest project set artifact', async () => {
		const tmpDir = `/tmp/affected-vitest-cli-${Date.now()}`;
		mkdirSync(tmpDir, { recursive: true });
		try {
			const outputPath = `${tmpDir}/affected.json`;
			const setPath = `${tmpDir}/.affected-set`;
			const vitestSetPath = `${tmpDir}/.affected-vitest-set`;

			const code = await main([
				'--all',
				'--output',
				outputPath,
				'--set-file',
				setPath,
				'--vitest-set-file',
				vitestSetPath,
			]);

			expect(code).toBe(0);
			expect(readFileSync(vitestSetPath, 'utf8')).toContain('core');
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
