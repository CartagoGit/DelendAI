/**
 * Both directions of the drift, because only one of them is obvious.
 *
 * A job added without a declaration is harmless — it runs. A
 * declaration left behind after its job is deleted is not: it can
 * excuse a `skipped` result for a job nobody runs any more, which is
 * how a gate disappears without anyone deciding to remove it.
 */

import { describe, expect, it } from 'vitest';

import { scopeDrift, workflowJobIds } from './job-scope-coverage.script';

const WORKFLOW = [
	'name: CI',
	'on:',
	'    push:',
	'        branches: [develop]',
	'jobs:',
	'    lint-biome:',
	'        name: lint-biome',
	'        steps:',
	'            - run: echo hi',
	'    tests:',
	'        name: tests',
	'',
].join('\n');

describe('workflowJobIds', () => {
	it('reads the job ids and nothing else', () => {
		expect(workflowJobIds(WORKFLOW)).toEqual(['lint-biome', 'tests']);
	});

	it('does not mistake a key above the jobs block for a job', () => {
		expect(workflowJobIds(WORKFLOW)).not.toContain('push');
	});
});

describe('scopeDrift', () => {
	it('is quiet when both sides agree', () => {
		expect(scopeDrift({ jobs: ['a', 'b'], declared: ['a', 'b'] })).toEqual({
			undeclared: [],
			stale: [],
		});
	});

	it('names a job the table has never heard of', () => {
		expect(
			scopeDrift({ jobs: ['a', 'b'], declared: ['a'] }).undeclared,
		).toEqual(['b']);
	});

	it('names a declaration whose job is gone — the dangerous one', () => {
		expect(
			scopeDrift({ jobs: ['a'], declared: ['a', 'ghost'] }).stale,
		).toEqual(['ghost']);
	});
});
