/**
 * forward-sync-release.script.spec.ts — the decision that runs before
 * anything is pushed: in sync, history only, real content, or a conflict
 * nobody but a person may resolve.
 */
import { describe, expect, it } from 'vitest';

import {
	FORWARD_SYNC_REF_PREFIX,
	forwardSyncBody,
	forwardSyncExplanation,
	forwardSyncRef,
	forwardSyncTitle,
	forwardSyncVerdict,
	type IForwardSyncVerdict,
	openCandidate,
} from './forward-sync-release.script';

const BRANCHES = { integration: 'develop', release: 'main' };
const RELEASE_SHA = 'c7eda197a0123456789abcdef0123456789abcde';

describe('forwardSyncVerdict', () => {
	it('is in sync when the release tip is already in the integration history', () => {
		expect(
			forwardSyncVerdict({
				releaseIsAncestor: true,
				conflicts: true,
				treeChanges: true,
			}),
		).toBe('in-sync');
	});

	it('names a merge that stopped as a conflict, before looking at trees', () => {
		expect(
			forwardSyncVerdict({
				releaseIsAncestor: false,
				conflicts: true,
				treeChanges: false,
			}),
		).toBe('conflict');
	});

	it('tells history-only drift from drift that carries changes', () => {
		// Measured on 2026-09-15: main's only exclusive commit was the merge
		// of #178, and merging it into develop left the tree byte-identical.
		expect(
			forwardSyncVerdict({
				releaseIsAncestor: false,
				conflicts: false,
				treeChanges: false,
			}),
		).toBe('ancestry-only');
		expect(
			forwardSyncVerdict({
				releaseIsAncestor: false,
				conflicts: false,
				treeChanges: true,
			}),
		).toBe('content');
	});
});

describe('forwardSyncRef', () => {
	it('lives in the namespace the forge lets a workflow create refs in', () => {
		expect(forwardSyncRef(RELEASE_SHA)).toBe(
			`${FORWARD_SYNC_REF_PREFIX}c7eda197a`,
		);
		expect(FORWARD_SYNC_REF_PREFIX.startsWith('delendai/pr/')).toBe(true);
	});
});

describe('the words that travel with the verdict', () => {
	const verdicts: readonly IForwardSyncVerdict[] = [
		'in-sync',
		'ancestry-only',
		'content',
		'conflict',
	];

	it('names both branches and the release tip for every verdict', () => {
		for (const verdict of verdicts) {
			const line = forwardSyncExplanation(verdict, BRANCHES, RELEASE_SHA);
			expect(line).toContain('main (c7eda197a)');
			expect(line).toContain('develop');
		}
	});

	it('titles the pull request as a conventional commit', () => {
		expect(forwardSyncTitle(BRANCHES, RELEASE_SHA)).toBe(
			'chore(release): forward-sync main c7eda197a into develop',
		);
	});

	it('says why an empty pull request is not the #100 shape, and asks for review otherwise', () => {
		expect(
			forwardSyncBody('ancestry-only', BRANCHES, RELEASE_SHA),
		).toContain('lint:candidate-delivers');
		expect(forwardSyncBody('content', BRANCHES, RELEASE_SHA)).toContain(
			'Review the diff',
		);
	});
});

/**
 * x00557 S4 — never arm auto-merge behind a check that will not arrive.
 *
 * Auto-merge is a standing promise to land a branch as soon as its checks
 * pass. Armed behind a check nobody started, it waits forever and looks
 * exactly like a slow queue: no red mark, no pending run, nobody looking.
 * So the order is the behaviour, and the order is what these pin.
 */
describe('openCandidate (x00557 S4)', () => {
	const BRANCHES = { integration: 'develop', release: 'main' } as const;

	const harness = (over: {
		readonly inActions: boolean;
		readonly failing?: string;
	}) => {
		const calls: string[] = [];
		const refusals: string[][] = [];
		const code = openCandidate(
			'content',
			BRANCHES,
			'abc1234',
			'delendai/pr/forward-sync-abc1234',
			{
				inActions: () => over.inActions,
				log: () => undefined,
				refuse: (lines) => {
					refusals.push([...lines]);
					return 1;
				},
				run: (command, args) => {
					const label = `${command} ${args.join(' ')}`;
					calls.push(label);
					return over.failing !== undefined &&
						label.includes(over.failing)
						? { ok: false, out: '', err: 'the forge said no' }
						: { ok: true, out: 'https://pr/1', err: '' };
				},
			},
		);
		return { code, calls, refusals };
	};

	it('starts the required check BEFORE arming auto-merge', () => {
		const { code, calls } = harness({ inActions: true });

		expect(code).toBe(0);
		// The order IS the behaviour: create, start the check, then arm.
		expect(
			calls.map((call) => call.split(' ').slice(0, 3).join(' ')),
		).toStrictEqual(['gh pr create', 'gh workflow run', 'gh pr merge']);
	});

	it('does not arm at all when the check could not be started', () => {
		const { code, calls, refusals } = harness({
			inActions: true,
			failing: 'workflow run',
		});

		expect(code).not.toBe(0);
		// The point: no `pr merge --auto` anywhere. Before this, the arming
		// had already happened by the time the dispatch was attempted.
		expect(calls.some((call) => call.includes('--auto'))).toBe(false);
		expect(refusals[0]?.join('\n')).toContain('needs a person');
	});

	it('arms without dispatching outside a workflow run, where a push builds on its own', () => {
		const { code, calls } = harness({ inActions: false });

		expect(code).toBe(0);
		expect(calls.some((call) => call.includes('workflow run'))).toBe(false);
		expect(calls.at(-1)).toContain('--auto');
	});

	it('never dispatches when the pull request was not opened', () => {
		const { code, calls } = harness({
			inActions: true,
			failing: 'pr create',
		});

		expect(code).not.toBe(0);
		expect(calls).toHaveLength(1);
		expect(calls[0]).toContain('pr create');
	});
});
