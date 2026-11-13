/**
 * shared-checkout.persistence.spec.ts — a slice event checkpoints nothing
 * from the shared checkout when every unit has its own worktree (x01003).
 *
 * On 2026-10-28 a `package.json` hunk another agent left in the shared
 * checkout was committed into two units' refs by slice persistence, which
 * took the slice's declared files from there, whoever had changed them.
 * Driven against a real repository: one file, two writers.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { sharedCheckoutCheckpointRefusal } from '@delendai/core/cli';
import { createWriteGitRunner, UNANCHORED } from '@delendai/core/public';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';

import { bindWipCheckpointPort } from '../../../../src/lib/persistence/wip-binding';
import { createPolicyPersistence } from '../../../../src/lib/persistence/wip-persistence';
import { createTempGitRepo } from '../../../integration/_fixtures/git-tmp';

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
	while (cleanups.length > 0) await cleanups.pop()?.();
});

describe('slice persistence from the shared checkout (x01003)', () => {
	it('checkpoints none of a file two writers changed, and says which and why', async () => {
		const repo = await createTempGitRepo({ branch: 'develop' });
		cleanups.push(() => repo.cleanup());
		await writeFile(join(repo.cwd, 'package.json'), '{}\n');
		await writeFile(join(repo.cwd, 'a.ts'), 'export {};\n');
		await repo.git('add', '--', 'package.json', 'a.ts');
		await repo.git('commit', '-q', '-m', 'chore: base');
		// The unit's own worktree, on its work ref, holds its change.
		const ref = 'delendai/wip/agent-a/implement/x00001-S1-g1/probe';
		const unit = join(repo.cwd, '.cache', 'delendai', 'unit');
		await mkdir(join(repo.cwd, '.cache', 'delendai'), { recursive: true });
		await repo.git('worktree', 'add', '-q', '-b', ref, unit);
		await writeFile(join(unit, 'package.json'), '{ "unit": true }\n');
		// Somebody else changed the same file in the shared checkout.
		await writeFile(join(repo.cwd, 'package.json'), '{ "other": true }\n');
		const policy = expandProfile('shared-checkout-pr');
		const wip = await bindWipCheckpointPort(repo.cwd, UNANCHORED);
		if (wip === undefined) throw new Error('wip engine did not bind');
		const persistence = createPolicyPersistence({
			policy,
			run: createWriteGitRunner(repo.cwd),
			wip,
			agentId: 'agent-a',
			sliceOwnership: async () => ({ others: [], own: ref }),
			checkoutRefusal: (input) =>
				sharedCheckoutCheckpointRefusal({
					root: repo.cwd,
					policy,
					...input,
				}),
		});
		if (persistence === undefined) throw new Error('expected a port');
		const before = (await repo.git('rev-parse', ref)).trim();

		const outcome = await persistence.persist({
			triggerKind: 'slice',
			proposalId: 'x00001',
			sliceId: 'S1',
			message: 'feat(x00001): slice S1',
			claimedPaths: ['package.json', 'a.ts'],
			eventId: 'event-S1',
		});

		expect(outcome.handled && outcome.status).toBe('refused');
		if (!outcome.handled || outcome.status !== 'refused') return;
		expect(outcome.code).toBe('WIP_SHARED_CHECKOUT');
		expect(outcome.reason).toContain(
			'package.json: edited here, and nothing proves the unit wrote it',
		);
		expect(outcome.reason).toContain('a.ts: unchanged here');
		expect(outcome.remedy).toContain(unit);
		expect((await repo.git('rev-parse', ref)).trim()).toBe(before);
	});
});
