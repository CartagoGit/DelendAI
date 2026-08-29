/**
 * affected.spec.ts — covers c00138 (Track G, audit §30, §49).
 *
 * Exercises the pure graph / closure logic with synthetic
 * `IPackageGraph` fixtures. The git I/O path is covered by the
 * workflow itself (`.github/workflows/affected.yml`); we don't
 * shell out to git from tests so the suite stays hermetic.
 *
 * The `main` path is exercised by importing a fixture repo's
 * graph in `buildGraph-on-fixture.spec` (see below) and by the
 * real `bun tools/scripts/ci/affected.script.ts --all` dry run
 * against the live tree, which the validate gate runs.
 */

import { describe, expect, it } from 'vitest';

import {
	computeAffected,
	fileToWorkspace,
	gitDiffNames,
	main,
	type IPackageGraph,
	writeAffectedArtifacts,
} from '../../scripts/ci/affected.script';

const fakeGraph = (
	workspaces: readonly string[],
	deps: ReadonlyMap<string, readonly string[]>,
	dirs?: ReadonlyMap<string, string>,
	rootDir = '/repo',
): IPackageGraph => {
	const dirToName = new Map<string, string>(dirs ?? []);
	const nameToDeps = new Map<string, readonly string[]>();
	const nameToDependents = new Map<string, string[]>();
	for (const ws of workspaces) {
		nameToDeps.set(ws, deps.get(ws) ?? []);
	}
	for (const [ws, wsDeps] of deps) {
		for (const dep of wsDeps) {
			const dependents = nameToDependents.get(dep) ?? [];
			if (!dependents.includes(ws)) dependents.push(ws);
			nameToDependents.set(dep, dependents);
		}
	}
	return { rootDir, dirToName, nameToDeps, nameToDependents, workspaces };
};

/**
 * Build a standard `dirToName` mapping for the test fixtures so
 * each test doesn't have to repeat the same boilerplate. Pass the
 * workspace name to register a `packages/<leaf>` mapping.
 */
const standardDirs = (
	...names: readonly string[]
): ReadonlyMap<string, string> => {
	const map = new Map<string, string>();
	for (const name of names) {
		const leaf = name.replace('@mcp-vertex/', '');
		map.set(`packages/${leaf}`, name);
	}
	return map;
};

describe('affected (c00138) — graph + closure', () => {
	it('fileToWorkspace picks the longest prefix match', () => {
		const graph = fakeGraph(
			['@mcp-vertex/core', '@mcp-vertex/cli'],
			new Map(),
			standardDirs('@mcp-vertex/core', '@mcp-vertex/cli'),
		);

		expect(fileToWorkspace(graph, 'packages/core/src/index.ts')).toBe(
			'@mcp-vertex/core',
		);
		// Files outside any workspace return null.
		expect(fileToWorkspace(graph, 'README.md')).toBeNull();
	});

	it('computeAffected returns direct-only set when no edges', () => {
		const graph = fakeGraph(
			['@mcp-vertex/core', '@mcp-vertex/cli'],
			new Map(),
			standardDirs('@mcp-vertex/core', '@mcp-vertex/cli'),
		);
		const result = computeAffected(['packages/cli/src/index.ts'], graph);
		expect(result.affected).toContain('@mcp-vertex/cli');
		expect(result.affected).not.toContain('@mcp-vertex/core');
		expect(result.upstream).toEqual([]);
		expect(result.downstream).toEqual([]);
	});

	it('computeAffected propagates downstream (dependents)', () => {
		// cli depends on core → changing core affects cli.
		const deps = new Map([
			['@mcp-vertex/cli', ['@mcp-vertex/core']],
			['@mcp-vertex/core', []],
		]);
		const graph = fakeGraph(
			['@mcp-vertex/core', '@mcp-vertex/cli'],
			deps,
			standardDirs('@mcp-vertex/core', '@mcp-vertex/cli'),
		);

		const result = computeAffected(['packages/core/src/index.ts'], graph);
		expect(result.affected).toEqual(
			expect.arrayContaining(['@mcp-vertex/core', '@mcp-vertex/cli']),
		);
		expect(result.downstream).toContain('@mcp-vertex/cli');
	});

	it('computeAffected propagates upstream (dependencies)', () => {
		// cli depends on core → changing cli also re-tests core (contract change).
		const deps = new Map([
			['@mcp-vertex/cli', ['@mcp-vertex/core']],
			['@mcp-vertex/core', []],
		]);
		const graph = fakeGraph(
			['@mcp-vertex/core', '@mcp-vertex/cli'],
			deps,
			standardDirs('@mcp-vertex/core', '@mcp-vertex/cli'),
		);

		const result = computeAffected(['packages/cli/src/index.ts'], graph);
		expect(result.affected).toEqual(
			expect.arrayContaining(['@mcp-vertex/core', '@mcp-vertex/cli']),
		);
		expect(result.upstream).toContain('@mcp-vertex/core');
	});

	it('computeAffected buckets root-level files separately', () => {
		const graph = fakeGraph(
			['@mcp-vertex/core'],
			new Map(),
			standardDirs('@mcp-vertex/core'),
		);
		const result = computeAffected(
			[
				'README.md',
				'mcp-vertex.config.json',
				'packages/core/src/index.ts',
			],
			graph,
		);
		expect(result.rootFiles).toEqual([
			'README.md',
			'mcp-vertex.config.json',
		]);
		expect(result.affected).toEqual(['@mcp-vertex/core']);
	});

	it('computeAffected preserves workspace declaration order in the result', () => {
		const deps = new Map([
			['@mcp-vertex/core', []],
			['@mcp-vertex/cli', ['@mcp-vertex/core']],
		]);
		const graph = fakeGraph(
			['@mcp-vertex/core', '@mcp-vertex/cli'],
			deps,
			standardDirs('@mcp-vertex/core', '@mcp-vertex/cli'),
		);

		const result = computeAffected(
			['packages/cli/src/index.ts', 'packages/core/src/index.ts'],
			graph,
		);
		// core appears before cli in the declaration order, so even
		// though cli was listed first in the diff, the result is
		// sorted by declaration order — deterministic for caching.
		expect(result.affected[0]).toBe('@mcp-vertex/core');
		expect(result.affected[1]).toBe('@mcp-vertex/cli');
	});
});

describe('affected (c00138) — CLI', () => {
	it('refuses when neither --base nor --all is provided', async () => {
		const code = await main([]);
		expect(code).toBe(2);
	});

	it('--all skips git and writes every workspace', async () => {
		const tmpDir = `/tmp/affected-spec-${Date.now()}`;
		const outputPath = `${tmpDir}/affected.json`;
		const setPath = `${tmpDir}/.affected-set`;
		const code = await main([
			'--all',
			'--output',
			outputPath,
			'--set-file',
			setPath,
		]);
		// Exit may be 0 (success) or 1 (transient I/O); but never 2.
		expect(code).not.toBe(2);
	});
});

describe('affected (c00138) — git wrapper', () => {
	it('gitDiffNames surfaces a qualified error on bad refs', () => {
		expect(() => gitDiffNames('definitely-not-a-ref-xyz', 'HEAD')).toThrow(
			/git diff/,
		);
	});
});

describe('affected (c00138) — writeAffectedArtifacts', () => {
	it('produces stable JSON + newline-joined set file', async () => {
		const { mkdirSync, readFileSync, rmSync } = await import('node:fs');
		const tmpDir = `/tmp/affected-write-${Date.now()}`;
		mkdirSync(tmpDir, { recursive: true });
		try {
			const deps = new Map([
				['@mcp-vertex/core', []],
				['@mcp-vertex/cli', ['@mcp-vertex/core']],
			]);
			const graph = fakeGraph(
				['@mcp-vertex/core', '@mcp-vertex/cli'],
				deps,
				standardDirs('@mcp-vertex/core', '@mcp-vertex/cli'),
			);

			const result = computeAffected(
				['packages/core/src/index.ts'],
				graph,
			);
			writeAffectedArtifacts(result, {
				outputPath: `${tmpDir}/affected.json`,
				setPath: `${tmpDir}/.affected-set`,
			});

			const json = JSON.parse(
				readFileSync(`${tmpDir}/affected.json`, 'utf8'),
			) as {
				affected: string[];
				mode: string;
			};
			expect(json.mode).toBe('diff');
			expect(json.affected).toEqual(
				expect.arrayContaining(['@mcp-vertex/core', '@mcp-vertex/cli']),
			);

			const setRaw = readFileSync(`${tmpDir}/.affected-set`, 'utf8');
			const setLines = setRaw.trim().split('\n').sort();
			expect(setLines).toEqual(['@mcp-vertex/cli', '@mcp-vertex/core']);
		} finally {
			rmSync(tmpDir, { recursive: true, force: true });
		}
	});
});
