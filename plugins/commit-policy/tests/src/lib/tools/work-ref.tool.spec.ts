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
import { validatePolicyAndRef } from '../../../../src/lib/services/work-ref-policy.service';

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
	it.each(['shared-checkout-pr', 'shared-checkout-merge', 'worktree-pr'])(
		'%s: checkpoint and materialize refuse, as `work checkpoint` does, and move nothing (x01003)',
		async (profile) => {
			const root = await createRepo();
			const under = resolveDevelopmentPolicy({
				development: { profile, branches: { integration: 'develop' } },
			});
			const wip = await createWipEngine(root, anchorFromPolicy(under));
			if (wip === undefined)
				throw new Error('fixture did not create a WIP engine');
			const options = {
				namespacePrefix: 'commit-policy',
				policy: under,
				wip,
				agentId: 'agent-a',
			};
			await writeFile(join(root, 'owned.txt'), 'agent-owned\n', 'utf8');
			const beforeHead = await git(root, 'rev-parse', 'HEAD');
			const beforeIndex = await readIndex(root);
			for (const action of ['checkpoint', 'materialize'] as const) {
				const result = await runCommitPolicyWorkRef(
					{
						action,
						proposal: 'x00545',
						slice: 'S0',
						generation: 1,
						paths: ['owned.txt', 'foreign.txt'],
						...(action === 'checkpoint'
							? { message: 'chore: checkpoint work ref' }
							: {}),
					},
					options,
				);
				const said = JSON.stringify(result);
				expect(payloadOf(result).ok).toBe(false);
				expect(said).toContain('WORK_REF_SHARED_CHECKOUT');
				// The message `work checkpoint` gives.
				expect(said).toContain('Nothing is checkpointed from');
				expect(said).toContain(
					'owned.txt: edited here, and nothing proves the unit wrote it',
				);
				expect(said).toContain('foreign.txt: unchanged here');
				expect(said).toContain('delendai work enter');
			}
			expect(await readFile(join(root, 'owned.txt'), 'utf8')).toBe(
				'agent-owned\n',
			);
			expect(await git(root, 'rev-parse', 'HEAD')).toBe(beforeHead);
			expect(await readIndex(root)).toEqual(beforeIndex);
			expect(await git(root, 'for-each-ref', 'refs/heads/delendai')).toBe(
				'',
			);
		},
	);

	it('recovers and republishes an orphan checkpoint only from its recorded exact scope', async () => {
		const root = await createRepo();
		const options = await optionsFor(root);
		// An orphan checkpoint object, as an earlier checkpoint left it.
		await writeFile(join(root, 'owned.txt'), 'recover-me\n', 'utf8');
		const input = {
			action: 'recover' as const,
			proposal: 'x00545',
			slice: 'recovery',
			generation: 1,
			paths: ['owned.txt'],
		};
		const resolved = validatePolicyAndRef(options, input);
		if (!('ref' in resolved)) throw new Error(resolved.reason);
		const ref = resolved.ref;
		const made = await options.wip.createOrUpdateWipRef({
			baseSha: await git(root, 'rev-parse', 'develop'),
			paths: ['owned.txt'],
			ref,
			message: 'chore: recoverable checkpoint',
		});
		if (made.status !== 'created') throw new Error('no checkpoint made');
		const commit = made.commit;
		await git(root, 'update-ref', '-d', ref);
		await git(root, 'checkout', '--', 'owned.txt');

		const recovered = payloadOf(
			await runCommitPolicyWorkRef({ ...input, commit }, options),
		);
		expect(recovered.ok).toBe(true);
		expect(recovered.published).toBe(true);
		expect(String(recovered.ref)).toBe(ref);
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
