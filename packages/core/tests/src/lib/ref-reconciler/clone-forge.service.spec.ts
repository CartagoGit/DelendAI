/**
 * clone-forge.service.spec.ts — the clone-side `IRefForge` over fake
 * ports: which units it lists, which it never ends, and the order edits
 * are kept in before a unit leaves.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type {
	ICloneForgePorts,
	ICloneUnit,
} from '@delendai/core/lib/contracts/interfaces/ref-reconciler.interface';
import { CloneForgeService } from '@delendai/core/lib/ref-reconciler/clone-forge.service';
import { RefReconcilerService } from '@delendai/core/lib/ref-reconciler/reconciler.service';

const branches = resolveDevelopmentPolicy({
	development: { branches: { namespacePrefix: 'delendai' } },
}).branches;
const REF = 'delendai/wip/m/x1-S1-g1/t';

const unit = (over: Partial<ICloneUnit> = {}): ICloneUnit => ({
	ref: REF,
	standing: 'delivered',
	delivered: true,
	silentSeconds: 9000,
	...over,
});

interface IFakeOptions {
	readonly units: readonly ICloneUnit[];
	readonly edited?: readonly string[];
	readonly alive?: boolean;
	readonly landed?: boolean;
	readonly empty?: boolean;
	readonly keptOnRemote?: boolean;
	readonly keepAt?: string | undefined;
	readonly removed?: boolean;
	readonly worktree?: string | null;
}

const fake = (options: IFakeOptions) => {
	const calls: string[] = [];
	const ports: ICloneForgePorts = {
		units: () => Promise.resolve(options.units),
		tipOf: () => 'tip1',
		worktreeOf: () => options.worktree ?? '/w',
		inspect: () => ({ edited: options.edited ?? [], regenerable: [] }),
		isLanded: () => options.landed ?? false,
		carriesNothing: () => options.empty ?? false,
		keptOnRemote: () => options.keptOnRemote ?? false,
		alive: () => Promise.resolve(options.alive ?? false),
		keepEdits: () => {
			calls.push('keepEdits');
			return 'keepAt' in options ? options.keepAt : 'refs/retired/x';
		},
		removeCheckout: (_ref, _tip, editsKept) => {
			calls.push(`remove${editsKept ? ':editsKept' : ''}`);
			return Promise.resolve(options.removed ?? true);
		},
		dropForgeCopy: () => {
			calls.push('dropForgeCopy');
		},
		report: () => undefined,
	};
	return { ports, calls };
};

const run = async (options: IFakeOptions, applying = true) => {
	const { ports, calls } = fake(options);
	const forge = new CloneForgeService(ports, applying);
	await new RefReconcilerService(forge, branches).pass();
	return { calls, outcomes: [...forge.outcomes.values()] };
};

describe('CloneForgeService', () => {
	it('[<200ms] ends a delivered unit and drops its forge copy', async () => {
		const { calls, outcomes } = await run({ units: [unit()] });
		expect(calls).toEqual(['remove', 'dropForgeCopy']);
		expect(outcomes[0]?.outcome).toBe('removed');
	});

	it('[<200ms] only reports without applying', async () => {
		const { calls, outcomes } = await run({ units: [unit()] }, false);
		expect(calls).toEqual([]);
		expect(outcomes[0]?.outcome).toBe('would-remove');
	});

	it('[<200ms] never lists a unit inside its owner lease window, empty or not', async () => {
		for (const standing of ['live', 'idle'] as const) {
			const { calls, outcomes } = await run({
				units: [
					unit({ standing, delivered: false, silentSeconds: 600 }),
				],
				empty: true,
			});
			expect(calls).toEqual([]);
			expect(outcomes).toEqual([]);
		}
	});

	it('[<200ms] ends an abandoned empty unit', async () => {
		const { calls } = await run({
			units: [unit({ standing: 'abandoned', delivered: false })],
			empty: true,
		});
		expect(calls).toEqual(['remove', 'dropForgeCopy']);
	});

	it('[<200ms] ends an abandoned unit whose tip the remote keeps as retired', async () => {
		const { calls } = await run({
			units: [unit({ standing: 'abandoned', delivered: false })],
			keptOnRemote: true,
		});
		expect(calls).toEqual(['remove', 'dropForgeCopy']);
	});

	it('[<200ms] keeps an abandoned unit carrying a commit of its own', async () => {
		const { outcomes } = await run({
			units: [unit({ standing: 'abandoned', delivered: false })],
		});
		expect(outcomes).toEqual([]);
	});

	it('[<200ms] ends a landed idle unit, whoever owns it', async () => {
		const { calls } = await run({
			units: [unit({ standing: 'idle', silentSeconds: 100 })],
			landed: true,
		});
		expect(calls).toEqual(['remove', 'dropForgeCopy']);
	});

	it('[<200ms] keeps an idle delivered unit that is not landed', async () => {
		const { outcomes } = await run({
			units: [unit({ standing: 'idle' })],
		});
		expect(outcomes).toEqual([]);
	});

	it('[<200ms] keeps a unit anybody is on and says it was kept', async () => {
		const { calls, outcomes } = await run({
			units: [unit()],
			alive: true,
		});
		expect(calls).toEqual([]);
		expect(outcomes[0]?.outcome).toBe('kept');
	});

	it('[<200ms] keeps a delivered unit holding an edit, naming it', async () => {
		const { calls, outcomes } = await run({
			units: [unit()],
			edited: ['a.ts'],
		});
		expect(calls).toEqual([]);
		expect(outcomes[0]).toMatchObject({
			outcome: 'kept',
			edited: ['a.ts'],
		});
	});

	it('[<200ms] keeps an abandoned unit edits on the forge before it leaves', async () => {
		const { calls, outcomes } = await run({
			units: [unit({ standing: 'abandoned', delivered: false })],
			edited: ['a.ts'],
			empty: true,
		});
		expect(calls).toEqual(['keepEdits', 'remove:editsKept']);
		expect(outcomes[0]).toMatchObject({
			outcome: 'retired',
			keptAt: 'refs/retired/x',
		});
	});

	it('[<200ms] reports an abandoned unit with edits as would-retire', async () => {
		const { calls, outcomes } = await run(
			{
				units: [unit({ standing: 'abandoned', delivered: false })],
				edited: ['a.ts'],
				empty: true,
			},
			false,
		);
		expect(calls).toEqual([]);
		expect(outcomes[0]?.outcome).toBe('would-retire');
	});

	it('[<200ms] leaves the unit where it is when its edits could not be kept', async () => {
		const { calls, outcomes } = await run({
			units: [unit({ standing: 'abandoned', delivered: false })],
			edited: ['a.ts'],
			empty: true,
			keepAt: undefined,
		});
		expect(calls).toEqual(['keepEdits']);
		expect(outcomes[0]?.outcome).toBe('kept');
	});

	it('[<200ms] keeps the forge copy when the removal kept the unit', async () => {
		const { calls, outcomes } = await run({
			units: [unit()],
			removed: false,
		});
		expect(calls).toEqual(['remove']);
		expect(outcomes[0]?.outcome).toBe('kept');
	});

	it('[<200ms] ends a unit with no worktree', async () => {
		const { calls } = await run({ units: [unit()], worktree: null });
		expect(calls).toEqual(['remove', 'dropForgeCopy']);
	});

	it('[<200ms] refuses an action that is no clone action', async () => {
		const { ports } = fake({ units: [] });
		const forge = new CloneForgeService(ports);
		await expect(
			forge.apply({ kind: 'create-branch', ref: REF }),
		).rejects.toThrow(/not a clone action/u);
	});
});
