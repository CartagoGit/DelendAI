/**
 * integrated-work-refs.persistence.spec.ts — a work ref ends when its work
 * is integrated, locally and on the remote.
 *
 * Reproduces the adopter project's sequence against a real repository and
 * a bare remote: a slice is checkpointed and published, then the same
 * change is committed straight to the integration branch as a different
 * commit. The next checkpoint must remove the first ref everywhere, and
 * must keep a ref whose work is not integrated.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { createWriteGitRunner, UNANCHORED } from '@delendai/core/public';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';

import { isWorkIntegrated } from '../../../../src/lib/services/integrated-work-refs.service';
import { bindWipCheckpointPort } from '../../../../src/lib/persistence/wip-binding';
import { createPolicyPersistence } from '../../../../src/lib/persistence/wip-persistence';
import { createTempGitRepo } from '../../../integration/_fixtures/git-tmp';

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
	while (cleanups.length > 0) await cleanups.pop()?.();
});

const setup = async () => {
	const repo = await createTempGitRepo({ branch: 'develop' });
	const remote = await mkdtemp(join(tmpdir(), 'integrated-refs-remote-'));
	cleanups.push(async () => {
		await repo.cleanup();
		await rm(remote, { recursive: true, force: true });
	});
	await execFileAsync('git', ['init', '--bare'], { cwd: remote });
	await repo.git('remote', 'add', 'origin', remote);
	await repo.git('push', '--quiet', '-u', 'origin', 'develop');
	const wip = await bindWipCheckpointPort(repo.cwd, UNANCHORED);
	if (wip === undefined) throw new Error('wip engine did not bind');
	const policy = expandProfile('shared-checkout-merge');
	const persistence = createPolicyPersistence({
		policy,
		run: createWriteGitRunner(repo.cwd),
		wip,
		agentId: 'agent-a',
	});
	if (persistence === undefined) throw new Error('expected a port');
	const checkpoint = async (sliceId: string, file: string) => {
		await writeFile(
			join(repo.cwd, file),
			`export const v = '${sliceId}';\n`,
		);
		const outcome = await persistence.persist({
			triggerKind: 'slice',
			proposalId: 'x00001',
			sliceId,
			message: `feat(x00001): commit via slice ${sliceId}`,
			claimedPaths: [file],
			eventId: `event-${sliceId}`,
		});
		if (!outcome.handled || outcome.status === 'refused') {
			throw new Error(`checkpoint refused: ${JSON.stringify(outcome)}`);
		}
		return outcome.report;
	};
	const refsEverywhere = async () => ({
		local: await repo.git(
			'for-each-ref',
			'--format=%(refname)',
			'refs/heads/wip/',
		),
		remote: await repo.git('ls-remote', 'origin', 'refs/heads/wip/*'),
	});
	return { repo, policy, checkpoint, refsEverywhere };
};

describe('integrated work refs are removed at the next checkpoint', () => {
	it('removes a ref whose change reached develop as a different commit, and keeps unintegrated work', async () => {
		const { repo, policy, checkpoint, refsEverywhere } = await setup();
		expect(policy.persistence.usesWipRefs).toBe(true);

		const first = await checkpoint('S1', 'a.ts');
		// The agent also commits the same change straight to develop.
		await repo.git('add', '--', 'a.ts');
		await repo.git('commit', '-q', '-m', 'feat: a (committed directly)');
		const unintegrated = await checkpoint('S2', 'b.ts');
		const before = await refsEverywhere();
		// S2's checkpoint already ran the sweep against the new develop head.
		expect(before.local).not.toContain(first.ref);
		expect(before.remote).not.toContain(first.ref);
		expect(unintegrated.reaped?.removedLocal).toEqual([first.ref]);
		expect(unintegrated.reaped?.removedRemote).toEqual([first.ref]);

		const third = await checkpoint('S3', 'c.ts');
		const after = await refsEverywhere();
		// Unintegrated work survives every sweep, locally and remotely.
		expect(after.local).toContain(unintegrated.ref);
		expect(after.remote).toContain(unintegrated.ref);
		expect(after.local).toContain(third.ref);
		expect(third.reaped?.failures).toEqual([]);
	});
});

describe('isWorkIntegrated', () => {
	it('answers from git: ancestry, same content, or neither', async () => {
		const repo = await createTempGitRepo({ branch: 'develop' });
		cleanups.push(repo.cleanup);
		const run = createWriteGitRunner(repo.cwd);
		const base = await repo.readHead();

		await repo.git('checkout', '-q', '-b', 'work');
		await writeFile(join(repo.cwd, 'x.ts'), 'export const x = 1;\n');
		await repo.git('add', '--', 'x.ts');
		await repo.git('commit', '-q', '-m', 'feat: x');
		const work = await repo.readHead();
		await repo.git('checkout', '-q', 'develop');
		expect(await isWorkIntegrated(run, work, base)).toBe(false);

		// Same content, different commit.
		await writeFile(join(repo.cwd, 'x.ts'), 'export const x = 1;\n');
		await repo.git('add', '--', 'x.ts');
		await repo.git('commit', '-q', '-m', 'feat: x again');
		expect(await isWorkIntegrated(run, work, await repo.readHead())).toBe(
			true,
		);

		// Integration moved on and changed the same file: not proven.
		await writeFile(join(repo.cwd, 'x.ts'), 'export const x = 2;\n');
		await repo.git('add', '--', 'x.ts');
		await repo.git('commit', '-q', '-m', 'feat: x changed');
		expect(await isWorkIntegrated(run, work, await repo.readHead())).toBe(
			false,
		);

		// Ancestry.
		expect(await isWorkIntegrated(run, base, await repo.readHead())).toBe(
			true,
		);
	});
});
