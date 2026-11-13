import { describe, expect, it } from 'vitest';

import {
	DEFAULT_INTEGRATION_OPTIONS,
	renderLandWorkflow,
} from '@delendai/core/cli';

import { REHEARSAL_CATALOGUE } from '../../../../src/lib/contracts/constants/rehearsal-catalogue.constant';
import { REHEARSAL_KNOWN_RED } from '../../../../src/lib/contracts/constants/rehearsal-known-red.constant';
import {
	REHEARSAL_MAX_PULLS,
	REHEARSAL_SCENARIOS,
} from '../../../../src/lib/contracts/constants/rehearsal-scenarios.constant';
import { pullChanges } from '../../../../src/lib/services/rehearsal-names.helper';
import {
	landIntegratorWorkflow,
	rehearsalPolicy,
} from '../../../../src/lib/services/rehearsal-setup.helper';
import { selectScenarios } from '../../../../src/lib/services/rehearsal.service';

const reproduced = REHEARSAL_SCENARIOS.flatMap(
	(s) => s.reproduces?.split('+') ?? [],
);

describe('the scenario catalogue', () => {
	it('[<50ms] is what a run plays', () => {
		expect(REHEARSAL_CATALOGUE).toBe(REHEARSAL_SCENARIOS);
	});

	it('[<50ms] has every case of the flow, once each', () => {
		const ids = REHEARSAL_SCENARIOS.map((s) => s.id);
		expect(new Set(ids).size).toBe(ids.length);
		for (const id of [
			'one-pr',
			'non-overlapping',
			'overlapping',
			'red-batch',
			'derived-conflict',
			'authored-conflict',
			'bot-head',
			'develop-moving',
			'host-offline',
			'automation-opened',
			'promotion',
		])
			expect(ids).toContain(id);
	});

	it('[<50ms] reproduces each production failure the forge can show in fast mode', () => {
		for (const failure of [
			'F1',
			'F1b',
			'F2',
			'F3',
			'F4',
			'F5',
			'F7',
			'F8',
			'F9',
		])
			expect(reproduced).toContain(failure);
	});

	it('[<50ms] says what each scenario must show, and uses only what it declares', () => {
		for (const scenario of REHEARSAL_SCENARIOS) {
			expect(scenario.expect.length).toBeGreaterThan(0);
			const keys = new Set(scenario.pulls.map((p) => p.key));
			for (const step of scenario.steps)
				if ('keys' in step)
					for (const k of step.keys)
						expect(keys.has(k) || step.kind === 'open').toBe(true);
		}
	});

	it('[<50ms] opens no more pull requests than one run may, counting those a workflow opens', () => {
		const opened = REHEARSAL_SCENARIOS.reduce(
			(sum, s) =>
				sum +
				s.pulls.length +
				s.steps.filter((x) => x.kind === 'token-open').length,
			0,
		);
		expect(opened).toBeLessThanOrEqual(REHEARSAL_MAX_PULLS);
	});

	it('[<50ms] writes only under rehearsal/, and a path may name the run', () => {
		for (const scenario of REHEARSAL_SCENARIOS)
			for (const spec of scenario.pulls)
				for (const change of pullChanges('r1', scenario.id, spec))
					expect(change.path.startsWith('rehearsal/')).toBe(true);
		const changed = pullChanges('r1', 's', {
			key: 'a',
			declaration: { result: 'success', seconds: 1, sections: [] },
			files: { 'rehearsal/{run}/x.txt': '' },
		});
		expect(changed.map((c) => c.path)).toContain('rehearsal/r1/x.txt');
	});

	it('[<50ms] opens pull requests as drafts so a ready event follows', () => {
		for (const spec of REHEARSAL_SCENARIOS.flatMap((s) => s.pulls))
			expect(spec.draft).toBe(true);
	});

	it('[<50ms] selects a scenario by id and refuses an unknown one', () => {
		expect(
			selectScenarios(REHEARSAL_CATALOGUE, ['one-pr']).map((s) => s.id),
		).toEqual(['one-pr']);
		expect(() => selectScenarios(REHEARSAL_CATALOGUE, ['F99'])).toThrow(
			'unknown scenario',
		);
	});
});

describe('the known-red list', () => {
	it('[<50ms] names the slice that fixes each red scenario and only scenarios that exist', () => {
		const ids = new Set(REHEARSAL_SCENARIOS.map((s) => s.id));
		for (const red of REHEARSAL_KNOWN_RED) {
			expect(red.fixedBy).toMatch(/^S\d+/u);
			expect(ids.has(red.scenario) || red.realModeOnly === true).toBe(
				true,
			);
		}
	});

	it('[<50ms] holds every scenario but the one real GitHub showed green', () => {
		const red = REHEARSAL_KNOWN_RED.map((r) => r.scenario);
		for (const scenario of REHEARSAL_SCENARIOS) {
			if (scenario.id === 'develop-moving') {
				expect(red).not.toContain(scenario.id);
			} else expect(red).toContain(scenario.id);
		}
	});
});

describe('today land on the rehearsal branch', () => {
	const input = {
		releaseBranch: 'main',
		passCommand: 'bun pass',
		identity: DEFAULT_INTEGRATION_OPTIONS.identity,
	} as const;

	it('[<50ms] is the real render, changed only by the branch and the check it waits on', () => {
		const rendered = landIntegratorWorkflow(
			'ns/rehearsal/r1/s-integration',
			'land-rehearsal-r1',
			input,
		);
		expect(rendered).toBe(
			renderLandWorkflow({
				integrationBranch: 'ns/rehearsal/r1/s-integration',
				releaseBranch: 'main',
				identity: DEFAULT_INTEGRATION_OPTIONS.identity,
				cron: '*/15 * * * *',
				passCommand: 'bun pass',
				concurrencyGroup: 'land-rehearsal-r1',
				setupSteps: [
					'- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
					'- uses: ./.github/actions/setup-bun-repo',
					'  with:',
					"      fetch-depth: '0'",
				],
			}),
		);
		expect(rendered).toContain('ns/rehearsal/r1/s-integration');
		expect(rendered).toContain('group: land-rehearsal-r1');
	});

	it('[<50ms] has the policy wait for the rehearsal CI and no other check', () => {
		const policy = JSON.parse(
			rehearsalPolicy(
				'{"development":{"integration":{"requiredChecks":["x"]}}}',
				'i',
			),
		);
		expect(policy.development.integration.requiredChecks).toEqual([
			'rehearsal-ci',
		]);
	});
});
