/**
 * land-rehearsal.spec.ts — the gates a batch meets are rehearsed, and
 * every failure is reported in one pass.
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { createGitRepoTemplate } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import { throwawayClone } from './land-rehearsal-clone';
import { assembleTrain, discardTrain } from './train-assembly';

import {
	NULL_OID,
	causesOf,
	prePushStdin,
	rehearseGates,
	reportOf,
	touchesIntegrationMachinery,
} from './land-rehearsal';

describe('touchesIntegrationMachinery', () => {
	it('[<50ms] is true for the files that build, push and judge a batch', () => {
		for (const path of [
			'tools/scripts/forge/land-git.ts',
			'tools/scripts/ci/prove-plan.script.ts',
			'.github/workflows/ci.yml',
			'lefthook.yml',
			'tools/scripts/lint/commit-branch-discipline.script.ts',
			'packages/core/src/lib/development-policy/project-branches.ts',
		]) {
			expect(touchesIntegrationMachinery([path])).toBe(true);
		}
	});

	it('[<50ms] is false for anything else', () => {
		expect(touchesIntegrationMachinery([])).toBe(false);
		expect(
			touchesIntegrationMachinery([
				'plugins/proposals/src/a.ts',
				'README.md',
			]),
		).toBe(false);
	});
});

describe('prePushStdin', () => {
	it('[<1000ms] writes the line git gives a hook for a new remote branch', () => {
		expect(prePushStdin('delendai/queue/batch-1', 'c'.repeat(40))).toBe(
			`refs/heads/delendai/queue/batch-1 ${'c'.repeat(40)} refs/heads/delendai/queue/batch-1 ${NULL_OID}\n`,
		);
	});
});

describe('rehearseGates', () => {
	const env = { PATH: process.env.PATH ?? '' };

	it('[<1000ms] runs every gate and reports all the failures, not the first', async () => {
		const results = await rehearseGates({
			gates: [
				{ label: 'a', script: 'echo "error: first" >&2; exit 1' },
				{ label: 'b', script: 'exit 0' },
				{ label: 'c', script: 'echo "FAIL second"; exit 2' },
			],
			cwd: process.cwd(),
			env,
			limit: 2,
			timeoutMs: 20_000,
		});
		expect(
			results
				.filter((r) => !r.ok)
				.map((r) => r.label)
				.sort(),
		).toEqual(['a', 'c']);
		const report = reportOf(results, 'delendai/queue/batch-1').join('\n');
		expect(report).toContain('why a: error: first');
		expect(report).toContain('would fail: ');
	});

	it('[<1000ms] hands a hook its stdin and bounds a gate by its timeout', async () => {
		const results = await rehearseGates({
			gates: [
				{
					label: 'stdin',
					script: 'read -r line; test "$line" = hi',
					stdin: 'hi\n',
				},
				{ label: 'slow', script: 'exec sleep 30' },
			],
			cwd: process.cwd(),
			env,
			limit: 2,
			timeoutMs: 300,
		});
		expect(results.find((r) => r.label === 'stdin')?.ok).toBe(true);
		const slow = results.find((r) => r.label === 'slow');
		expect(slow?.ok).toBe(false);
		expect(slow?.causes[0]).toContain('killed by');
	});

	it('[<50ms] names the cause lines of a failed gate once', () => {
		expect(
			causesOf('ok\nerror: a\nerror: a\n\u001b[31mFAIL b\u001b[0m\n'),
		).toEqual(['error: a', 'FAIL b']);
	});

	it('[<50ms] says a batch passes when every gate does', () => {
		expect(
			reportOf(
				[{ label: 'a', ok: true, seconds: 1, causes: [] }],
				't',
			).at(-1),
		).toContain('passes every gate');
	});
});

describe('the rehearsal script', () => {
	it('[<50ms] creates no branch in the clone: its scratch worktree stays detached', () => {
		const source = readFileSync(
			join(import.meta.dirname, 'land-rehearsal.script.ts'),
			'utf8',
		);
		expect(source).not.toMatch(/'checkout',\s*'-q',\s*'-[bB]'/u);
		expect(source).not.toMatch(/'(branch|switch)'/u);
	});
});

describe('the rehearsal clone', () => {
	const template = createGitRepoTemplate({ files: { 'a.txt': 'a\n' } });

	it('[<900ms] builds the batch in its own clone and leaves no ref or worktree behind', () => {
		const { root, git } = template.copy();
		const tip = git('rev-parse', 'HEAD');
		git('switch', '-q', '-c', 'side');
		writeFileSync(join(root, 'b.txt'), 'b\n');
		git('add', '-A');
		git('commit', '-q', '-m', 'side');
		const head = git('rev-parse', 'HEAD');
		git('switch', '-q', '-');
		git('branch', '-q', '-D', 'side');
		const refsBefore = git('for-each-ref');
		const worktreesBefore = git('worktree', 'list', '--porcelain');

		const clone = throwawayClone(root, [head]);
		const built = assembleTrain({
			root: clone.dir,
			remote: clone.dir,
			tipSha: tip,
			ref: 'delendai/queue/batch-1',
			members: [{ number: 1, headRef: 'rehearsal/1', headSha: head }],
			derived: new Set(),
			regenerate: () => true,
			linkDependencies: () => true,
			rehearsal: true,
		});
		expect(built.conflicting).toEqual([]);
		expect(built.scratch).toBeDefined();
		expect(existsSync(join(built.scratch ?? '', 'b.txt'))).toBe(true);
		discardTrain(clone.dir, built.scratch ?? '');
		clone.dispose();

		expect(git('for-each-ref')).toBe(refsBefore);
		expect(git('worktree', 'list', '--porcelain')).toBe(worktreesBefore);
		expect(existsSync(clone.dir)).toBe(false);
		expect(existsSync(built.scratch ?? '')).toBe(false);
	});

	it('[<50ms] the script assembles only in the throwaway clone', () => {
		const source = readFileSync(
			join(import.meta.dirname, 'land-rehearsal.script.ts'),
			'utf8',
		);
		expect(source).toContain('throwawayClone(root, heads)');
		expect(source).toMatch(/root: clone\.dir,\s*remote: clone\.dir,/u);
	});
});
