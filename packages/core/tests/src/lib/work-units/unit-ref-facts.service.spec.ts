/**
 * unit-ref-facts.service.spec.ts — what the push guard learns about the
 * unit a pushed ref belongs to, from real refs and a real lease.
 */
import { afterEach, describe, expect, it } from 'vitest';

import { recordUnitEntered } from '@delendai/core/lib/work-units/unit-lease.service';
import { readUnitRefFacts } from '@delendai/core/lib/work-units/unit-ref-facts.service';

import {
	cleanUnitRepos,
	git,
	unitPolicy,
	unitRef,
	unitRepo,
} from './unit-repo.helper';

afterEach(cleanUnitRepos);

describe('readUnitRefFacts', () => {
	it('names the leased ref and the siblings of the unit, and nothing for a foreign ref', async () => {
		const repo = unitRepo();
		const real = unitRef('a', 'x1-S1-g1', 'real');
		const scratch = unitRef('a', 'x1-S1-g1', 'sim-a');
		await recordUnitEntered({
			cwd: repo.root,
			ref: real,
			owner: { agent: 'a', session: 's' },
			worktree: repo.enter(real),
		});
		git(repo.root, 'update-ref', `refs/heads/${scratch}`, 'develop');
		const facts = await readUnitRefFacts(repo.root, unitPolicy, scratch);
		expect(facts).toEqual({ siblings: [real], leasedRef: real });
		const other = await readUnitRefFacts(
			repo.root,
			unitPolicy,
			unitRef('b', 'x2-S1-g1'),
		);
		expect(other).toEqual({ siblings: [] });
		expect(
			await readUnitRefFacts(repo.root, unitPolicy, 'feature/plain'),
		).toBeUndefined();
	});
});
