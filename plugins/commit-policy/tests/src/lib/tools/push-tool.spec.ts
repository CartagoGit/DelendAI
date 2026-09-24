/**
 * push-tool.spec.ts — `commit_policy_push` against a real repository and a
 * bare remote: what it pushes, every refusal it gives and the next action
 * it names, and where it declares its writes land.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import { createWriteGitRunner } from '@delendai/core/public';
import { createFakeToolServer } from '@delendai/test-kit/public';

import { parseCommitPolicyOptions } from '../../../../src/lib/contracts/options';
import {
	buildPushToolRegistration,
	runCommitPolicyPush,
} from '../../../../src/lib/tools/push-tool';
import { createTempGitRepo } from '../../../integration/_fixtures/git-tmp';

const exec = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	while (cleanups.length > 0) await cleanups.pop()?.();
});

const setup = async (push: Record<string, unknown>, withRemote = true) => {
	const repo = await createTempGitRepo({ branch: 'feature/work' });
	const remote = await mkdtemp(join(tmpdir(), 'push-tool-remote-'));
	cleanups.push(async () => {
		await repo.cleanup();
		await rm(remote, { recursive: true, force: true });
	});
	await exec('git', ['init', '-q', '--bare'], { cwd: remote });
	if (withRemote) await repo.git('remote', 'add', 'origin', remote);
	const run = createWriteGitRunner(repo.cwd);
	const options = {
		namespacePrefix: 'commit-policy',
		policy: parseCommitPolicyOptions({ push: { enabled: true, ...push } }),
		run,
	};
	const remoteHas = async (branch: string) =>
		(
			await exec('git', ['ls-remote', remote, `refs/heads/${branch}`])
		).stdout.trim();
	return { repo, options, remoteHas };
};

interface IResult {
	readonly isError?: boolean;
	readonly structuredContent?: Record<string, unknown>;
}
const text = (result: unknown) => JSON.stringify(result);

describe('commit_policy_push', () => {
	it('pushes the current branch to the remote it was given', async () => {
		const { options, remoteHas } = await setup({});
		const result = (await runCommitPolicyPush(
			{ remote: 'origin', branch: 'feature/work' },
			options,
		)) as IResult;
		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toMatchObject({
			ok: true,
			pushed: true,
		});
		expect(await remoteHas('feature/work')).not.toBe('');
	});

	it('refuses when push is switched off, and says how to switch it on', async () => {
		const { options } = await setup({ enabled: false });
		const result = (await runCommitPolicyPush({}, options)) as IResult;
		expect(result.isError).toBe(true);
		expect(text(result)).toContain('PUSH_DISABLED');
	});

	it('refuses a protected branch', async () => {
		const { options, remoteHas } = await setup({
			protectedBranches: ['release'],
		});
		const result = (await runCommitPolicyPush(
			{ remote: 'origin', branch: 'release' },
			options,
		)) as IResult;
		expect(result.isError).toBe(true);
		expect(text(result)).toContain('BRANCH_PROTECTED');
		expect(await remoteHas('release')).toBe('');
	});

	it('refuses a direct push to main whatever the configuration says', async () => {
		const { options } = await setup({});
		const result = (await runCommitPolicyPush(
			{ remote: 'origin', branch: 'main' },
			options,
		)) as IResult;
		expect(text(result)).toContain('DIRECT_PUSH_TO_MAIN_NOT_ALLOWED');
	});

	it('asks for a reason before a plain --force', async () => {
		const { options } = await setup({});
		const result = (await runCommitPolicyPush(
			{ remote: 'origin', branch: 'feature/work', force: 'allow' },
			options,
		)) as IResult;
		expect(result.isError).toBe(true);
		expect(text(result)).toContain('Set push.forceReason');
	});

	it('asks for an identity to authorize a plain --force', async () => {
		const { options } = await setup({
			force: 'allow',
			forceReason: 'rewriting a published fixup',
		});
		const result = (await runCommitPolicyPush(
			{ remote: 'origin', branch: 'feature/work' },
			options,
		)) as IResult;
		expect(result.isError).toBe(true);
		expect(text(result)).toContain('Resolve an identity');
	});

	it('forces with the identity it resolved when the policy allows it', async () => {
		const { repo, options, remoteHas } = await setup({
			force: 'allow',
			forceReason: 'rewriting a published fixup',
		});
		const result = (await runCommitPolicyPush(
			{ remote: 'origin', branch: 'feature/work' },
			{
				...options,
				identityCtx: {
					run: createWriteGitRunner(repo.cwd),
					envVars: {},
				},
			},
		)) as IResult;
		expect(result.isError).toBeFalsy();
		expect(await remoteHas('feature/work')).not.toBe('');
	});

	it('names the missing remote when there is nowhere to push', async () => {
		const { options } = await setup({}, false);
		const result = (await runCommitPolicyPush({}, options)) as IResult;
		expect(result.isError).toBe(true);
		expect(text(result)).toContain('Configure push.remote');
	});

	it('names the missing target on a detached HEAD with no upstream', async () => {
		const { repo, options } = await setup({}, false);
		await repo.git('checkout', '-q', '--detach');
		const result = (await runCommitPolicyPush({}, options)) as IResult;
		expect(result.isError).toBe(true);
		expect(text(result)).toContain('Pass remote and branch explicitly');
	});

	it('is registered as a tool whose writes land on the remote', async () => {
		const { options } = await setup({});
		const registration = buildPushToolRegistration(options);
		expect(registration.writeRoot).toBe('remote');
		let handler: ((args: unknown) => unknown) | undefined;
		await registration.register(
			createFakeToolServer({
				onRegisterTool: (tool) => {
					handler = tool.handler;
				},
			}),
		);
		const result = (await handler?.({
			remote: 'origin',
			branch: 'feature/work',
		})) as IResult;
		expect(result.structuredContent).toMatchObject({ pushed: true });
	});
});
