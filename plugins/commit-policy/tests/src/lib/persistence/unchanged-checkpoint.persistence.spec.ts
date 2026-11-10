/**
 * unchanged-checkpoint.persistence.spec.ts — a checkpoint of nothing
 * publishes nothing (x00627 S1).
 *
 * Measured on 2026-09-23: the remote received a work ref pointing exactly
 * at the integration branch's tip, with no commit of its own, and every
 * open pull request's ref-lifecycle job went red over it. The WIP engine
 * already answered `unchanged` without a local ref; the persistence layer
 * above it published `result.commit` (the base) anyway. Driven here against
 * a real repository and a bare remote.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { createWriteGitRunner, UNANCHORED } from '@delendai/core/public';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';

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
	const remote = await mkdtemp(
		join(tmpdir(), 'unchanged-checkpoint-remote-'),
	);
	cleanups.push(async () => {
		await repo.cleanup();
		await rm(remote, { recursive: true, force: true });
	});
	await execFileAsync('git', ['init', '--bare'], { cwd: remote });
	await writeFile(join(repo.cwd, 'a.ts'), "export const v = 'base';\n");
	await repo.git('add', '--', 'a.ts');
	await repo.git('commit', '-q', '-m', 'chore: base');
	await repo.git('remote', 'add', 'origin', remote);
	await repo.git('push', '--quiet', '-u', 'origin', 'develop');
	const wip = await bindWipCheckpointPort(repo.cwd, UNANCHORED);
	if (wip === undefined) throw new Error('wip engine did not bind');
	const persistence = createPolicyPersistence({
		policy: expandProfile('shared-checkout-merge'),
		run: createWriteGitRunner(repo.cwd),
		wip,
		agentId: 'agent-a',
	});
	if (persistence === undefined) throw new Error('expected a port');
	const persist = (sliceId: string) =>
		persistence.persist({
			triggerKind: 'slice',
			proposalId: 'x00001',
			sliceId,
			message: `feat(x00001): slice ${sliceId}`,
			claimedPaths: ['a.ts'],
			eventId: `event-${sliceId}`,
		});
	const remoteWorkRefs = async () =>
		(await repo.git('ls-remote', 'origin', 'refs/heads/wip/*')).trim();
	return { repo, persist, remoteWorkRefs };
};

describe('a checkpoint of nothing publishes nothing (x00627)', () => {
	it('pushes no work ref when the claimed paths are unchanged from the base', async () => {
		const { persist, remoteWorkRefs } = await setup();
		const outcome = await persist('S1');
		expect(outcome.handled && outcome.status).toBe('unchanged');
		expect(await remoteWorkRefs()).toBe('');
	});

	it('still publishes a checkpoint that carries a change', async () => {
		const { repo, persist, remoteWorkRefs } = await setup();
		await writeFile(
			join(repo.cwd, 'a.ts'),
			"export const v = 'changed';\n",
		);
		const outcome = await persist('S1');
		expect(outcome.handled && outcome.status).toBe('checkpointed');
		expect(await remoteWorkRefs()).toContain('x00001-S1');
	});

	it('re-publishes an unchanged checkpoint whose local ref exists but the remote lost', async () => {
		// A durability retry is the one case where `unchanged` still has
		// something to push: work checkpointed earlier, missing remotely.
		const { repo, persist, remoteWorkRefs } = await setup();
		await writeFile(
			join(repo.cwd, 'a.ts'),
			"export const v = 'changed';\n",
		);
		await persist('S1');
		const published = await remoteWorkRefs();
		const ref = published.split(/\s+/u)[1] ?? '';
		await repo.git('push', '--quiet', 'origin', `:${ref}`);
		expect(await remoteWorkRefs()).toBe('');
		const again = await persist('S1');
		expect(again.handled && again.status).toBe('unchanged');
		expect(await remoteWorkRefs()).toContain('x00001-S1');
	});
});

describe('what the persistence port refuses, and why', () => {
	const policy = expandProfile('shared-checkout-merge');
	const request = {
		triggerKind: 'slice' as const,
		proposalId: 'x00001',
		sliceId: 'S1',
		message: 'feat(x00001): slice S1',
		claimedPaths: ['a.ts'],
		eventId: 'event-S1',
	};

	it('refuses when the policy asks for work refs but names none', async () => {
		const port = createPolicyPersistence({
			policy: {
				...policy,
				branches: { ...policy.branches, workRefTemplate: '' },
			},
			run: createWriteGitRunner(tmpdir()),
			agentId: 'agent-a',
		});
		const outcome = await port?.persist(request);
		expect(outcome).toMatchObject({
			handled: true,
			status: 'refused',
			code: 'POLICY_ROUTE_UNSUPPORTED',
		});
	});

	it('refuses rather than committing to the integration branch when no WIP engine is bound', async () => {
		const port = createPolicyPersistence({
			policy,
			run: createWriteGitRunner(tmpdir()),
			agentId: 'agent-a',
		});
		const outcome = await port?.persist(request);
		expect(outcome).toMatchObject({
			handled: true,
			status: 'refused',
			code: 'WIP_CHECKPOINT_FAILED',
		});
	});

	it('refuses to call a checkpoint durable when there is no remote to push it to', async () => {
		const repo = await createTempGitRepo({ branch: 'develop' });
		cleanups.push(() => repo.cleanup());
		await writeFile(join(repo.cwd, 'a.ts'), "export const v = 'base';\n");
		await repo.git('add', '--', 'a.ts');
		await repo.git('commit', '-q', '-m', 'chore: base');
		const wip = await bindWipCheckpointPort(repo.cwd, UNANCHORED);
		if (wip === undefined) throw new Error('wip engine did not bind');
		const port = createPolicyPersistence({
			policy,
			run: createWriteGitRunner(repo.cwd),
			wip,
			agentId: 'agent-a',
		});
		await writeFile(
			join(repo.cwd, 'a.ts'),
			"export const v = 'changed';\n",
		);
		const outcome = await port?.persist(request);
		expect(outcome).toMatchObject({ handled: true, status: 'refused' });
		expect(JSON.stringify(outcome)).toContain('remote durability failed');
	});

	it('refuses to overwrite a remote work ref somebody else moved', async () => {
		const { repo, persist, remoteWorkRefs } = await setup();
		await writeFile(join(repo.cwd, 'a.ts'), "export const v = 'one';\n");
		await persist('S1');
		const ref = (await remoteWorkRefs()).split(/\s+/u)[1] ?? '';
		// Somebody else publishes a different commit under the same name.
		await repo.git(
			'push',
			'--quiet',
			'--force',
			'origin',
			`develop:${ref}`,
		);
		await writeFile(join(repo.cwd, 'a.ts'), "export const v = 'two';\n");
		const outcome = await persist('S1');
		expect(outcome).toMatchObject({ handled: true, status: 'refused' });
		expect(JSON.stringify(outcome)).toContain('moved concurrently');
	});

	it('keeps a checkpoint local when the policy does not push after committing', async () => {
		const repo = await createTempGitRepo({ branch: 'develop' });
		const remote = await mkdtemp(join(tmpdir(), 'no-push-remote-'));
		cleanups.push(async () => {
			await repo.cleanup();
			await rm(remote, { recursive: true, force: true });
		});
		await execFileAsync('git', ['init', '--bare'], { cwd: remote });
		await writeFile(join(repo.cwd, 'a.ts'), "export const v = 'base';\n");
		await repo.git('add', '--', 'a.ts');
		await repo.git('commit', '-q', '-m', 'chore: base');
		await repo.git('remote', 'add', 'origin', remote);
		await repo.git('push', '--quiet', '-u', 'origin', 'develop');
		const wip = await bindWipCheckpointPort(repo.cwd, UNANCHORED);
		if (wip === undefined) throw new Error('wip engine did not bind');
		const port = createPolicyPersistence({
			policy: {
				...policy,
				persistence: {
					...policy.persistence,
					autoPushAfterCommit: false,
				},
			},
			run: createWriteGitRunner(repo.cwd),
			wip,
			agentId: 'agent-a',
		});
		await writeFile(
			join(repo.cwd, 'a.ts'),
			"export const v = 'changed';\n",
		);
		const outcome = await port?.persist(request);
		expect(outcome).toMatchObject({
			handled: true,
			status: 'checkpointed',
		});
		expect(
			(await repo.git('ls-remote', 'origin', 'refs/heads/wip/*')).trim(),
		).toBe('');
	});
});
