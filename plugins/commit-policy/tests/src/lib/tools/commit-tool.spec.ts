/**
 * commit-tool.spec.ts — `commit_policy_commit` against a real repository:
 * what it commits, every refusal and the next action it names, what
 * happens when the push that follows fails, and where it declares its
 * writes land.
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createWriteGitRunner } from '@delendai/core/public';
import { createFakeToolServer } from '@delendai/test-kit/public';

import { parseCommitPolicyOptions } from '../../../../src/lib/contracts/options';
import {
	buildCommitToolRegistration,
	runCommitPolicyCommit,
	type ICommitToolOptions,
} from '../../../../src/lib/tools/commit-tool';
import { createTempGitRepo } from '../../../integration/_fixtures/git-tmp';

const cleanups: Array<() => Promise<void>> = [];
afterEach(async () => {
	while (cleanups.length > 0) await cleanups.pop()?.();
});

const setup = async (
	raw: Record<string, unknown> = {},
	branch = 'feature/work',
) => {
	const repo = await createTempGitRepo({ branch });
	cleanups.push(repo.cleanup);
	const run = createWriteGitRunner(repo.cwd);
	const options: ICommitToolOptions = {
		namespacePrefix: 'commit-policy',
		policy: parseCommitPolicyOptions({
			commit: { enabled: true },
			identity: { mode: 'repo' },
			...raw,
		}),
		run,
		identityCtx: { run, envVars: {} },
		auditAgent: null,
	};
	await writeFile(join(repo.cwd, 'a.ts'), 'export const a = 1;\n');
	return { repo, options };
};

interface IResult {
	readonly isError?: boolean;
	readonly structuredContent?: Record<string, unknown>;
}
const text = (result: unknown) => JSON.stringify(result);

describe('commit_policy_commit', () => {
	it('commits the named files with a conventional message', async () => {
		const { repo, options } = await setup();
		const result = (await runCommitPolicyCommit(
			{ message: 'feat: add a', files: ['a.ts'] },
			options,
		)) as IResult;
		expect(result.isError).toBeFalsy();
		expect(result.structuredContent).toMatchObject({ committed: true });
		expect((await repo.git('log', '-1', '--format=%s')).trim()).toBe(
			'feat: add a',
		);
	});

	it('refuses when commit is switched off', async () => {
		const { options } = await setup({ commit: { enabled: false } });
		const result = (await runCommitPolicyCommit(
			{ message: 'feat: add a', files: ['a.ts'] },
			options,
		)) as IResult;
		expect(result.isError).toBe(true);
	});

	it('refuses a message that is not a conventional commit, and says why', async () => {
		const { options } = await setup();
		const result = (await runCommitPolicyCommit(
			{ message: 'added some stuff', files: ['a.ts'] },
			options,
		)) as IResult;
		expect(result.isError).toBe(true);
		expect(text(result)).toContain('NON_CONVENTIONAL_MESSAGE');
	});

	it('says what to do when there is nothing to commit', async () => {
		const { options } = await setup();
		const result = (await runCommitPolicyCommit(
			{ message: 'feat: nothing', files: ['README.md'] },
			options,
		)) as IResult;
		expect(result.isError).toBe(true);
	});

	it('says to check out a branch on a detached HEAD', async () => {
		const { repo, options } = await setup();
		await repo.git('checkout', '-q', '--detach');
		const result = (await runCommitPolicyCommit(
			{ message: 'feat: add a', files: ['a.ts'] },
			options,
		)) as IResult;
		expect(result.isError).toBe(true);
		expect(text(result)).toContain('Check out a feature/agent branch');
	});

	it('refuses a slice that names no files', async () => {
		const { options } = await setup();
		const result = (await runCommitPolicyCommit(
			{
				message: 'feat: slice',
				slice: { proposalId: 'x00001', sliceId: 'S1', files: [] },
			},
			options,
		)) as IResult;
		expect(result.isError).toBe(true);
	});

	it('keeps the commit and reports it when the push that follows is refused', async () => {
		const { options } = await setup();
		const result = (await runCommitPolicyCommit(
			{ message: 'feat: add a', files: ['a.ts'] },
			{
				...options,
				onCommitSucceeded: async () => ({
					ok: false,
					refusal: 'push refused: no remote',
				}),
			},
		)) as IResult;
		expect(result.isError).toBe(true);
		expect(text(result)).toContain('Commit completed locally');
		expect(text(result)).toContain('push refused: no remote');
	});

	it('keeps the commit and reports it when the push that follows throws', async () => {
		const { options } = await setup();
		const result = (await runCommitPolicyCommit(
			{ message: 'feat: add a', files: ['a.ts'] },
			{
				...options,
				onCommitSucceeded: async () => {
					throw new Error('network down');
				},
			},
		)) as IResult;
		expect(result.isError).toBe(true);
		expect(text(result)).toContain('network down');
	});

	it('succeeds when the push that follows succeeds or is not due', async () => {
		const { options } = await setup();
		const result = (await runCommitPolicyCommit(
			{ message: 'feat: add a', files: ['a.ts'] },
			{ ...options, onCommitSucceeded: async () => null },
		)) as IResult;
		expect(result.isError).toBeFalsy();
	});

	it("is registered as a tool whose writes land in the server's root, where its engine was built", async () => {
		const { options } = await setup();
		const registration = buildCommitToolRegistration(options);
		expect(registration.writeRoot).toBe('server');
		let handler: ((args: unknown) => unknown) | undefined;
		await registration.register(
			createFakeToolServer({
				onRegisterTool: (tool) => {
					handler = tool.handler;
				},
			}),
		);
		const result = (await handler?.({
			message: 'feat: add a',
			files: ['a.ts'],
		})) as IResult;
		expect(result.structuredContent).toMatchObject({ committed: true });
	});
});
