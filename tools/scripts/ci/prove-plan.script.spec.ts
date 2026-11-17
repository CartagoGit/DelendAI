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
	gateNamesOf,
	gateOf,
	onlyGatesOf,
	partialVerdictOf,
	rerunCommandOf,
	takesComputeSlot,
	unknownGatesOf,
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
			'changed-file coverage: the specs nearest the change',
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

describe('--only', () => {
	it('[<20ms] names a gate by its label before the colon, as a slug', () => {
		expect(
			gateOf('changed-file coverage: the specs nearest the change'),
		).toBe('changed-file-coverage');
		expect(gateOf('changed-file coverage')).toBe('changed-file-coverage');
		expect(gateOf('test:sqlite')).toBe('test-sqlite');
		expect(gateOf('typecheck')).toBe('typecheck');
	});

	it('[<20ms] reads the gates from the flag, and none without it', () => {
		expect(onlyGatesOf(['--fast'])).toBeUndefined();
		expect([
			...(onlyGatesOf(['--only=typecheck, lint-docs']) ?? []),
		]).toEqual(['typecheck', 'lint-docs']);
	});

	it('[<20ms] lists the gates the proof itself defines and names the unknown ones', () => {
		const valid = gateNamesOf(['plugins/x/src/a.ts'], true, 'b');
		expect(valid).toContain('typecheck');
		expect(valid).toContain('lint-architecture');
		expect(valid).toContain('changed-file-coverage');
		expect(valid).toContain('tool-budgets');
		expect(unknownGatesOf(new Set(['typecheck', 'nope']), valid)).toEqual([
			'nope',
		]);
	});

	it('[<20ms] runs the coverage gate with the arguments the full proof builds', () => {
		const steps = fastSteps(
			['plugins/x/src/a.ts'],
			['plugins/x/a.spec.ts'],
			'b',
		).filter(([label]) => gateOf(label) === 'changed-file-coverage');
		expect(steps.map(([, command]) => command)).toEqual([
			[
				'bunx',
				'vitest',
				'run',
				'--coverage',
				'--passWithNoTests',
				'plugins/x/a.spec.ts',
			],
			[
				'bun',
				'tools/scripts/ci/changed-file-coverage.script.ts',
				'--base=b',
			],
		]);
	});

	it('[<20ms] asks for the compute slot only for a heavy gate of a partial run', () => {
		const lint = new Set(['lint-biome', 'typecheck']);
		const coverage = new Set(['changed-file-coverage']);
		expect(takesComputeSlot(lint, ['lint-biome', 'typecheck'])).toBe(false);
		expect(takesComputeSlot(coverage, ['changed-file coverage'])).toBe(
			true,
		);
		expect(takesComputeSlot(undefined, ['changed-file coverage'])).toBe(
			false,
		);
	});

	it('[<20ms] says how to run a failed gate alone, and that a partial run proves nothing', () => {
		expect(rerunCommandOf('lint-docs')).toBe(
			'delendai work prove --only=lint-docs',
		);
		expect(partialVerdictOf(true, new Set(['typecheck']), 3)).toBe(
			'prove: ok --only=typecheck in 3s; partial: the unit is not proved',
		);
	});
});
