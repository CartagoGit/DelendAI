#!/usr/bin/env bun
/**
 * no-duplicate-release-triggers.script.spec.ts
 *
 * The shape that doubles a release candidate's checks, and the three
 * near-misses that must not be mistaken for it.
 */
import { describe, expect, it } from 'vitest';

import { parseWorkflowYaml, type YamlValue } from '../ci/workflow-yaml.ts';

import {
	branchesOf,
	doublesOnRelease,
	formatReport,
} from './no-duplicate-release-triggers.script.ts';

const BRANCHES = { integration: 'develop', release: 'main' } as const;

const workflow = (on: string): Record<string, YamlValue> =>
	parseWorkflowYaml(
		`name: t\non:\n${on}\njobs:\n    a:\n        runs-on: ubuntu-latest\n`,
	);

describe('doublesOnRelease', () => {
	it('catches push-to-integration plus pull-request-into-release', () => {
		expect(
			doublesOnRelease(
				workflow(
					'    push:\n        branches: [develop]\n    pull_request:\n        branches: [develop, main]\n',
				),
				BRANCHES,
			),
		).toBe(true);
	});

	it('leaves a workflow that only runs on pull requests into the integration branch', () => {
		expect(
			doublesOnRelease(
				workflow(
					'    push:\n        branches: [develop]\n    pull_request:\n        branches: [develop]\n',
				),
				BRANCHES,
			),
		).toBe(false);
	});

	it('leaves a workflow that only runs on the release pull request', () => {
		// `quality-gate` and `release-pr-gate` are this shape: they have
		// no push trigger, so there is nothing to duplicate.
		expect(
			doublesOnRelease(
				workflow('    pull_request:\n        branches: [main]\n'),
				BRANCHES,
			),
		).toBe(false);
	});

	it('leaves a workflow that only pushes', () => {
		expect(
			doublesOnRelease(
				workflow('    push:\n        branches: [develop, main]\n'),
				BRANCHES,
			),
		).toBe(false);
	});

	it('is not fooled by a push to the RELEASE branch', () => {
		// Pushing to `main` happens after the merge, on a commit no
		// pull request is open for.
		expect(
			doublesOnRelease(
				workflow(
					'    push:\n        branches: [main]\n    pull_request:\n        branches: [main]\n',
				),
				BRANCHES,
			),
		).toBe(false);
	});

	it('answers false for a workflow with no branch filters at all', () => {
		expect(
			doublesOnRelease(workflow('    workflow_dispatch:\n'), BRANCHES),
		).toBe(false);
	});
});

describe('branchesOf', () => {
	it('reads the branch list of one trigger', () => {
		const on = workflow('    push:\n        branches: [develop, main]\n')[
			'on'
		];
		const push =
			typeof on === 'object' && on !== null && !Array.isArray(on)
				? (on as Record<string, YamlValue>)['push']
				: undefined;

		expect(branchesOf(push)).toEqual(['develop', 'main']);
	});

	it('answers empty for a trigger with no branches key', () => {
		expect(branchesOf(undefined)).toEqual([]);
	});
});

describe('formatReport', () => {
	it('says what is wrong and what to write instead', () => {
		const report = formatReport([{ workflow: 'ci.yml' }]);

		expect(report).toContain('ci.yml');
		expect(report).toContain('branches: [develop]');
	});

	it('says nothing is doubled when nothing is', () => {
		expect(formatReport([])).toContain('no workflow runs twice');
	});
});
