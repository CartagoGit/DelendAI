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

	it('[<100ms] cuts every integration branch from the commit it was given and names it as the tip', async () => {
		const { forge } = forgeThatRecords();
		const cutFrom: string[] = [];
		const report = await rehearse({
			forge: {
				...forge,
				createBranch: async (name, sha) => {
					cutFrom.push(sha);
					await forge.createBranch(name, sha);
				},
			},
			clock: {
				now: () => Date.parse('2026-11-12T10:00:00Z'),
				wait: async () => undefined,
			},
			setup: () => ({ files: () => [] }),
			repository: 'o/r',
			branchPrefix: 'delendai/rehearsal/',
			baseBranch: 'develop',
			baseCommit: 'pr-head-sha',
			scenarios: [
				{ id: 's', title: 's', pulls: [], steps: [], expect: [] },
			],
			log: () => undefined,
		});
		expect(report.tip).toBe('pr-head-sha');
		expect(cutFrom).toEqual(['pr-head-sha']);
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

	it('[<100ms] says in the log why a scenario stopped', async () => {
		const { forge } = forgeThatRecords();
		const lines: string[] = [];
		await rehearse({
			forge: {
				...forge,
				createBranch: async () => {
					throw new Error('POST git/refs answered 422');
				},
			},
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
			log: (line) => lines.push(line),
		});
		expect(lines).toContain('s: stopped: POST git/refs answered 422');
	});

	it('[<100ms] records an exception in one scenario as its result and plays the next', async () => {
		const { forge } = forgeThatRecords();
		let calls = 0;
		const report = await rehearse({
			forge: {
				...forge,
				tipOf: forge.tipOf,
				createBranch: async (name, sha) => {
					calls += 1;
					if (calls === 1) throw new Error('boom');
					await forge.createBranch(name, sha);
				},
				pulls: async () => {
					throw new Error('pulls unreadable');
				},
			},
			clock: {
				now: () => Date.parse('2026-11-12T10:00:00Z'),
				wait: async () => undefined,
			},
			setup: () => ({ files: () => [] }),
			repository: 'o/r',
			branchPrefix: 'delendai/rehearsal/',
			baseBranch: 'develop',
			scenarios: [
				{ id: 'one', title: 'one', pulls: [], steps: [], expect: [] },
				{ id: 'two', title: 'two', pulls: [], steps: [], expect: [] },
			],
			log: () => undefined,
		}).catch((error: unknown) => error);
		// The unreadable forge makes collection and cleanup throw: each is a result, and the report still exists.
		expect(report).not.toBeInstanceOf(Error);
		const built = report as {
			scenarios: {
				id: string;
				ok: boolean;
				expectations: { detail: string }[];
			}[];
		};
		expect(built.scenarios.map((s) => s.id)).toEqual(['one', 'two']);
		expect(built.scenarios.every((s) => !s.ok)).toBe(true);
		expect(
			(report as { leftovers: string[] }).leftovers.join(' '),
		).toContain('cleanup failed: pulls unreadable');
		expect(
			built.scenarios[0]?.expectations.map((e) => e.detail).join(' '),
		).toMatch(/error: /u);
	});
});
