/**
 * carried-units.service.spec.ts — a unit another unit of the same agent
 * published ends with that publication.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { endCarriedUnits } from '@delendai/core/lib/work-units/carried-units.service';
import { recordUnitEntered } from '@delendai/core/lib/work-units/unit-lease.service';

import {
	cleanUnitRepos,
	git,
	unitPolicy,
	unitRef,
	unitRepo,
} from './unit-repo.helper';

afterEach(cleanUnitRepos);

const exists = (root: string, ref: string): boolean =>
	git(root, 'branch', '--list', ref) !== '';

describe('endCarriedUnits', () => {
	it('ends the earlier unit a later one merged in, and leaves the rest', async () => {
		const repo = unitRepo();
		const earlier = unitRef('opus', 'x1-S7-g1', 'host');
		const later = unitRef('opus', 'x1-S5-g1', 'profile');
		const otherAgent = unitRef('glm', 'x1-S6-g1', 'theirs');
		const fresh = unitRef('opus', 'x1-S9-g1', 'just-entered');

		const earlierTree = repo.enter(earlier);
		repo.commit(earlierTree, 's7.ts');
		const laterTree = repo.enter(later);
		git(laterTree, 'merge', '-q', '--no-ff', '-m', 'take S7', earlier);
		repo.commit(laterTree, 's5.ts');
		const theirTree = repo.enter(otherAgent);
		git(theirTree, 'merge', '-q', '--ff-only', earlier);
		// Entered on top of the published tip, nothing committed yet.
		git(repo.root, 'update-ref', `refs/heads/${fresh}`, later);
		await recordUnitEntered({
			cwd: repo.root,
			ref: fresh,
			owner: { agent: 'opus', session: 's' },
			worktree: null,
			now: 1,
		});

		const steps = await endCarriedUnits({
			root: repo.root,
			cwd: repo.root,
			policy: unitPolicy,
			workRef: `refs/heads/${later}`,
			tip: git(repo.root, 'rev-parse', later),
			remote: 'origin',
		});

		expect(exists(repo.root, earlier)).toBe(false);
		expect(exists(repo.root, otherAgent)).toBe(true);
		expect(exists(repo.root, fresh)).toBe(true);
		expect(
			steps.some((step) => step.name === 'carried-remove-worktree'),
		).toBe(true);
	});
});
