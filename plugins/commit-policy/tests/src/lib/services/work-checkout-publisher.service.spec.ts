/**
 * work-checkout-publisher.service.spec.ts — an agent's committed work
 * reaches its work ref on the remote at the declared cadence, and nothing
 * else does.
 *
 * Driven against a real repository, real worktrees and a bare remote.
 */
import { execFile } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { afterEach, describe, expect, it } from 'vitest';

import {
	createWriteGitRunner,
	holdWorkRef,
	type IResolvedDevelopmentPolicy,
} from '@delendai/core/public';
import { expandProfile } from '@delendai/core/lib/development-policy/profiles';

import {
	captureWorkingState,
	workingStateChanges,
} from '@delendai/test-kit/public';

import type { IWorkCheckoutPublication } from '../../../../src/lib/contracts/interfaces/work-checkout-publisher.interface';
import {
	publishWorkCheckouts,
	startWorkCheckoutPublisher,
	workCheckoutCadenceMinutes,
	workCheckoutRefs,
} from '../../../../src/lib/services/work-checkout-publisher.service';
import { createTempGitRepo } from '../../../integration/_fixtures/git-tmp';

const execFileAsync = promisify(execFile);
const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
	while (cleanups.length > 0) await cleanups.pop()?.();
});

const POLICY = expandProfile('shared-checkout-pr');
const WORK_BRANCH = 'wip/agent-a/x00001-S1-g1/work';

const withCheckpoint = (
	checkpoint: Partial<IResolvedDevelopmentPolicy['checkpoint']>,
	branches: Partial<IResolvedDevelopmentPolicy['branches']> = {},
): IResolvedDevelopmentPolicy => ({
	...POLICY,
	checkpoint: { ...POLICY.checkpoint, ...checkpoint },
	branches: { ...POLICY.branches, ...branches },
});

const setup = async () => {
	const repo = await createTempGitRepo({ branch: 'develop' });
	const remote = await mkdtemp(join(tmpdir(), 'work-checkout-remote-'));
	const trees = await mkdtemp(join(tmpdir(), 'work-checkout-trees-'));
	cleanups.push(async () => {
		await repo.cleanup();
		await rm(remote, { recursive: true, force: true });
		await rm(trees, { recursive: true, force: true });
	});
	await execFileAsync('git', ['init', '--bare'], { cwd: remote });
	await writeFile(join(repo.cwd, 'a.ts'), "export const v = 'base';\n");
	await repo.git('add', '--', 'a.ts');
	await repo.git('commit', '-q', '-m', 'chore: base');
	await repo.git('remote', 'add', 'origin', remote);
	await repo.git('push', '--quiet', '-u', 'origin', 'develop');
	/** A checkout on `branch`, as `delendai work enter` makes one. */
	const enter = async (branch: string): Promise<string> => {
		const dir = join(trees, branch.replaceAll('/', '-'));
		await repo.git('worktree', 'add', '-q', '-b', branch, dir, 'develop');
		return dir;
	};
	const commitIn = async (dir: string, text: string): Promise<void> => {
		await writeFile(join(dir, 'a.ts'), text);
		await execFileAsync('git', ['commit', '-q', '-am', 'feat: work'], {
			cwd: dir,
		});
	};
	const remoteHas = async (branch: string): Promise<string> =>
		(await repo.git('ls-remote', 'origin', `refs/heads/${branch}`)).trim();
	const run = createWriteGitRunner(repo.cwd);
	return { repo, enter, commitIn, remoteHas, run };
};

const outcomes = (publications: readonly IWorkCheckoutPublication[]) =>
	publications.map((each) => each.outcome);

describe('publishing agents work checkouts', () => {
	it('pushes the committed work of a work checkout, then stays level', async () => {
		const { enter, commitIn, remoteHas, run } = await setup();
		const dir = await enter(WORK_BRANCH);
		await commitIn(dir, "export const v = 'work';\n");

		expect(outcomes(await publishWorkCheckouts(run, POLICY))).toEqual([
			'published',
		]);
		expect(await remoteHas(WORK_BRANCH)).not.toBe('');
		expect(outcomes(await publishWorkCheckouts(run, POLICY))).toEqual([
			'level',
		]);
	});

	it('keeps the uncommitted work of the agent and of the host checkout (x00635)', async () => {
		const { repo, enter, commitIn, run } = await setup();
		const dir = await enter(WORK_BRANCH);
		await commitIn(dir, "export const v = 'committed';\n");
		await writeFile(join(dir, 'a.ts'), "export const v = 'uncommitted';\n");
		await writeFile(join(dir, 'new.ts'), 'export {};\n');
		await writeFile(join(repo.cwd, 'a.ts'), "export const v = 'host';\n");
		const agentBefore = captureWorkingState(dir);
		const hostBefore = captureWorkingState(repo.cwd);

		expect(outcomes(await publishWorkCheckouts(run, POLICY))).toEqual([
			'published',
		]);
		expect(workingStateChanges(agentBefore)).toEqual([]);
		expect(workingStateChanges(hostBefore)).toEqual([]);
	});

	it('publishes nothing for a checkout with no commits of its own', async () => {
		const { enter, remoteHas, run } = await setup();
		const dir = await enter(WORK_BRANCH);
		// Uncommitted work is the agent's; the host never commits it.
		await writeFile(join(dir, 'a.ts'), "export const v = 'dirty';\n");

		const [only] = await publishWorkCheckouts(run, POLICY);
		expect(only?.outcome).toBe('skipped');
		expect(only?.reason).toContain('no commits of its own');
		expect(await remoteHas(WORK_BRANCH)).toBe('');
	});

	it('leaves a branch outside the work-ref namespace alone', async () => {
		const { enter, commitIn, remoteHas, run } = await setup();
		const dir = await enter('feature/mine');
		await commitIn(dir, "export const v = 'mine';\n");

		expect(await publishWorkCheckouts(run, POLICY)).toEqual([]);
		expect(await remoteHas('feature/mine')).toBe('');
	});

	it('never overwrites a remote work ref that holds commits it lacks', async () => {
		const { repo, enter, commitIn, run } = await setup();
		const dir = await enter(WORK_BRANCH);
		await commitIn(dir, "export const v = 'here';\n");
		// Another machine published a different history under the name.
		await repo.git(
			'push',
			'-q',
			'origin',
			`develop:refs/heads/${WORK_BRANCH}`,
		);
		await repo.git('commit', '-q', '--allow-empty', '-m', 'elsewhere');
		await repo.git(
			'push',
			'-q',
			'-f',
			'origin',
			`develop:refs/heads/${WORK_BRANCH}`,
		);

		const [only] = await publishWorkCheckouts(run, POLICY);
		expect(only?.outcome).toBe('skipped');
		expect(only?.reason).toContain('nothing is overwritten');
	});

	it('skips a checkout whose branch was deleted after publication', async () => {
		const { repo, enter, commitIn, run } = await setup();
		const dir = await enter(WORK_BRANCH);
		await commitIn(dir, "export const v = 'done';\n");
		await repo.git('update-ref', '-d', `refs/heads/${WORK_BRANCH}`);

		const [only] = await publishWorkCheckouts(run, POLICY);
		expect(only?.outcome).toBe('skipped');
	});

	it('pushes nothing while a publication holds the ref', async () => {
		const { repo, enter, commitIn, remoteHas, run } = await setup();
		const dir = await enter(WORK_BRANCH);
		await commitIn(dir, "export const v = 'publishing';\n");
		const gitCommonDir = (
			await repo.git(
				'rev-parse',
				'--path-format=absolute',
				'--git-common-dir',
			)
		).trim();
		const held = await holdWorkRef({
			gitCommonDir,
			ref: `refs/heads/${WORK_BRANCH}`,
			machineId: 'box',
			pid: 11,
		});
		expect(held.kind).toBe('acquired');

		const [only] = await publishWorkCheckouts(run, POLICY);
		expect(only?.outcome).toBe('skipped');
		expect(only?.reason).toContain('box#11');
		expect(await remoteHas(WORK_BRANCH)).toBe('');
	});

	it('reads the ref only once it holds it, so a publication that ended first is not undone', async () => {
		const { repo, enter, commitIn, remoteHas, run } = await setup();
		const dir = await enter(WORK_BRANCH);
		await commitIn(dir, "export const v = 'published';\n");
		// The worktree listing was read; the publication then finished and
		// deleted the work ref before this tick got to hold it.
		const publicationEndsFirst: typeof holdWorkRef = async (options) => {
			await repo.git('update-ref', '-d', `refs/heads/${WORK_BRANCH}`);
			return holdWorkRef(options);
		};

		const [only] = await publishWorkCheckouts(
			run,
			POLICY,
			undefined,
			publicationEndsFirst,
		);
		expect(only?.outcome).toBe('skipped');
		expect(await remoteHas(WORK_BRANCH)).toBe('');
	});

	it('says so when there is no remote to publish to', async () => {
		const { repo, enter, commitIn, run } = await setup();
		const dir = await enter(WORK_BRANCH);
		await commitIn(dir, "export const v = 'local';\n");
		await repo.git('remote', 'remove', 'origin');

		const [only] = await publishWorkCheckouts(run, POLICY);
		expect(only?.outcome).toBe('skipped');
		expect(only?.reason).toContain('no remote');
	});

	it('reports every tick that moved something', async () => {
		const { enter, commitIn, run } = await setup();
		const dir = await enter(WORK_BRANCH);
		await commitIn(dir, "export const v = 'tick';\n");
		const reported: IWorkCheckoutPublication[][] = [];
		const publisher = startWorkCheckoutPublisher({
			run,
			policy: POLICY,
			report: (moved) => reported.push([...moved]),
		});
		cleanups.push(async () => publisher.stop());

		await publisher.tick();
		await publisher.tick();
		expect(reported.map(outcomes)).toEqual([['published']]);
	});
});

describe('when the policy asks for it', () => {
	it('follows an interval or continuous cadence with visible work refs', () => {
		expect(workCheckoutCadenceMinutes(POLICY)).toBe(
			POLICY.checkpoint.intervalMinutes,
		);
		expect(
			workCheckoutCadenceMinutes(
				withCheckpoint({ strategy: 'interval', intervalMinutes: 3 }),
			),
		).toBe(3);
	});

	it('does nothing for a slice cadence, hidden refs or no work-ref model', () => {
		expect(
			workCheckoutCadenceMinutes(withCheckpoint({ strategy: 'slice' })),
		).toBeUndefined();
		expect(
			workCheckoutCadenceMinutes(withCheckpoint({ intervalMinutes: 0 })),
		).toBeUndefined();
		expect(
			workCheckoutCadenceMinutes(
				withCheckpoint({}, { workRefVisibility: 'hidden' }),
			),
		).toBeUndefined();
		expect(
			workCheckoutCadenceMinutes(
				withCheckpoint({}, { workRefPrefix: '' }),
			),
		).toBeUndefined();
		expect(
			workCheckoutCadenceMinutes({
				...POLICY,
				persistence: {
					...POLICY.persistence,
					autoPushAfterCommit: false,
				},
			}),
		).toBeUndefined();
	});

	it('starts no timer and publishes nothing when it does not', async () => {
		const { enter, commitIn, remoteHas, run } = await setup();
		const dir = await enter(WORK_BRANCH);
		await commitIn(dir, "export const v = 'quiet';\n");
		const publisher = startWorkCheckoutPublisher({
			run,
			policy: withCheckpoint({ strategy: 'slice' }),
		});
		expect(await publisher.tick()).toEqual([]);
		publisher.stop();
		expect(await remoteHas(WORK_BRANCH)).toBe('');
	});

	it('reads the work branches out of the worktree listing', () => {
		const porcelain = [
			'worktree /repo',
			'HEAD abc',
			'branch refs/heads/develop',
			'',
			'worktree /repo/.cache/w1',
			'HEAD def',
			'branch refs/heads/wip/a/x1-S1-g1/work',
			'',
			'worktree /repo/.cache/w2',
			'HEAD 123',
			'detached',
		].join('\n');
		expect(workCheckoutRefs(porcelain, 'refs/heads/wip')).toEqual([
			'refs/heads/wip/a/x1-S1-g1/work',
		]);
	});
});
