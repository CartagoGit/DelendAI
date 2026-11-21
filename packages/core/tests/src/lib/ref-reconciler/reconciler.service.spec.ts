/**
 * reconciler.service.spec.ts — every transition of a ref and a unit, over
 * a fake forge, and the two guarantees: a second pass changes nothing, and
 * no pass deletes a commit that exists nowhere else.
 */
import { describe, expect, it } from 'vitest';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import type {
	IReconcileAction,
	IReconcilerUnit,
	IRefForge,
	IRefSnapshot,
} from '@delendai/core/lib/contracts/interfaces/ref-reconciler.interface';
import type {
	IObservedPullRequest,
	IObservedRef,
} from '@delendai/core/lib/ref-lifecycle/reconcile.interface';
import { RefReconcilerService } from '@delendai/core/lib/ref-reconciler/reconciler.service';
import { refKindOf } from '@delendai/core/lib/ref-reconciler/desired-state.helper';
import { REF_KINDS } from '@delendai/core/lib/contracts/constants/ref-kinds.constant';

const branches = resolveDevelopmentPolicy({
	development: { branches: { namespacePrefix: 'delendai' } },
}).branches;
const NOW = 1_000_000;

const unit = (over: Partial<IReconcilerUnit> = {}): IReconcilerUnit => ({
	ref: 'delendai/wip/m/x1-S1-g1/t',
	hasBranch: true,
	worktree: 'clean',
	tip: 'aaa',
	landed: false,
	holdsWork: true,
	behind: false,
	retired: false,
	tipHeldElsewhere: false,
	silentSeconds: 0,
	...over,
});

/** A forge that applies every action to its own state. */
class FakeForge implements IRefForge {
	readonly applied: IReconcileAction[] = [];
	readonly keptTips: string[] = [];
	constructor(
		public units: IReconcilerUnit[],
		public refs: IObservedRef[] = [],
		public pullRequests: IObservedPullRequest[] = [],
	) {}

	snapshot(): Promise<IRefSnapshot> {
		return Promise.resolve({
			units: this.units,
			refs: this.refs,
			pullRequests: this.pullRequests,
			now: NOW,
		});
	}

	apply(action: IReconcileAction): Promise<void> {
		this.applied.push(action);
		const index = this.units.findIndex((u) => u.ref === action.ref);
		const current = this.units[index];
		const set = (over: Partial<IReconcilerUnit>): void => {
			if (current !== undefined)
				this.units[index] = { ...current, ...over };
		};
		switch (action.kind) {
			case 'create-branch':
				set({ hasBranch: true, tip: 'bbb', holdsWork: false });
				break;
			case 'create-worktree':
				set({ worktree: 'clean' });
				break;
			case 'fast-forward':
				set({ behind: false });
				break;
			case 'keep-tip':
				this.keptTips.push(action.sha);
				break;
			case 'remove-worktree':
				set({ worktree: 'none' });
				break;
			case 'delete-branch':
				this.units.splice(index, 1);
				break;
			case 'delete-forge-ref':
				this.refs = this.refs.filter((r) => r.name !== action.ref);
				break;
		}
		return Promise.resolve();
	}
}

const run = async (forge: FakeForge): Promise<readonly IReconcileAction[]> => {
	const before = forge.applied.length;
	await new RefReconcilerService(forge, branches, {
		emptyUnitGraceSeconds: 1800,
	}).pass();
	return forge.applied.slice(before);
};

describe('the reconciler, unit transitions', () => {
	it('[<200ms] creates the branch and worktree of a registered unit that has none', async () => {
		const forge = new FakeForge([
			unit({ hasBranch: false, worktree: 'none', tip: undefined }),
		]);
		expect((await run(forge)).map((a) => a.kind)).toEqual([
			'create-branch',
			'create-worktree',
		]);
	});

	it('[<200ms] fast-forwards a unit that holds nothing of its own when the integration branch moved', async () => {
		const forge = new FakeForge([
			unit({ behind: true, holdsWork: false, silentSeconds: 5 }),
		]);
		expect((await run(forge)).map((a) => a.kind)).toEqual(['fast-forward']);
	});

	it('[<200ms] reports, and does not touch, a unit that holds work when the integration branch moved', async () => {
		const forge = new FakeForge([unit({ behind: true })]);
		const desired = await new RefReconcilerService(forge, branches).pass();
		expect(forge.applied).toEqual([]);
		expect(desired.reported[0]?.reason).toContain('holds work');
	});

	it('[<200ms] deletes a landed unit with its clean worktree, its tip held by the integration branch', async () => {
		const forge = new FakeForge([
			unit({ landed: true, tipHeldElsewhere: true }),
		]);
		expect((await run(forge)).map((a) => a.kind)).toEqual([
			'remove-worktree',
			'delete-branch',
		]);
		expect(forge.keptTips).toEqual([]);
	});

	it('[<200ms] keeps the tip under the retired namespace when the pull request closed unmerged', async () => {
		const forge = new FakeForge([unit({ pullRequest: 'closed' })]);
		expect((await run(forge)).map((a) => a.kind)).toEqual([
			'keep-tip',
			'remove-worktree',
			'delete-branch',
		]);
		expect(forge.keptTips).toEqual(['aaa']);
	});

	it('[<200ms] retires a unit that was retired, keeping its tip', async () => {
		const forge = new FakeForge([unit({ retired: true })]);
		await run(forge);
		expect(forge.keptTips).toEqual(['aaa']);
		expect(forge.units).toEqual([]);
	});

	it('[<200ms] retires an empty unit with a clean worktree past the grace, never leaving it on disk', async () => {
		const forge = new FakeForge([
			unit({
				holdsWork: false,
				tipHeldElsewhere: true,
				silentSeconds: 4000,
			}),
		]);
		expect((await run(forge)).map((a) => a.kind)).toEqual([
			'remove-worktree',
			'delete-branch',
		]);
	});

	it('[<200ms] leaves a freshly entered empty unit alone', async () => {
		const forge = new FakeForge([
			unit({ holdsWork: false, silentSeconds: 10 }),
		]);
		expect(await run(forge)).toEqual([]);
	});

	it('[<200ms] keeps an ended unit whose worktree is in use, and says so', async () => {
		const forge = new FakeForge([
			unit({ landed: true, worktree: 'in-use', tipHeldElsewhere: true }),
		]);
		const desired = await new RefReconcilerService(forge, branches).pass();
		expect(forge.applied).toEqual([]);
		expect(desired.reported[0]?.reason).toContain('in use');
	});

	it('[<200ms] deletes nothing whose tip is unknown', async () => {
		const forge = new FakeForge([unit({ retired: true, tip: undefined })]);
		await run(forge);
		expect(forge.applied).toEqual([]);
	});
});

describe('the reconciler, forge refs', () => {
	const merged: IObservedPullRequest = {
		number: 3,
		headRefName: 'delendai/pr/x1-t',
		state: 'merged',
		headSha: 'ccc',
	};

	it('[<200ms] deletes a publication ref whose pull request merged', async () => {
		const forge = new FakeForge(
			[],
			[{ name: 'delendai/pr/x1-t', sha: 'ccc' }],
			[merged],
		);
		expect(await run(forge)).toEqual([
			{ kind: 'delete-forge-ref', ref: 'delendai/pr/x1-t' },
		]);
	});

	it('[<200ms] keeps and reports a ref with no pull request that may hold the only copy', async () => {
		const forge = new FakeForge([], [{ name: 'feat/stray', sha: 'ddd' }]);
		const desired = await new RefReconcilerService(forge, branches).pass();
		expect(forge.applied).toEqual([]);
		expect(desired.reported.map((r) => r.ref)).toEqual(['feat/stray']);
	});

	it('[<200ms] keeps a retired-namespace tip that holds a commit nothing else holds', async () => {
		const forge = new FakeForge(
			[],
			[{ name: 'delendai/train/old', sha: 'eee', contained: false }],
		);
		await run(forge);
		expect(forge.refs).toHaveLength(1);
	});

	it('[<200ms] keeps the tip of a publication closed without merging before deleting its branch', async () => {
		const forge = new FakeForge(
			[],
			[{ name: 'delendai/pr/x2-t', sha: 'fff' }],
			[
				{
					number: 4,
					headRefName: 'delendai/pr/x2-t',
					state: 'closed',
					headSha: 'fff',
					closedAt: NOW - 100_000,
				},
			],
		);
		expect((await run(forge)).map((a) => a.kind)).toEqual([
			'keep-tip',
			'delete-forge-ref',
		]);
		expect(forge.keptTips).toEqual(['fff']);
	});
});

describe('the reconciler, convergence', () => {
	it('[<200ms] a pass run twice changes nothing the second time', async () => {
		const forge = new FakeForge(
			[
				unit({
					ref: 'a',
					hasBranch: false,
					worktree: 'none',
					tip: undefined,
				}),
				unit({
					ref: 'b',
					behind: true,
					holdsWork: false,
					silentSeconds: 1,
				}),
				unit({ ref: 'c', pullRequest: 'closed' }),
				unit({ ref: 'd', landed: true, tipHeldElsewhere: true }),
			],
			[{ name: 'delendai/pr/x1-t', sha: 'ccc' }],
			[
				{
					number: 3,
					headRefName: 'delendai/pr/x1-t',
					state: 'merged',
					headSha: 'ccc',
				},
			],
		);
		expect((await run(forge)).length).toBeGreaterThan(0);
		expect(await run(forge)).toEqual([]);
	});

	it('[<200ms] no applied deletion leaves a tip held nowhere unkept', async () => {
		const forge = new FakeForge([
			unit({ ref: 'c', pullRequest: 'closed', tip: 'zzz' }),
			unit({ ref: 'r', retired: true, tip: 'yyy' }),
		]);
		await run(forge);
		expect(forge.keptTips.sort()).toEqual(['yyy', 'zzz']);
	});
});

describe('ref kinds', () => {
	it('[<200ms] names the kind of a ref under the namespace and none for an unlisted folder', () => {
		expect(refKindOf('delendai/wip/m/x', 'delendai')?.kind).toBe('work');
		expect(refKindOf('delendai/pr/x', 'delendai')?.kind).toBe(
			'publication',
		);
		expect(refKindOf('delendai/mystery/x', 'delendai')).toBeUndefined();
		expect(refKindOf('other/wip/x', 'delendai')).toBeUndefined();
	});

	it('[<200ms] lists every kind once', () => {
		const segments = REF_KINDS.map((k) => k.segment);
		expect(new Set(segments).size).toBe(segments.length);
	});
});
