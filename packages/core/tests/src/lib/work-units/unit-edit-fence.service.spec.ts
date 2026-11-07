/**
 * unit-edit-fence.service.spec.ts — an agent that holds a unit writes only
 * inside its unit's worktree (x01003). Real git, real worktrees.
 */
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { editOutsideUnitRefusal } from '@delendai/core/lib/work-units/unit-edit-fence.service';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';
import {
	cleanUnitRepos,
	unitPolicy,
	unitRef,
	unitRepo,
} from './unit-repo.helper';

afterEach(cleanUnitRepos);

const AGENT = 'claude-opus-5-5';

describe('editOutsideUnitRefusal', () => {
	it('refuses a write in the shared checkout by an agent that holds a unit, naming its worktree', () => {
		const repo = unitRepo();
		const mine = repo.enter(unitRef(AGENT));
		const refusal = editOutsideUnitRefusal({
			cwd: repo.root,
			path: join(repo.root, 'base.ts'),
			agent: AGENT,
			policy: unitPolicy,
		});
		expect(refusal?.reason).toContain('outside the worktree of the unit');
		expect(refusal?.remedy).toContain(mine);
	});

	it("refuses a write into another agent's unit", () => {
		const repo = unitRepo();
		repo.enter(unitRef(AGENT));
		const theirs = repo.enter(unitRef('gpt-6', 'x2-S1-g1'));
		expect(
			editOutsideUnitRefusal({
				cwd: repo.root,
				path: join(theirs, 'base.ts'),
				agent: AGENT,
				policy: unitPolicy,
			}),
		).toBeDefined();
	});

	it('lets the write go ahead inside its own unit, outside the repository, or with no unit held', () => {
		const repo = unitRepo();
		const mine = repo.enter(unitRef(AGENT));
		const ask = (path: string, agent = AGENT) =>
			editOutsideUnitRefusal({
				cwd: repo.root,
				path,
				agent,
				policy: unitPolicy,
			});
		expect(ask(join(mine, 'base.ts'))).toBeUndefined();
		expect(ask('/tmp/scratch/notes.txt')).toBeUndefined();
		expect(ask(join(repo.root, 'base.ts'), 'gpt-6')).toBeUndefined();
		expect(ask(join(repo.root, 'base.ts'), '')).toBeUndefined();
	});

	it('asks nothing where no unit has a worktree', () => {
		const repo = unitRepo();
		repo.enter(unitRef(AGENT));
		expect(
			editOutsideUnitRefusal({
				cwd: repo.root,
				path: join(repo.root, 'base.ts'),
				agent: AGENT,
				policy: expandProfile('shared-direct'),
			}),
		).toBeUndefined();
	});
});
