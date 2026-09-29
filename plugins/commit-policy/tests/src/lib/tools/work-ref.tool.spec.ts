import { execFile } from 'node:child_process';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	anchorFromPolicy,
	createWipEngine,
	resolveDevelopmentPolicy,
} from '@delendai/core/public';

import { runCommitPolicyWorkRef } from '../../../../src/lib/tools/work-ref.tool';

const execFileAsync = promisify(execFile);
const workspaces: string[] = [];

const git = async (cwd: string, ...args: string[]): Promise<string> => {
	const result = await execFileAsync('git', args, {
		cwd,
		encoding: 'utf8',
	});
	return String(result.stdout).trim();
};

const policy = resolveDevelopmentPolicy({
	development: {
		profile: 'shared-checkout-pr',
		branches: { integration: 'develop' },
	},
});

const readIndex = async (root: string): Promise<Uint8Array> =>
	readFile(join(root, '.git', 'index'));

const payloadOf = (result: unknown): Record<string, unknown> => {
	if (typeof result !== 'object' || result === null) {
		throw new Error('tool returned a non-object result');
	}
	const structured = (result as { structuredContent?: unknown })
		.structuredContent;
	if (typeof structured !== 'object' || structured === null) {
		throw new Error('tool did not return structuredContent');
	}
	return structured as Record<string, unknown>;
};

const createRepo = async (): Promise<string> => {
	const root = await mkdtemp(join(tmpdir(), 'commit-policy-work-ref-'));
	const remote = await mkdtemp(
		join(tmpdir(), 'commit-policy-work-ref-remote-'),
	);
	workspaces.push(root);
	workspaces.push(remote);
	await git(remote, 'init', '--bare');
	await git(root, 'init', '-b', 'develop');
	await git(root, 'config', 'user.name', 'Work Ref Test');
	await git(root, 'config', 'user.email', 'work-ref@example.test');
	await writeFile(join(root, 'owned.txt'), 'base-owned\n', 'utf8');
	await writeFile(join(root, 'foreign.txt'), 'base-foreign\n', 'utf8');
	await git(root, 'add', '--', 'owned.txt', 'foreign.txt');
	await git(root, 'commit', '-m', 'chore: seed work-ref fixture');
	await git(root, 'remote', 'add', 'origin', remote);
	await git(root, 'push', '--quiet', '-u', 'origin', 'develop');
	return root;
};

const optionsFor = async (root: string) => {
	const wip = await createWipEngine(root, anchorFromPolicy(policy));
	if (wip === undefined)
		throw new Error('fixture did not create a WIP engine');
	return {
		namespacePrefix: 'commit-policy',
		policy,
		wip,
		agentId: 'agent-a',
	};
};

afterEach(async () => {
	for (const root of workspaces.splice(0)) {
		await rm(root, { recursive: true, force: true });
	}
});

describe('commit_policy_work_ref', () => {
	it('checkpoints exact scope, cleans only owned paths, and materializes without moving HEAD or the real index', async () => {
		const root = await createRepo();
		await writeFile(join(root, 'owned.txt'), 'agent-owned\n', 'utf8');
		await writeFile(join(root, 'foreign.txt'), 'foreign-dirty\n', 'utf8');
		await writeFile(
			join(root, 'foreign-untracked.txt'),
			'keep-me\n',
			'utf8',
		);
		await git(root, 'add', '--', 'foreign.txt');
		const beforeHead = await git(root, 'rev-parse', 'HEAD');
		const beforeBranch = await git(root, 'branch', '--show-current');
		const beforeIndex = await readIndex(root);

		const options = await optionsFor(root);
		const checkpoint = payloadOf(
			await runCommitPolicyWorkRef(
				{
					action: 'checkpoint',
					proposal: 'x00545',
					slice: 'S0',
					generation: 1,
					paths: ['owned.txt'],
					message: 'chore: checkpoint work ref',
					cleanAfterCheckpoint: true,
				},
				options,
			),
		);
		expect(checkpoint.ok).toBe(true);
		expect(checkpoint.headMoved).toBe(false);
		expect(checkpoint.indexTouched).toBe(false);
		expect(checkpoint.published).toBe(true);
		expect(checkpoint.remote).toBe('origin');
		expect(checkpoint.cleaned).toEqual(['owned.txt']);
		expect(await readFile(join(root, 'owned.txt'), 'utf8')).toBe(
			'base-owned\n',
		);
		expect(await readFile(join(root, 'foreign.txt'), 'utf8')).toBe(
			'foreign-dirty\n',
		);
		expect(
			await readFile(join(root, 'foreign-untracked.txt'), 'utf8'),
		).toBe('keep-me\n');
		expect(await git(root, 'rev-parse', 'HEAD')).toBe(beforeHead);
		expect(await git(root, 'branch', '--show-current')).toBe(beforeBranch);
		expect(await readIndex(root)).toEqual(beforeIndex);

		const ref = String(checkpoint.ref);
		// Derived from the policy under test: work refs are visible
		// branches now, so a literal `refs/wip/` no longer describes them.
		expect(ref.startsWith(`refs/${policy.branches.workRefPrefix}`)).toBe(
			true,
		);
		expect(await git(root, 'show', `${ref}:owned.txt`)).toBe('agent-owned');
		expect(await git(root, 'ls-remote', 'origin', ref)).toContain(
			String(checkpoint.commit),
		);

		const materialized = payloadOf(
			await runCommitPolicyWorkRef(
				{
					action: 'materialize',
					proposal: 'x00545',
					slice: 'S0',
					generation: 1,
					paths: ['owned.txt'],
				},
				options,
			),
		);
		expect(materialized.ok).toBe(true);
		expect(materialized.restored).toEqual(['owned.txt']);
		expect(materialized.headMoved).toBe(false);
		expect(materialized.indexTouched).toBe(false);
		expect(await readFile(join(root, 'owned.txt'), 'utf8')).toBe(
			'agent-owned\n',
		);
		expect(
			await readFile(join(root, 'foreign-untracked.txt'), 'utf8'),
		).toBe('keep-me\n');
		expect(await git(root, 'rev-parse', 'HEAD')).toBe(beforeHead);
		expect(await git(root, 'branch', '--show-current')).toBe(beforeBranch);
		expect(await readIndex(root)).toEqual(beforeIndex);
	});

	it('cleans a new claimed file by deleting it after the checkpoint', async () => {
		const root = await createRepo();
		await writeFile(
			join(root, 'new-owned.txt'),
			'new-agent-work\n',
			'utf8',
		);
		const result = payloadOf(
			await runCommitPolicyWorkRef(
				{
					action: 'checkpoint',
					proposal: 'x00545',
					slice: 'S0-new',
					generation: 1,
					paths: ['new-owned.txt'],
					message: 'chore: checkpoint new file',
					cleanAfterCheckpoint: true,
				},
				await optionsFor(root),
			),
		);
		expect(result.ok).toBe(true);
		expect(result.deleted).toEqual(['new-owned.txt']);
		await expect(readFile(join(root, 'new-owned.txt'))).rejects.toThrow();
	});

	it('recovers and republishes an orphan checkpoint only from its recorded exact scope', async () => {
		const root = await createRepo();
		await writeFile(join(root, 'owned.txt'), 'recover-me\n', 'utf8');
		const options = await optionsFor(root);
		const checkpoint = payloadOf(
			await runCommitPolicyWorkRef(
				{
					action: 'checkpoint',
					proposal: 'x00545',
					slice: 'recovery',
					generation: 1,
					paths: ['owned.txt'],
					message: 'chore: recoverable checkpoint',
				},
				options,
			),
		);
		const ref = String(checkpoint.ref);
		const commit = String(checkpoint.commit);
		await git(root, 'push', 'origin', `:${ref}`);
		await git(root, 'update-ref', '-d', ref);

		const recovered = payloadOf(
			await runCommitPolicyWorkRef(
				{
					action: 'recover',
					proposal: 'x00545',
					slice: 'recovery',
					generation: 1,
					paths: ['owned.txt'],
					commit,
				},
				options,
			),
		);
		expect(recovered.ok).toBe(true);
		expect(recovered.published).toBe(true);
		expect(await git(root, 'rev-parse', ref)).toBe(commit);
		expect(await git(root, 'ls-remote', 'origin', ref)).toContain(commit);
	});

	it('rejects traversal before invoking the WIP engine', async () => {
		const root = await createRepo();
		const result = payloadOf(
			await runCommitPolicyWorkRef(
				{
					action: 'checkpoint',
					proposal: 'x00545',
					slice: 'S0',
					generation: 1,
					paths: ['../outside.txt'],
					message: 'chore: invalid path',
				},
				await optionsFor(root),
			),
		);
		expect(result.ok).toBe(false);
		expect(JSON.stringify(result)).toContain('WORK_REF_INVALID_SCOPE');
	});

	it('does not allow the caller to select an agent identity', async () => {
		const root = await createRepo();
		const result = payloadOf(
			await runCommitPolicyWorkRef(
				{
					action: 'checkpoint',
					agent: 'other-agent',
					proposal: 'x00545',
					slice: 'S0',
					generation: 1,
					paths: ['owned.txt'],
					message: 'chore: rejected identity override',
				},
				await optionsFor(root),
			),
		);
		expect(result.ok).toBe(false);
		expect(JSON.stringify(result)).toContain('WORK_REF_INVALID_INPUT');
	});
});
