/**
 * The decision that removes checking, so the cases are about what it
 * must REFUSE to remove.
 *
 * Every mistake this function can make is silent in one direction and
 * merely slow in the other. Running a job that was not needed costs a
 * few minutes; skipping a job that was needed ships a regression with a
 * green tick on it. So the default is always "run", and these cases pin
 * each of the ways that default has to survive: an unknown job, an
 * unreadable diff, and a scope that says `always`.
 */

import { describe, expect, it } from 'vitest';

import { JOB_SCOPES, jobMustRun, planJobs } from './job-scope.script';
import type { IJobScope } from './job-scope.interface';

const SCOPES: readonly IJobScope[] = [
	{ job: 'always-job', touches: 'always', because: 'test fixture' },
	{ job: 'web', touches: ['apps/web/'], because: 'test fixture' },
	{
		job: 'packaging',
		touches: ['packages/', 'package.json'],
		because: 'test fixture',
	},
];

const must = (job: string, changed: readonly string[]): boolean =>
	jobMustRun({ job, changed, scopes: SCOPES });

describe('jobMustRun — the ways "run" has to survive', () => {
	// The important one. A job nobody declared is a job nobody thought
	// about, and the answer to that is never "skip it".
	it('runs a job it has never heard of', () => {
		expect(must('some-new-job', ['docs/a.md'])).toBe(true);
	});

	// An empty diff is not evidence that nothing changed; it is what an
	// unreadable diff also looks like.
	it('runs everything when the change list is empty', () => {
		expect(must('web', [])).toBe(true);
		expect(must('packaging', [])).toBe(true);
	});

	it('runs a job declared always, whatever changed', () => {
		expect(must('always-job', ['docs/a.md'])).toBe(true);
	});
});

describe('jobMustRun — the bounded decision', () => {
	it('runs a bounded job when the change is inside its bound', () => {
		expect(must('web', ['apps/web/src/pages/index.astro'])).toBe(true);
	});

	it('skips a bounded job when nothing it reads was touched', () => {
		expect(must('web', ['docs/a.md'])).toBe(false);
	});

	it('runs when ANY one of several changed files is in scope', () => {
		expect(
			must('web', ['docs/a.md', 'apps/web/src/a.ts', 'README.md']),
		).toBe(true);
	});

	it('matches a bare file, not only a directory prefix', () => {
		expect(must('packaging', ['package.json'])).toBe(true);
	});

	// `packages/` must not be satisfied by `packages-old/` — a prefix
	// that accidentally matches a neighbour would run jobs needlessly,
	// but one that accidentally fails to match would skip them.
	it('does not match a sibling path that merely starts the same', () => {
		expect(must('web', ['apps/website/src/a.ts'])).toBe(false);
	});
});

describe('planJobs', () => {
	it('answers for every declared job and nothing else', () => {
		const plan = planJobs({ changed: ['docs/a.md'], scopes: SCOPES });
		expect(Object.keys(plan).sort()).toEqual([
			'always-job',
			'packaging',
			'web',
		]);
	});

	it('reports the skips as false rather than omitting them', () => {
		expect(planJobs({ changed: ['docs/a.md'], scopes: SCOPES })).toEqual({
			'always-job': true,
			web: false,
			packaging: false,
		});
	});
});

/**
 * Against the real table, not a fixture.
 *
 * The declarations are the thing being trusted, so the invariants they
 * must hold are checked on them directly: nothing is declared twice,
 * and every bound carries the reason it is correct. A bound without a
 * reason is a guess that looks like a decision.
 */
describe('the declarations themselves', () => {
	it('declares each job exactly once', () => {
		const ids = JOB_SCOPES.map((scope) => scope.job);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('gives every bound a stated reason', () => {
		for (const scope of JOB_SCOPES) {
			expect(scope.because.length).toBeGreaterThan(20);
		}
	});

	it('never declares an empty bound, which would skip the job forever', () => {
		for (const scope of JOB_SCOPES) {
			if (scope.touches === 'always') continue;
			expect(scope.touches.length).toBeGreaterThan(0);
		}
	});

	// The aggregate that gates every merge cannot be one of the jobs a
	// change is allowed to skip.
	it('keeps the required aggregate unconditional', () => {
		const validate = JOB_SCOPES.find(
			(scope) => scope.job === 'delendai-validate',
		);
		expect(validate?.touches).toBe('always');
	});

	it('keeps the job that decides the skips unconditional', () => {
		expect(
			JOB_SCOPES.find((scope) => scope.job === 'plan-scope')?.touches,
		).toBe('always');
	});
});
