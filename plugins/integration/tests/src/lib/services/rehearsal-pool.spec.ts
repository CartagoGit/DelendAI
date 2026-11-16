import { describe, expect, it } from 'vitest';

import { fakePartial } from '@delendai/test-kit';

import { REHEARSAL_SCENARIOS } from '../../../../src/lib/contracts/constants/rehearsal-scenarios.constant';
import type { IRehearsalForge } from '../../../../src/lib/contracts/interfaces/rehearsal.interface';
import { playPooled } from '../../../../src/lib/services/rehearsal-pool.helper';
import { scenarioLandGroup } from '../../../../src/lib/services/rehearsal-names.helper';
import { rehearse } from '../../../../src/lib/services/rehearsal.service';

/** Lets every promise that can settle without a timer settle. */
const flush = async (): Promise<void> => {
	for (let turn = 0; turn < 50; turn += 1) await Promise.resolve();
};

const gate = () => {
	let open: () => void = () => undefined;
	const opened = new Promise<void>((done) => {
		open = done;
	});
	return { opened, open };
};

describe('playPooled', () => {
	it('[<50ms] runs at most the limit at once and keeps the order of the items', async () => {
		const gates = [gate(), gate(), gate(), gate()];
		let inFlight = 0;
		let peak = 0;
		const done = playPooled([0, 1, 2, 3], 2, async (item) => {
			inFlight += 1;
			peak = Math.max(peak, inFlight);
			await gates[item]?.opened;
			inFlight -= 1;
			return `r${String(item)}`;
		});
		await flush();
		expect(inFlight).toBe(2);
		// The later items finish first; the results still follow the list.
		gates[1]?.open();
		await flush();
		expect(inFlight).toBe(2);
		for (const one of [gates[3], gates[2], gates[0]]) one?.open();
		expect(await done).toEqual(['r0', 'r1', 'r2', 'r3']);
		expect(peak).toBe(2);
	});

	it('[<50ms] plays one after another at a limit of 1 and treats a smaller limit as 1', async () => {
		for (const limit of [1, 0, -3]) {
			let inFlight = 0;
			let peak = 0;
			await playPooled([1, 2, 3], limit, async () => {
				inFlight += 1;
				peak = Math.max(peak, inFlight);
				await Promise.resolve();
				inFlight -= 1;
			});
			expect(peak).toBe(1);
		}
	});

	it('[<50ms] returns nothing for nothing', async () => {
		expect(await playPooled([], 4, async () => 1)).toEqual([]);
	});
});

describe('rehearse with scenarios at once', () => {
	const scenario = (id: string) => ({
		id,
		title: id,
		pulls: [],
		steps: [],
		expect: [],
	});

	it('[<100ms] plays up to the concurrency at once and reports the scenarios in catalogue order', async () => {
		const setups = [gate(), gate(), gate()];
		const started: string[] = [];
		const branches = new Set<string>();
		const forge = fakePartial<IRehearsalForge>({
			tipOf: async () => 'tip',
			createBranch: async (name: string) => {
				branches.add(name);
				const index = ['a', 'b', 'c'].findIndex((id) =>
					name.endsWith(`${id}-integration`),
				);
				if (index >= 0) {
					started.push(name);
					await setups[index]?.opened;
				}
			},
			deleteBranch: async (name: string) => void branches.delete(name),
			listBranches: async (prefix: string) =>
				[...branches].filter((b) => b.startsWith(prefix)),
			commit: async () => 'setup',
			history: async () => [],
			pulls: async () => [],
			runs: async () => [],
			labels: async () => [],
			pullEvents: async () => [],
			runLog: async () => '',
			cancelRun: async () => 'cancelled' as const,
			jobCount: async () => 1,
			reopenPull: async () => undefined,
			deleteLabel: async () => undefined,
			closePull: async () => undefined,
		});
		const done = rehearse({
			forge,
			clock: {
				now: () => Date.parse('2026-11-12T10:00:00Z'),
				wait: async () => undefined,
			},
			setup: () => ({
				files: async () => [],
				requiredChecks: ['rehearsal-ci'],
			}),
			repository: 'o/r',
			branchPrefix: 'delendai/rehearsal/',
			baseBranch: 'develop',
			scenarios: [scenario('a'), scenario('b'), scenario('c')],
			concurrency: 2,
			log: () => undefined,
		});
		await flush();
		expect(started).toHaveLength(2);
		// The last scenario finishes first; the report still lists a, b, c.
		setups[1]?.open();
		await flush();
		expect(started).toHaveLength(3);
		setups[2]?.open();
		setups[0]?.open();
		const report = await done;
		expect(report.scenarios.map((one) => one.id)).toEqual(['a', 'b', 'c']);
		expect(report.leftovers).toEqual([]);
	});
});

describe('scenarios that play at once share nothing', () => {
	it('[<50ms] gives every scenario its own land concurrency group', () => {
		const groups = ['a', 'b'].map((id) =>
			scenarioLandGroup('r1', `ns/rehearsal/r1/${id}-integration`),
		);
		expect(groups).toEqual(['land-rehearsal-r1-a', 'land-rehearsal-r1-b']);
	});

	it('[<50ms] makes the pull requests of a batch ready only after their own checks finished', () => {
		for (const id of ['overlapping', 'red-batch']) {
			const kinds = (
				REHEARSAL_SCENARIOS.find((one) => one.id === id)?.steps ?? []
			).map((step) =>
				step.kind === 'await' ? `await:${step.until}` : step.kind,
			);
			expect(kinds.indexOf('await:checked')).toBeGreaterThan(
				kinds.indexOf('open'),
			);
			expect(kinds.indexOf('await:checked')).toBeLessThan(
				kinds.indexOf('ready'),
			);
		}
	});
});
