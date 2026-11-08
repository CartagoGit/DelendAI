/**
 * train-rehearsal.spec.ts — the gates a train meets are rehearsed, and
 * every failure is reported in one pass.
 */
import { describe, expect, it } from 'vitest';

import {
	NULL_OID,
	prePushStdin,
	rehearseGates,
	reportOf,
	touchesIntegrationMachinery,
} from './train-rehearsal';

describe('touchesIntegrationMachinery', () => {
	it('is true for the files that build, push and judge a train', () => {
		for (const path of [
			'tools/scripts/forge/queue-order.ts',
			'tools/scripts/ci/prove-plan.script.ts',
			'.github/workflows/ci.yml',
			'lefthook.yml',
			'tools/scripts/lint/commit-branch-discipline.script.ts',
			'packages/core/src/lib/development-policy/project-branches.ts',
		]) {
			expect(touchesIntegrationMachinery([path])).toBe(true);
		}
	});

	it('is false for anything else', () => {
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
	it('writes the line git gives a hook for a new remote branch', () => {
		expect(prePushStdin('train/ab/1', 'c'.repeat(40))).toBe(
			`refs/heads/train/ab/1 ${'c'.repeat(40)} refs/heads/train/ab/1 ${NULL_OID}\n`,
		);
	});
});

describe('rehearseGates', () => {
	const env = { PATH: process.env.PATH ?? '' };

	it('runs every gate and reports all the failures, not the first', async () => {
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
		const report = reportOf(results, 'train/x').join('\n');
		expect(report).toContain('why a: error: first');
		expect(report).toContain('would fail: ');
	});

	it('hands a hook its stdin and bounds a gate by its timeout', async () => {
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

	it('says a train passes when every gate does', () => {
		expect(
			reportOf(
				[{ label: 'a', ok: true, seconds: 1, causes: [] }],
				't',
			).pop(),
		).toContain('passes every gate');
	});
});
