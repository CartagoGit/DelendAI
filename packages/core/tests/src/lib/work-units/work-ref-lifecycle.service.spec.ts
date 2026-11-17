/**
 * work-ref-lifecycle.service.spec.ts — one table for a work ref's life,
 * and the readings every caller feeds it.
 */
import { describe, expect, it } from 'vitest';

import { createInMemoryGit, gitReadCacheOf } from '@delendai/test-kit';

import { resolveDevelopmentPolicy } from '@delendai/core/public';
import { withGitReadCache } from '@delendai/core/lib/shared/git-read.helper';

import type {
	IWorkRefFacts,
	IWorkRefFate,
} from '@delendai/core/lib/contracts/interfaces/work-ref-lifecycle.interface';
import { ABANDONED_UNIT_SILENCE_SECONDS } from '@delendai/core/lib/work-units/unit-lease.constant';
import {
	workRefFate,
	workRefLanded,
	workRefProposalOpen,
} from '@delendai/core/lib/integration/decisions/landed.helper';
import {
	landedForgeRefKept,
	silenceSince,
	workRefIntegrationRef,
	workRefOpenness,
} from '@delendai/core/lib/work-units/work-ref-lifecycle.service';

const facts = (over: Partial<IWorkRefFacts>): IWorkRefFacts => ({
	landed: false,
	onForge: true,
	openAtTip: false,
	openOnIntegration: false,
	worktree: 'none',
	...over,
});

describe('workRefFate', () => {
	const table: readonly [string, Partial<IWorkRefFacts>, IWorkRefFate][] = [
		[
			'open on the integration branch, on the forge',
			{ landed: true, openOnIntegration: true },
			'keep',
		],
		[
			'open on the integration branch, lost from the forge',
			{ landed: true, onForge: false, openOnIntegration: true },
			'restore',
		],
		[
			'open at its own unlanded tip, lost from the forge',
			{ onForge: false, openAtTip: true },
			'restore',
		],
		[
			'open at a landed tip only: history',
			{ landed: true, openAtTip: true },
			'reap',
		],
		[
			'open for others, landed, its unit silent past abandonment',
			{
				landed: true,
				openOnIntegration: true,
				silentSeconds: ABANDONED_UNIT_SILENCE_SECONDS + 1,
			},
			'reap',
		],
		[
			'open for others, landed, abandoned, lost from the forge: not put back',
			{
				landed: true,
				onForge: false,
				openOnIntegration: true,
				silentSeconds: ABANDONED_UNIT_SILENCE_SECONDS + 1,
			},
			'reap',
		],
		[
			'open, landed, silent but not yet abandoned',
			{
				landed: true,
				openOnIntegration: true,
				silentSeconds: ABANDONED_UNIT_SILENCE_SECONDS,
			},
			'keep',
		],
		[
			'open, abandoned, with work the integration branch lacks',
			{
				openOnIntegration: true,
				silentSeconds: ABANDONED_UNIT_SILENCE_SECONDS * 2,
			},
			'keep',
		],
		['holding work the integration branch lacks', {}, 'keep'],
		['not on the forge, with work of its own', { onForge: false }, 'keep'],
		[
			'landed and closed, a checkout in use',
			{ landed: true, worktree: 'in-use' },
			'withdraw',
		],
		[
			'landed and closed, a clean worktree',
			{ landed: true, worktree: 'clean' },
			'reap',
		],
		['landed and closed, no worktree', { landed: true }, 'reap'],
	];
	it.each(table)('[<50ms] %s', (_name, over, fate) => {
		const verdict = workRefFate(facts(over));
		expect(verdict.fate).toBe(fate);
		expect(verdict.reason.length).toBeGreaterThan(0);
	});

	it('[<5ms] reads a landed ref by the integration branch alone', () => {
		expect(
			workRefProposalOpen({
				landed: true,
				openAtTip: true,
				openOnIntegration: false,
			}),
		).toBe(false);
		expect(
			workRefProposalOpen({
				landed: false,
				openAtTip: true,
				openOnIntegration: false,
			}),
		).toBe(true);
	});
});

describe('reading a clone', () => {
	const policy = resolveDevelopmentPolicy({
		development: {
			profile: 'shared-checkout-pr',
			branches: { namespacePrefix: 'delendai' },
		},
	});
	const ref = 'delendai/wip/glm-5.3-flash/implement/x00001-all-g1/thing';
	const PROPOSAL = (folder: string): string =>
		`docs/delendai/proposals/${folder}/x00001-thing.md`;

	/**
	 * What git says of a clone whose `refs/remotes/origin/*` stand where a
	 * fetch put them: the proposal's folder at the ref's tip and on the
	 * integration branch, and when the tip was committed. Answered from a
	 * table, so no process runs and the time is the code's own.
	 */
	const reading = <T>(
		folders: { onIntegration: string; atTip: string },
		body: () => T,
		tipCommittedAt: number = Math.floor(Date.now() / 1000),
	): T =>
		withGitReadCache(
			gitReadCacheOf(
				createInMemoryGit({
					[`log -1 --format=%ct refs/remotes/origin/${ref}`]:
						String(tipCommittedAt),
					[`ls-tree -r --name-only refs/remotes/origin/${ref}`]:
						PROPOSAL(folders.atTip),
					'ls-tree -r --name-only refs/remotes/origin/develop':
						PROPOSAL(folders.onIntegration),
				}),
			),
			body,
		);
	const kept = (
		folders: { onIntegration: string; atTip: string },
		named = ref,
	): boolean =>
		reading(folders, () =>
			landedForgeRefKept('/clone', policy, 'origin', 'develop', named),
		);

	it('[<178ms] takes both readings of the proposal', () => {
		expect(
			reading(
				{ onIntegration: 'ready/fixes', atTip: 'in-progress' },
				() =>
					workRefOpenness(
						'/clone',
						'x00001',
						`refs/remotes/origin/${ref}`,
						'refs/remotes/origin/develop',
					),
			),
		).toMatchObject({ openAtTip: true, openOnIntegration: false });
	});

	it('[<162ms] reads how long the tip has been silent', () => {
		const silent = reading(
			{ onIntegration: 'in-progress', atTip: 'in-progress' },
			() =>
				workRefOpenness(
					'/clone',
					'x00001',
					`refs/remotes/origin/${ref}`,
					'refs/remotes/origin/develop',
				),
		).silentSeconds;
		expect(silent).toBeGreaterThanOrEqual(0);
		expect(silent).toBeLessThan(ABANDONED_UNIT_SILENCE_SECONDS);
	});

	it('[<200ms] lets a landed ref of an open proposal go once its unit is abandoned', () => {
		// a00095 kept every finished reviewer's ref for days: the audit
		// stayed in progress while others were still at work.
		const year2000 = 946_684_800;
		expect(
			reading(
				{ onIntegration: 'in-progress', atTip: 'in-progress' },
				() =>
					landedForgeRefKept(
						'/clone',
						policy,
						'origin',
						'develop',
						ref,
					),
				year2000,
			),
		).toBe(false);
	});

	it('[<149ms] keeps a landed forge ref while the integration branch holds its proposal in progress', () => {
		expect(
			kept({ onIntegration: 'in-progress', atTip: 'ready/fixes' }),
		).toBe(true);
	});

	it('[<170ms] lets a landed forge ref go once the integration branch moved its proposal on', () => {
		expect(kept({ onIntegration: 'review', atTip: 'in-progress' })).toBe(
			false,
		);
	});

	it('[<148ms] lets a ref that names no unit go', () => {
		expect(
			kept(
				{ onIntegration: 'in-progress', atTip: 'in-progress' },
				'feature/x',
			),
		).toBe(false);
	});
});

describe('silenceSince', () => {
	it('[<5ms] counts seconds from a commit time, and knows nothing from garbage', () => {
		expect(silenceSince('100\n', 160_000)).toBe(60);
		expect(silenceSince('200', 100_000)).toBe(0);
		expect(silenceSince(undefined)).toBeUndefined();
		expect(silenceSince('not a time')).toBeUndefined();
	});
});

describe('workRefLanded', () => {
	const base = {
		atIntegrationTip: false,
		contained: false,
		changesNothing: false,
		meaningInCommits: false,
	};
	it('[<5ms] never counts a ref at the integration tip', () => {
		expect(
			workRefLanded({ ...base, atIntegrationTip: true, contained: true }),
		).toBe(false);
	});
	it('[<5ms] counts a contained ref and one that adds no file', () => {
		expect(workRefLanded({ ...base, contained: true })).toBe(true);
		expect(workRefLanded({ ...base, changesNothing: true })).toBe(true);
	});
	it('[<5ms] settles a ref whose commits carry meaning only by containment', () => {
		expect(
			workRefLanded({
				...base,
				changesNothing: true,
				meaningInCommits: true,
			}),
		).toBe(false);
	});
	it('[<6ms] reads the forge integration branch when the clone has it', () => {
		expect(workRefIntegrationRef('origin', 'develop', true)).toBe(
			'refs/remotes/origin/develop',
		);
		expect(workRefIntegrationRef('origin', 'develop', false)).toBe(
			'refs/heads/develop',
		);
	});
});
