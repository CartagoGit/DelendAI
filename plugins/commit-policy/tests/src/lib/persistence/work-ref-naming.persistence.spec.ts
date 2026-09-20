/**
 * work-ref-naming.persistence.spec.ts — the ref a checkpoint lands on is
 * named after the agent known AT CHECKPOINT TIME and the slice's topic.
 *
 * Against a real repository with a bare remote: a stubbed runner would
 * report whatever name it was handed, which is the thing under test.
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

const repoWithRemote = async () => {
	const repo = await createTempGitRepo({ branch: 'develop' });
	const remote = await mkdtemp(join(tmpdir(), 'work-ref-naming-remote-'));
	cleanups.push(async () => {
		await repo.cleanup();
		await rm(remote, { recursive: true, force: true });
	});
	await execFileAsync('git', ['init', '--bare'], { cwd: remote });
	await repo.git('remote', 'add', 'origin', remote);
	await repo.git('push', '--quiet', '-u', 'origin', 'develop');
	return repo;
};

describe('checkpoint work ref naming', () => {
	it('uses the agent resolved at checkpoint time and the slice topic', async () => {
		const repo = await repoWithRemote();
		const wip = await bindWipCheckpointPort(repo.cwd, UNANCHORED);
		if (wip === undefined) throw new Error('wip engine did not bind');
		let clientName = 'desktop-9ctqrs7';
		const topicRequests: Array<{ proposalId: string; sliceId: string }> =
			[];
		const policy = expandProfile('shared-checkout-merge');
		const persistence = createPolicyPersistence({
			policy,
			run: createWriteGitRunner(repo.cwd),
			wip,
			agentId: () => clientName,
			resolveTopic: async (input) => {
				topicRequests.push({ ...input });
				return 'tetris-mock-with-occupied-slots';
			},
		});
		if (persistence === undefined) throw new Error('expected a port');
		// The MCP handshake completes after register, before the checkpoint.
		clientName = 'codex-mcp-client';
		await writeFile(join(repo.cwd, 'src.ts'), 'export const a = 1;\n');

		const outcome = await persistence.persist({
			triggerKind: 'slice',
			proposalId: 'x00056',
			sliceId: 'S1',
			message: 'feat(x00056): commit via slice S1',
			claimedPaths: ['src.ts'],
			eventId: 'naming-1',
		});

		expect(outcome.handled).toBe(true);
		if (!outcome.handled || outcome.status === 'refused') {
			throw new Error(`checkpoint refused: ${JSON.stringify(outcome)}`);
		}
		expect(outcome.report.ref).toBe(
			`refs/${policy.branches.workRefPrefix}codex-mcp-client/x00056-S1-g1/tetris-mock-with-occupied-slots`,
		);
		expect(topicRequests).toEqual([
			{ proposalId: 'x00056', sliceId: 'S1' },
		]);
		// The remote holds the ref under the same name.
		const remoteRefs = await repo.git('ls-remote', 'origin');
		expect(remoteRefs).toContain(
			'codex-mcp-client/x00056-S1-g1/tetris-mock-with-occupied-slots',
		);
	});
});
