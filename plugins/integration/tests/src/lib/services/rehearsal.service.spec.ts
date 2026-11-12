import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import type { IRehearsalForge } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import {
	rehearse,
	selectScenarios,
} from '../../../../src/lib/services/rehearsal.service';
import { rehearsalPolicy } from '../../../../src/lib/services/rehearsal-setup.helper';

const forgeThatRecords = () => {
	const branches = new Set<string>();
	const written: string[] = [];
	const forge = fakePartial<IRehearsalForge>({
		tipOf: async () => 'tip',
		createBranch: async (name: string) => {
			written.push(name);
			branches.add(name);
		},
		deleteBranch: async (name: string) => void branches.delete(name),
		listBranches: async (prefix: string) =>
			[...branches].filter((b) => b.startsWith(prefix)),
		commit: async () => 'setup',
		history: async () => [],
		pulls: async () => [],
		runs: async () => [],
		labels: async () => [],
		hooks: async () => [],
		pullEvents: async () => [],
		runLog: async () => '',
		deleteLabel: async () => undefined,
		deleteHook: async () => undefined,
		closePull: async () => undefined,
	});
	return { forge, written, branches };
};

describe('rehearse', () => {
	it('[<50ms] writes only under the rehearsal namespace and leaves nothing behind', async () => {
		const { forge, written, branches } = forgeThatRecords();
		const report = await rehearse({
			forge,
			clock: {
				now: () => Date.parse('2026-11-12T10:00:00Z'),
				wait: async () => undefined,
			},
			setup: () => ({ files: () => [] }),
			repository: 'o/r',
			branchPrefix: 'delendai/rehearsal/',
			baseBranch: 'develop',
			scenarios: [
				{ id: 's', title: 's', pulls: [], steps: [], expect: [] },
			],
			log: () => undefined,
		});
		expect(written.every((b) => b.startsWith('delendai/rehearsal/'))).toBe(
			true,
		);
		expect(written).not.toContain('develop');
		expect(branches.size).toBe(0);
		expect(report.leftovers).toEqual([]);
	});

	it('[<50ms] refuses an unknown scenario id, naming the known ones', () => {
		expect(() => selectScenarios([{ id: 'a' }], ['b'])).toThrow('known: a');
	});

	it('[<50ms] selects every scenario for all', () => {
		expect(
			selectScenarios([{ id: 'a' }, { id: 'b' }], ['all']),
		).toHaveLength(2);
	});

	it('[<50ms] points the policy at the rehearsal branch and turns the engine on', () => {
		const text = rehearsalPolicy(
			'{"development":{"branches":{"integration":"develop"},"integration":{"engine":"none"}}}',
			'ns/rehearsal/r/s-integration',
		);
		const parsed = JSON.parse(text);
		expect(parsed.development.branches.integration).toBe(
			'ns/rehearsal/r/s-integration',
		);
		expect(parsed.development.integration.engine).toBe('land');
	});
});
