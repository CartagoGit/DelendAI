import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IRehearsalForge } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';

import {
	newRunId,
	runStartOf,
	secretHitsIn,
	sweepStaleRuns,
} from '../../../../src/lib/services/rehearsal-cleanup.service';
import {
	renderRehearsalCiWorkflow,
	renderRehearsalScanWorkflow,
	renderRehearsalTokenWorkflow,
} from '../../../../src/lib/services/rehearsal-ci-workflow.helper';
import { runLabelPrefix } from '../../../../src/lib/services/rehearsal-names.helper';
import {
	createRehearsalSetup,
	landIntegratorWorkflow,
} from '../../../../src/lib/services/rehearsal-setup.helper';

/** A forge that knows only its branches: all the cleanup reads. */
const branchesForge = (names: Map<string, string>) =>
	fakePartial<IRehearsalForge>({
		listBranches: async (prefix: string) =>
			[...names.keys()].filter((b) => b.startsWith(prefix)),
		deleteBranch: async (name: string) => void names.delete(name),
		pulls: async () => [],
		closePull: async () => undefined,
		labels: async () => [],
		deleteLabel: async () => undefined,
		hooks: async () => [],
		deleteHook: async () => undefined,
	});

describe('cleanup and setup', () => {
	it('[<50ms] reads the start of a run from its id and refuses other names', () => {
		const id = newRunId(Date.parse('2026-11-12T10:00:00Z'));
		expect(id).toBe('r20261112-100000');
		expect(runStartOf(id)).toBe(Date.parse('2026-11-12T10:00:00Z'));
		expect(runStartOf('nope')).toBeUndefined();
	});

	it('[<100ms] sweeps runs older than the stale age and keeps a fresh one', async () => {
		const branches = new Map<string, string>();
		const forge = branchesForge(branches);
		branches.set('ns/rehearsal/r20261112-060000/x-integration', 's');
		branches.set('ns/rehearsal/r20261112-095900/y-integration', 's');
		const swept = await sweepStaleRuns({
			forge,
			branchPrefix: 'ns/rehearsal/',
			now: Date.parse('2026-11-12T10:00:00Z'),
		});
		expect(swept).toEqual(['r20261112-060000']);
		expect([...branches.keys()].some((b) => b.includes('095900'))).toBe(
			true,
		);
	});

	it('[<50ms] finds a token shape and a secret value in a log, and nothing in a clean one', () => {
		const run = { id: 4, workflow: 'w' };
		const shaped = `ghp_${'a'.repeat(36)}`;
		expect(secretHitsIn(run, `ok\nleak ${shaped}`)).toHaveLength(1);
		expect(
			secretHitsIn(run, 'has hunter2hunter2 inside', ['hunter2hunter2']),
		).toHaveLength(1);
		expect(secretHitsIn(run, 'nothing here')).toEqual([]);
	});

	it('[<50ms] renders the workflows with the event values reaching the shell through env only', () => {
		const ci = renderRehearsalCiWorkflow({
			integration: 'ns/i',
			runId: 'r1',
		});
		expect(ci).toContain("branches: ['ns/i']");
		expect(ci).not.toMatch(/run:.*\$\{\{/u);
		expect(renderRehearsalScanWorkflow({ integration: 'ns/i' })).toContain(
			'rehearsal-scan',
		);
		const token = renderRehearsalTokenWorkflow({
			integration: 'ns/i',
			labelPrefix: runLabelPrefix('r1'),
			branchPrefix: 'ns/rehearsal/',
		});
		expect(token).toContain('github.token');
	});

	it('[<100ms] makes the setup commit of workflows, policy and run marker', () => {
		const setup = createRehearsalSetup({
			runId: 'r1',
			branchPrefix: 'ns/rehearsal/',
			policyText: '{"development":{}}',
			integratorWorkflow: (integration, group) =>
				landIntegratorWorkflow(integration, group, {
					releaseBranch: 'main',
					passCommand: 'bun pass',
				}),
		});
		const paths = setup
			.files('ns/rehearsal/r1/s-integration')
			.map((f) => f.path);
		expect(paths).toContain('.github/workflows/land.yml');
		expect(
			setup.files('i').find((f) => f.path.endsWith('land.yml'))?.content,
		).toContain('group: land-rehearsal-r1');
		expect(paths).toContain('delendai.config.json');
		expect(paths).toContain('rehearsal/r1/.keep');
	});
});
