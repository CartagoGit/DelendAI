import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import {
	computeToolsRegressions,
	dirHasTsFiles,
	expandWorkspaceGlob,
	findUncoveredWorkspaces,
	isCoveredByTsProject,
	parseTscErrorsByFile,
	readWorkspaceGlobs,
} from './typecheck.script';
import { repoRoot } from './lib/monorepo-paths';

const REPO_ROOT = repoRoot();

describe('parseTscErrorsByFile', () => {
	it('counts one error per diagnostic line, keyed by file', () => {
		const output = [
			'tools/scripts/foo.ts(10,3): error TS2367: This comparison appears to be unintentional.',
			"tools/scripts/foo.ts(20,3): error TS2339: Property 'x' does not exist.",
			"tools/scripts/bar.ts(1,1): error TS7006: Parameter implicitly has an 'any' type.",
			'',
			'Found 3 errors in 2 files.',
		].join('\n');
		expect(parseTscErrorsByFile(output)).toEqual({
			'tools/scripts/foo.ts': 2,
			'tools/scripts/bar.ts': 1,
		});
	});

	it('returns an empty object for clean output', () => {
		expect(parseTscErrorsByFile('')).toEqual({});
	});
});

describe('computeToolsRegressions — same ratchet policy as types-in-contracts', () => {
	it('flags a file whose count exceeds its baseline', () => {
		const regressions = computeToolsRegressions(
			{ 'a.ts': 3 },
			{ 'a.ts': 2 },
		);
		expect(regressions).toHaveLength(1);
		expect(regressions[0]).toContain('a.ts');
	});

	it('flags a NEW erroring file not in the baseline at all', () => {
		const regressions = computeToolsRegressions({ 'new.ts': 1 }, {});
		expect(regressions).toHaveLength(1);
	});

	it('does not flag a file at or below its baseline', () => {
		expect(computeToolsRegressions({ 'a.ts': 2 }, { 'a.ts': 2 })).toEqual(
			[],
		);
		expect(computeToolsRegressions({ 'a.ts': 1 }, { 'a.ts': 2 })).toEqual(
			[],
		);
	});

	it('does not flag a file that disappeared entirely (pure win)', () => {
		expect(computeToolsRegressions({}, { 'a.ts': 5 })).toEqual([]);
	});
});

describe('AUD-A12 workspace↔project coverage', () => {
	it('expandWorkspaceGlob expands a trailing /* against real directories', () => {
		const dirs = expandWorkspaceGlob(REPO_ROOT, 'packages/*');
		expect(dirs).toContain('packages/core');
		expect(dirs).toContain('packages/cli');
	});

	it('expandWorkspaceGlob returns a bare entry unchanged', () => {
		expect(expandWorkspaceGlob(REPO_ROOT, 'tools')).toEqual(['tools']);
	});

	it('expandWorkspaceGlob returns nothing for a glob with no matching base dir', () => {
		expect(expandWorkspaceGlob(REPO_ROOT, 'nonexistent-root/*')).toEqual(
			[],
		);
	});

	it('dirHasTsFiles is true for a dir with real TS source', () => {
		expect(dirHasTsFiles(REPO_ROOT, 'tools/scripts')).toBe(true);
	});

	it('dirHasTsFiles is false for tools/docs-api (package.json + README only)', () => {
		// This is the one workspace in this repo with zero TS source —
		// the case the coverage check must treat as vacuously fine
		// rather than flagging as "uncovered".
		expect(dirHasTsFiles(REPO_ROOT, 'tools/docs-api')).toBe(false);
	});

	it('isCoveredByTsProject recognises a package with its own tsconfig.json', () => {
		expect(isCoveredByTsProject(REPO_ROOT, 'packages/core', [])).toBe(true);
	});

	it('isCoveredByTsProject recognises a plugin covered by the root include pattern', () => {
		expect(
			isCoveredByTsProject(REPO_ROOT, 'plugins/git', [
				'plugins/*/src/**/*',
			]),
		).toBe(true);
	});

	it('isCoveredByTsProject is false when neither a tsconfig nor any pattern matches', () => {
		expect(
			isCoveredByTsProject(REPO_ROOT, 'tools/docs-api', [
				'plugins/*/src/**/*',
			]),
		).toBe(false);
	});

	// AUD-A12's central claim, reproduced as a live assertion against the
	// actual manifest: before this proposal, `tools` (a declared
	// workspace with 303 files of real TypeScript) was covered by
	// nothing. This test fails the same way if `tools/` — or any future
	// workspace — loses its project again.
	it('every declared workspace with TS source is covered by some project (fails the way AUD-A12 did)', () => {
		const packageJson = JSON.parse(
			readFileSync(resolve(REPO_ROOT, 'package.json'), 'utf8'),
		) as { workspaces?: readonly string[] };
		const rootTsconfig = JSON.parse(
			readFileSync(resolve(REPO_ROOT, 'tsconfig.json'), 'utf8'),
		) as { include?: readonly string[] };

		const workspaces = readWorkspaceGlobs(packageJson);
		expect(workspaces.length).toBeGreaterThan(0);

		const uncovered = findUncoveredWorkspaces(
			REPO_ROOT,
			workspaces,
			rootTsconfig.include ?? [],
		);
		expect(uncovered).toEqual([]);
	});
});
