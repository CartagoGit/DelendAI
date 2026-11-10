/**
 * prove-plan.script.spec.ts — a matrix job is run locally the way CI runs it.
 */
import { describe, expect, it } from 'vitest';

import {
	causeLinesOf,
	failedOutputPathOf,
	earlySteps,
	familyPlanOf,
	isProposalOnly,
	proveGatesOf,
	timingTableOf,
	fastSteps,
	vitestArgsOf,
} from './prove-plan.script';

const job = {
	name: 'plugins 1/4',
	paths: 'plugins/a plugins/b',
	shard: '1/4',
	run: true,
	filter: 'changed',
	readers: '',
};

describe('vitestArgsOf', () => {
	it('[<40ms] runs the specs the imports reach, on the job shard, against the base', () => {
		expect(vitestArgsOf(job, 'abc')).toEqual([
			'plugins/a',
			'plugins/b',
			'--shard=1/4',
			'--changed',
			'abc',
		]);
	});

	it('[<20ms] runs only the listed readers, or the zone unfiltered, or nothing', () => {
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

describe('earlySteps', () => {
	it('[<20ms] checks the site translations only when a tool can have changed', () => {
		const labels = (path: string) =>
			earlySteps([path]).map(([label]) => label);
		expect(labels('plugins/a/src/lib/tools/b.tool.ts')).toEqual([
			'tool budgets',
			'generated files are current',
			'site tool translations',
		]);
		expect(labels('docs/delendai/proposals/ready/a.md')).toEqual([
			'agent-catalog current',
			'docs-index current',
			'host-hints current',
			'roadmap drift',
		]);
		expect(labels('docs/a.md')).toEqual([
			'tool budgets',
			'generated files are current',
		]);
	});
});

describe('isProposalOnly', () => {
	it('[<20ms] holds only when every changed file is a proposal', () => {
		expect(isProposalOnly(['docs/delendai/proposals/a.md'])).toBe(true);
		expect(
			isProposalOnly(['docs/delendai/proposals/a.md', 'plugins/x/a.ts']),
		).toBe(false);
		expect(isProposalOnly([])).toBe(false);
	});
});

describe('timingTableOf', () => {
	it('[<20ms] lists the slowest step first', () => {
		const lines = timingTableOf([
			{ label: 'a', seconds: 3, ok: true },
			{ label: 'b', seconds: 70, ok: false },
		]);
		expect(lines[1]).toContain('70s');
		expect(lines[1]).toContain('FAIL');
		expect(lines[2]).toContain('a');
	});
});

describe('fastSteps', () => {
	it('[<20ms] rehearses a batch when the integration machinery changed', () => {
		const labels = (changed: readonly string[]) =>
			fastSteps(changed, [], 'b').map(([label]) => label);
		expect(labels(['tools/scripts/forge/train-assembly.ts'])).toContain(
			'land rehearsal',
		);
		expect(labels(['lefthook.yml'])).toContain('land rehearsal');
		expect(labels(['README.md'])).not.toContain('land rehearsal');
	});

	it('[<20ms] runs the nearest specs with the touched files covered, then judges that coverage', () => {
		const steps = fastSteps(
			['plugins/x/src/a.ts'],
			['plugins/x/a.spec.ts'],
			'b',
		);
		expect(steps.map(([label]) => label)).toEqual([
			'tests: the specs nearest the change',
			'changed-file coverage',
		]);
		expect(steps[0]?.[1]).toContain('plugins/x/a.spec.ts');
		expect(steps[0]?.[1]).toContain('--coverage');
		expect(steps[1]?.[1]).toContain('--base=b');
	});

	it('[<20ms] adds the bun suite for state or proposals code, and runs no tests for none near', () => {
		expect(
			fastSteps(['packages/state-sqlite/src/a.ts'], [], 'b').map(
				([label]) => label,
			),
		).toEqual(['test:sqlite']);
		expect(
			fastSteps(['README.md'], [], 'b').map(([label]) => label),
		).toEqual([]);
	});
});

describe('failedOutputPathOf', () => {
	it('[<20ms] keeps each failed step in a file of its own, named after the step', () => {
		expect(failedOutputPathOf('test:sqlite')).toBe(
			'.cache/delendai/results/logs/prove-failed/test-sqlite.log',
		);
		expect(failedOutputPathOf('tests: the specs nearest the change')).toBe(
			'.cache/delendai/results/logs/prove-failed/tests-the-specs-nearest-the-change.log',
		);
	});
});

describe('causeLinesOf', () => {
	it('[<20ms] names a coverage floor, a stale generated file and a manifest budget', () => {
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

	it('[<20ms] keeps the lines that name a failure, without colour or repeats', () => {
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

describe('the sectioned checks', () => {
	it('[<20ms] typechecks against the base the forge diffs against', () => {
		expect(proveGatesOf('abc123')).toEqual([
			['bun', 'run', 'typecheck', '--', '--base=abc123'],
		]);
	});

	it('[<20ms] prints which check families run for a docs-only change and why the others do not', () => {
		const lines = familyPlanOf({
			changed: ['docs/delendai/guide.md'],
			structural: [],
			reached: new Set(),
		});
		expect(lines).toContain(
			'prove: run  lint-docs — docs/delendai/guide.md changed',
		);
		expect(lines.find((line) => line.includes(' typecheck — '))).toMatch(
			/^prove: skip typecheck — no changed file is under /u,
		);
		expect(lines.find((line) => line.includes(' lint-biome — '))).toBe(
			'prove: skip lint-biome — the change is prose only, which this job does not read',
		);
	});
});
