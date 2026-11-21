import { describe, expect, it } from 'vitest';

import {
	findTrackedDeclarations,
	formatReport,
	gitListTrackedFiles,
	GUARDED_PATHSPECS,
	remedyCommand,
	type IListTrackedFiles,
} from './no-tracked-declarations.script';

const noop: IListTrackedFiles = () => [];

describe('findTrackedDeclarations', () => {
	it('is ok when git tracks no declaration under a source tree', () => {
		const result = findTrackedDeclarations('/repo', noop);
		expect(result.ok).toBe(true);
		expect(result.offenders).toEqual([]);
	});

	it('flags every tracked .d.ts, sorted', () => {
		const result = findTrackedDeclarations('/repo', () => [
			'plugins/proposals/src/lib/tools/db-status.tool.d.ts',
			'packages/core/src/lib/api/index.d.ts',
		]);
		expect(result.ok).toBe(false);
		expect(result.offenders).toEqual([
			'packages/core/src/lib/api/index.d.ts',
			'plugins/proposals/src/lib/tools/db-status.tool.d.ts',
		]);
	});

	it('never flags a real source file even if the lister over-matches', () => {
		const result = findTrackedDeclarations('/repo', () => [
			'packages/core/src/lib/api/index.ts',
			'packages/core/src/lib/api/index.d.tsx',
		]);
		expect(result.ok).toBe(true);
	});

	it('passes the cwd and the guarded pathspecs through to the lister', () => {
		let receivedCwd = '';
		let receivedSpecs: readonly string[] = [];
		findTrackedDeclarations('/some/repo', (cwd, pathspecs) => {
			receivedCwd = cwd;
			receivedSpecs = pathspecs;
			return [];
		});
		expect(receivedCwd).toBe('/some/repo');
		expect(receivedSpecs).toEqual([...GUARDED_PATHSPECS]);
	});
});

describe('GUARDED_PATHSPECS', () => {
	it('covers src and tests of both packages and plugins', () => {
		expect([...GUARDED_PATHSPECS]).toEqual([
			'packages/*/src/**/*.d.ts',
			'plugins/*/src/**/*.d.ts',
			'packages/*/tests/**/*.d.ts',
			'plugins/*/tests/**/*.d.ts',
		]);
	});
});

describe('remedyCommand', () => {
	it('is a runnable `git rm --cached` naming every offender', () => {
		expect(remedyCommand(['a/b.d.ts', 'c/d.d.ts'])).toBe(
			'git rm --cached a/b.d.ts c/d.d.ts',
		);
	});
});

describe('formatReport', () => {
	it('reports clean when ok', () => {
		expect(formatReport({ offenders: [], ok: true })).toContain('✓');
	});

	it('lists every offender and the exact remedy command', () => {
		const out = formatReport({
			offenders: ['packages/core/src/lib/api/index.d.ts'],
			ok: false,
		});
		expect(out).toContain('✖');
		expect(out).toContain('packages/core/src/lib/api/index.d.ts');
		expect(out).toContain(
			'git rm --cached packages/core/src/lib/api/index.d.ts',
		);
	});
});

// i00004 S2 — this repo's OWN state used to fail this check: 278
// `.d.ts` under `packages/*/src` and `plugins/*/src` stayed tracked
// for as long as the .gitignore rule existed, because an ignore rule
// does not untrack a file git already tracks. They have been
// untracked. This pins that the real git-backed lister, against THIS
// repo at test time, reports clean — so the regression cannot
// silently reappear.
describe('acceptance: this repo tracks no declaration under a source tree', () => {
	it('gitListTrackedFiles reports 0 offenders for the live repo', () => {
		const result = findTrackedDeclarations(
			process.cwd(),
			gitListTrackedFiles,
		);
		expect(result.offenders).toEqual([]);
		expect(result.ok).toBe(true);
	});
});
