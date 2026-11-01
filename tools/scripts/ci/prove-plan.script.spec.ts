/**
 * prove-plan.script.spec.ts — a matrix job is run locally the way CI runs it.
 */
import { describe, expect, it } from 'vitest';

import { causeLinesOf, fastSteps, vitestArgsOf } from './prove-plan.script';

const job = {
	name: 'plugins 1/4',
	paths: 'plugins/a plugins/b',
	shard: '1/4',
	run: true,
	filter: 'changed',
	readers: '',
};

describe('vitestArgsOf', () => {
	it('runs the specs the imports reach, on the job shard, against the base', () => {
		expect(vitestArgsOf(job, 'abc')).toEqual([
			'plugins/a',
			'plugins/b',
			'--shard=1/4',
			'--changed',
			'abc',
		]);
	});

	it('runs only the listed readers, or the zone unfiltered, or nothing', () => {
		expect(
			vitestArgsOf(
				{ ...job, filter: 'readers', readers: 'x.spec.ts y.spec.ts' },
				'abc',
			),
		).toEqual(['x.spec.ts', 'y.spec.ts']);
		expect(vitestArgsOf({ ...job, filter: 'all' }, 'abc')).toEqual([
			'plugins/a',
			'plugins/b',
			'--shard=1/4',
		]);
		expect(
			vitestArgsOf({ ...job, run: false, filter: 'none' }, 'abc'),
		).toBeUndefined();
	});
});

describe('fastSteps', () => {
	it('checks the site translations only when a tool can have changed', () => {
		const labels = (path: string) =>
			fastSteps([path], [], 'base').map(([label]) => label);
		expect(labels('plugins/a/src/lib/tools/b.tool.ts')).toContain(
			'site tool translations',
		);
		expect(labels('docs/a.md')).not.toContain('site tool translations');
	});

	it('runs the nearest specs with the touched files covered, then judges that coverage', () => {
		const steps = fastSteps(
			['plugins/x/src/a.ts'],
			['plugins/x/a.spec.ts'],
			'b',
		);
		expect(steps.map(([label]) => label)).toEqual([
			'tests: the specs nearest the change',
			'changed-file coverage',
			'generated files are current',
		]);
		expect(steps[0]?.[1]).toContain('plugins/x/a.spec.ts');
		expect(steps[0]?.[1]).toContain('--coverage');
		expect(steps[1]?.[1]).toContain('--base=b');
	});

	it('adds the bun suite for state or proposals code, and runs no tests for none near', () => {
		expect(
			fastSteps(['packages/state-sqlite/src/a.ts'], [], 'b').map(
				([label]) => label,
			),
		).toEqual(['test:sqlite', 'generated files are current']);
		expect(
			fastSteps(['README.md'], [], 'b').map(([label]) => label),
		).toEqual(['generated files are current']);
	});
});

describe('causeLinesOf', () => {
	it('names a coverage floor, a stale generated file and a manifest budget', () => {
		expect(
			causeLinesOf(
				'a.ts: lines 70% under floor 83%\n  drift: plugins/x/AGENT.md\nmanifest budget: x: over\nok',
			),
		).toEqual([
			'a.ts: lines 70% under floor 83%',
			'drift: plugins/x/AGENT.md',
			'manifest budget: x: over',
		]);
	});

	it('keeps the lines that name a failure, without colour or repeats', () => {
		const output = [
			'all fine',
			'\u001b[31m FAIL \u001b[0m a.spec.ts > breaks',
			' FAIL  a.spec.ts > breaks',
			'x.ts(1,2): error TS2554: Expected 0 arguments',
			'(fail) one > two',
			'proposals: 80,135 B => HARD BREACH',
			'✖ dropped by the limit',
		].join('\n');
		expect(causeLinesOf(output)).toEqual([
			'FAIL  a.spec.ts > breaks',
			'x.ts(1,2): error TS2554: Expected 0 arguments',
			'(fail) one > two',
			'proposals: 80,135 B => HARD BREACH',
		]);
	});
});
