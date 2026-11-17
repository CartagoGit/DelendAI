import { pullHead } from '../../../../src/lib/services/rehearsal-names.helper';
import { fakePartial } from '@delendai/test-kit';
import { describe, expect, it } from 'vitest';

import {
	DEFAULT_INTEGRATION_OPTIONS,
	LAND_DERIVED_JOBS,
	renderLandWorkflow,
} from '@delendai/core/cli';

import { REHEARSAL_CATALOGUE } from '../../../../src/lib/contracts/constants/rehearsal-catalogue.constant';
import { REHEARSAL_KNOWN_RED } from '../../../../src/lib/contracts/constants/rehearsal-known-red.constant';
import {
	REHEARSAL_MAX_PULLS,
	REHEARSAL_SCENARIOS,
} from '../../../../src/lib/contracts/constants/rehearsal-scenarios.constant';
import type { IRehearsalSetupInput } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import {
	REHEARSAL_OVERLAP_FILE,
	REHEARSAL_REAL_SPEC_DIR,
} from '../../../../src/lib/contracts/constants/rehearsal.constant';
import { createRehearsalSetup } from '../../../../src/lib/services/rehearsal-setup.helper';
import { pullChanges } from '../../../../src/lib/services/rehearsal-names.helper';
import {
	landIntegratorWorkflow,
	rehearsalPolicy,
} from '../../../../src/lib/services/rehearsal-setup.helper';
import {
	runsInMode,
	scenariosForMode,
	selectScenarios,
} from '../../../../src/lib/services/rehearsal.service';

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
					// A pull a workflow opened is named `<key>:token-open`.
					for (const k of step.keys)
						expect(
							keys.has(k.replace(/:token-open$/u, '')) ||
								step.kind === 'open',
						).toBe(true);
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

	it('[<50ms] red-batch adds the far-line spec to a in real mode only, and not to b', () => {
		const redBatch = REHEARSAL_SCENARIOS.find((s) => s.id === 'red-batch');
		const [a, b] = ['a', 'b'].map((key) =>
			redBatch?.pulls.find((spec) => spec.key === key),
		);
		const specPath = `${REHEARSAL_REAL_SPEC_DIR}/overlap-far-line.spec.ts`;
		const paths = (
			spec: typeof a,
			mode: 'fast' | 'real',
		): readonly string[] =>
			spec === undefined
				? []
				: pullChanges('r1', 'red-batch', spec, {}, mode).map(
						(change) => change.path,
					);
		expect(paths(a, 'real')).toContain(specPath);
		expect(paths(a, 'real')).toContain(
			`${REHEARSAL_REAL_SPEC_DIR}/raw-text.d.ts`,
		);
		expect(paths(b, 'real')).not.toContain(specPath);
		expect(paths(a, 'fast')).not.toContain(specPath);
		expect(paths(a, 'fast')).toEqual(
			paths(a, 'fast').filter((p) => p.startsWith('rehearsal/')),
		);
		const content = (
			a === undefined ? [] : pullChanges('r1', 'red-batch', a, {}, 'real')
		).find((change) => change.path === specPath)?.content;
		expect(content).toContain('const LINE = 25;');
		expect(content).toContain(`${REHEARSAL_OVERLAP_FILE}?raw`);
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

describe('the modes of a scenario', () => {
	it('[<50ms] runs a scenario that names no mode in both', () => {
		expect(runsInMode({}, 'fast')).toBe(true);
		expect(runsInMode({}, 'real')).toBe(true);
		expect(runsInMode({ modes: ['fast'] }, 'real')).toBe(false);
	});

	it('[<50ms] keeps the scenarios that need the workflow token out of the real mode', () => {
		const real = scenariosForMode(REHEARSAL_CATALOGUE, 'real').map(
			(s) => s.id,
		);
		expect(real).not.toContain('bot-head');
		expect(real).not.toContain('automation-opened');
		expect(real).toContain('one-pr');
		const fast = scenariosForMode(REHEARSAL_CATALOGUE, 'fast').map(
			(s) => s.id,
		);
		expect(fast).toEqual(REHEARSAL_CATALOGUE.map((s) => s.id));
	});

	it('[<50ms] has a scenario that opens by the workflow token run in fast only', () => {
		for (const scenario of REHEARSAL_CATALOGUE) {
			const usesToken = scenario.steps.some(
				(step) =>
					step.kind === 'token-push' || step.kind === 'token-open',
			);
			expect(runsInMode(scenario, 'real')).toBe(!usesToken);
		}
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

	it('[<50ms] holds only what real GitHub still showed red: the real-mode scenario', () => {
		expect(REHEARSAL_KNOWN_RED.map((r) => r.scenario)).toEqual(['F6']);
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
				derived: LAND_DERIVED_JOBS,
				setupSteps: [
					'- uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7',
					'  with:',
					'      persist-credentials: false',
					'- uses: ./.github/actions/setup-bun-repo',
					'  with:',
					"      fetch-depth: '0'",
					"      persist-credentials: 'false'",
				],
			}),
		);
		expect(rendered).toContain('derived-prepare:');
		expect(rendered).toContain('derived-push:');
		expect(rendered).toContain('ns/rehearsal/r1/s-integration');
		expect(rendered).toContain('group: land-rehearsal-r1');
	});

	it('[<50ms] names the run root as the publication prefix of a run policy, and its heads publications under it', () => {
		const policy = JSON.parse(
			rehearsalPolicy('{}', 'ns/rehearsal/r1/s-integration', true, 'r1'),
		);
		expect(policy.development.branches.publicationRefPrefix).toBe(
			'ns/rehearsal/r1/',
		);
		expect(pullHead('ns/rehearsal/', 'r1', 's', 'a')).toBe(
			'ns/rehearsal/r1/rehearsal/implement/x00000-S1-g1/s-a',
		);
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

	it('[<50ms] has the pull requests of overlapping and red-batch change one shared file on different lines', () => {
		for (const id of ['overlapping', 'red-batch']) {
			const pulls = REHEARSAL_SCENARIOS.find((s) => s.id === id)?.pulls;
			const [a, b] = (pulls ?? []).map(
				(p) => p.files[REHEARSAL_OVERLAP_FILE]?.split('\n') ?? [],
			);
			expect(a?.length).toBeGreaterThan(20);
			const changed = (lines: string[] = []) =>
				lines.flatMap((l, i) => (l.startsWith('edited') ? [i] : []));
			expect(changed(a)).toHaveLength(1);
			expect(changed(b)).toHaveLength(1);
			expect(changed(a)).not.toEqual(changed(b));
		}
	});

	it('[<50ms] has the promotion scenario land one green pull request', () => {
		const promotion = REHEARSAL_SCENARIOS.find((s) => s.id === 'promotion');
		expect(promotion?.pulls).toHaveLength(1);
		expect(promotion?.steps.length).toBeGreaterThan(0);
	});

	it('[<50ms] has the policy batch what overlaps and derive the file the derived-conflict scenario collides on', () => {
		const policy = JSON.parse(
			rehearsalPolicy(
				'{"development":{"integration":{"batching":"off"}}}',
				'i',
				false,
				'r1',
			),
		).development.integration;
		expect(policy.batching).toBe('overlap');
		expect(policy.derived).toEqual({
			paths: ['rehearsal/r1/derived-conflict-a.txt'],
			command: '',
		});
		const derivedPull = REHEARSAL_SCENARIOS.find(
			(s) => s.id === 'derived-conflict',
		)?.pulls[0];
		expect(Object.keys(derivedPull?.files ?? {})).toContain(
			'rehearsal/{run}/derived-conflict-a.txt',
		);
	});

	it('[<50ms] creates the shared file in the setup commit', async () => {
		const files = await createRehearsalSetup(
			fakePartial<IRehearsalSetupInput>({
				runId: 'r1',
				branchPrefix: 'ns',
				policyText: '{}',
				integratorWorkflow: () => '',
			}),
		).files('i');
		expect(files.map((f) => f.path)).toContain(REHEARSAL_OVERLAP_FILE);
	});

	it("[<50ms] names the stand-in check as required in fast mode, and the policy's in real mode", () => {
		const base = {
			runId: 'r1',
			branchPrefix: 'ns',
			integratorWorkflow: () => '',
		};
		expect(
			createRehearsalSetup(
				fakePartial<IRehearsalSetupInput>({
					...base,
					policyText: '{}',
				}),
			).requiredChecks,
		).toEqual(['rehearsal-ci']);
		expect(
			createRehearsalSetup(
				fakePartial<IRehearsalSetupInput>({
					...base,
					policyText:
						'{"development":{"integration":{"requiredChecks":["tests","lint"]}}}',
					realWorkflows: {},
				}),
			).requiredChecks,
		).toEqual(['tests', 'lint']);
	});
});

describe('the host-offline scenario', () => {
	it('[<50ms] lands one pull request, then connects a receiver that must be told once', () => {
		const offline = REHEARSAL_SCENARIOS.find(
			(s) => s.id === 'host-offline',
		);
		expect(offline?.pulls).toHaveLength(1);
		expect(offline?.steps.map((step) => step.kind)).toEqual([
			'open',
			'ready',
			'await',
			'receive',
		]);
		expect(offline?.expect).toContainEqual({ kind: 'sessions-notified' });
	});
});

describe('the scenarios of one batch', () => {
	it('[<50ms] make their members ready in one request', () => {
		for (const id of ['overlapping', 'red-batch']) {
			const ready = REHEARSAL_SCENARIOS.find(
				(s) => s.id === id,
			)?.steps.find((step) => step.kind === 'ready');
			expect(ready).toMatchObject({ together: true });
		}
	});
});
