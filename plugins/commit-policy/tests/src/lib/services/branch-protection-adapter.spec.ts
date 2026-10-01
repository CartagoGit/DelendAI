import { describe, expect, it } from 'vitest';

import type {
	IExternalToolRun,
	IRunExternalToolInput,
} from '@delendai/core/public';

import type { ICommitPolicyPush } from '@delendai/commit-policy/lib/contracts/options';
import {
	createBranchProtectionAdapter,
	type BranchProtectionAdapterOptions,
} from '@delendai/commit-policy/lib/services/branch-protection-adapter';
import { runBranchProtectionRefresh } from '@delendai/commit-policy/lib/tools/branch-protection-tool';

const ok = (stdout: string): IExternalToolRun => ({
	ok: true,
	code: 0,
	stdout,
	stderr: '',
	timedOut: false,
	unavailable: false,
});

const policy = (protectedBranches: string[]): ICommitPolicyPush => ({
	enabled: true,
	onCommit: false,
	force: 'with-lease',
	protectedBranches,
	protectedPrefixes: [],
});

const buildExec =
	(
		remoteUrl: string,
		protectedOutput: string,
	): NonNullable<BranchProtectionAdapterOptions['exec']> =>
	async (input: IRunExternalToolInput) => {
		if (input.tool.bin === 'git') {
			if (input.args[0] === 'rev-parse') return ok('origin/trunk\n');
			return ok(`${remoteUrl}\n`);
		}
		return ok(protectedOutput);
	};

describe('branch protection adapter', () => {
	it('merges GitHub protected branches with local configuration', async () => {
		const configured = policy(['release']);
		const adapter = createBranchProtectionAdapter({
			workspaceRoot: '/workspace',
			policy: configured,
			exec: buildExec(
				'git@github.com:acme/widget.git',
				'production\ntrunk\n',
			),
		});

		const result = await adapter.refresh();

		expect(result).toEqual({
			ok: true,
			state: 'fresh',
			provider: 'github',
			remoteName: 'origin',
			remoteHost: 'github.com',
			remoteBranches: ['production', 'trunk'],
			effectiveBranches: ['release', 'production', 'trunk'],
		});
		expect(configured.protectedBranches).toEqual([
			'release',
			'production',
			'trunk',
		]);
	});

	it('uses the configured push.remote instead of forcing origin', async () => {
		const configured = {
			...policy(['release']),
			remote: 'mirror',
		};
		const calls: string[] = [];
		const adapter = createBranchProtectionAdapter({
			workspaceRoot: '/workspace',
			policy: configured,
			exec: async (input) => {
				calls.push(`${input.tool.bin} ${input.args.join(' ')}`);
				if (input.tool.bin === 'git') {
					if (input.args[2] === 'mirror') {
						return ok('https://gitlab.com/acme/widget.git\n');
					}
					return ok('git@github.com:acme/should-not-be-used.git\n');
				}
				return ok(JSON.stringify([{ name: 'production' }]));
			},
		});

		const result = await adapter.refresh();

		expect(result).toEqual({
			ok: true,
			state: 'fresh',
			provider: 'gitlab',
			remoteName: 'mirror',
			remoteHost: 'gitlab.com',
			remoteBranches: ['production'],
			effectiveBranches: ['release', 'production'],
		});
		expect(calls).toContain('git remote get-url mirror');
		expect(calls).not.toContain('git remote get-url origin');
	});

	it('parses GitLab protected branch JSON and removes stale remote entries', async () => {
		const configured = policy(['trunk']);
		let output = JSON.stringify([{ name: 'production' }]);
		const adapter = createBranchProtectionAdapter({
			workspaceRoot: '/workspace',
			policy: configured,
			exec: async (input) => {
				if (input.tool.bin === 'git')
					return ok('https://gitlab.com/acme/widget.git\n');
				return ok(output);
			},
		});

		await adapter.refresh();
		output = JSON.stringify([{ name: 'staging' }]);
		const result = await adapter.refresh();

		expect(result).toMatchObject({
			ok: true,
			state: 'fresh',
			provider: 'gitlab',
			remoteName: 'origin',
			remoteHost: 'gitlab.com',
			remoteBranches: ['staging'],
			effectiveBranches: ['trunk', 'staging'],
		});
		expect(configured.protectedBranches).toEqual(['trunk', 'staging']);
	});

	it('starts stale and keeps local protection when no refresh has run yet', () => {
		const configured = policy(['trunk']);
		const adapter = createBranchProtectionAdapter({
			workspaceRoot: '/workspace',
			policy: configured,
			exec: buildExec('https://example.com/acme/widget.git', ''),
		});

		expect(adapter.getLastResult()).toEqual({
			ok: false,
			state: 'stale',
			reason: 'Remote branch protection has not been refreshed yet; local push.protectedBranches remains in effect.',
			remoteBranches: [],
			effectiveBranches: ['trunk'],
		});
		expect(configured.protectedBranches).toEqual(['trunk']);
	});

	it('keeps local protection and reports unsupported remotes explicitly', async () => {
		const configured = policy(['trunk']);
		const adapter = createBranchProtectionAdapter({
			workspaceRoot: '/workspace',
			policy: configured,
			exec: buildExec('https://example.com/acme/widget.git', ''),
		});

		const result = await adapter.refresh();

		expect(result).toEqual({
			ok: false,
			state: 'unsupported',
			provider: 'unknown',
			remoteName: 'origin',
			remoteHost: 'example.com',
			reason: "Unsupported forge provider for remote 'origin' host: example.com",
			remoteBranches: [],
			effectiveBranches: ['trunk'],
		});
		expect(configured.protectedBranches).toEqual(['trunk']);
	});

	it('supports self-hosted forge hosts through an explicit provider resolver', async () => {
		const configured = policy(['trunk']);
		const adapter = createBranchProtectionAdapter({
			workspaceRoot: '/workspace',
			policy: configured,
			resolveProvider: (host) =>
				host === 'git.example.test' ? 'gitlab' : 'unknown',
			exec: buildExec(
				'https://git.example.test/acme/widget.git',
				'[{"name":"release"}]',
			),
		});

		const result = await adapter.refresh();

		expect(result).toMatchObject({
			ok: true,
			state: 'fresh',
			provider: 'gitlab',
			remoteHost: 'git.example.test',
			remoteBranches: ['release'],
		});
	});

	it('reports refresh errors without dropping the local fallback', async () => {
		const configured = policy(['trunk']);
		const adapter = createBranchProtectionAdapter({
			workspaceRoot: '/workspace',
			policy: configured,
			exec: async (input) => {
				if (input.tool.bin === 'git') {
					if (input.args[0] === 'rev-parse')
						return ok('origin/trunk\n');
					return ok('git@github.com:acme/widget.git\n');
				}
				return {
					ok: false,
					code: 1,
					stdout: '',
					stderr: 'gh auth expired',
					timedOut: false,
					unavailable: false,
				};
			},
		});

		const result = await adapter.refresh();

		expect(result).toEqual({
			ok: false,
			state: 'error',
			provider: 'github',
			remoteName: 'origin',
			remoteHost: 'github.com',
			reason: 'gh auth expired',
			remoteBranches: [],
			effectiveBranches: ['trunk'],
		});
		expect(configured.protectedBranches).toEqual(['trunk']);
	});

	it('returns structured tool output for unsupported remotes', async () => {
		const configured = policy(['trunk']);
		const adapter = createBranchProtectionAdapter({
			workspaceRoot: '/workspace',
			policy: configured,
			exec: buildExec('https://example.com/acme/widget.git', ''),
		});

		const result = await runBranchProtectionRefresh(adapter);

		expect(result).toEqual(
			expect.objectContaining({
				structuredContent: expect.objectContaining({
					ok: false,
					state: 'unsupported',
					provider: 'unknown',
					remoteName: 'origin',
					remoteHost: 'example.com',
					effectiveBranches: ['trunk'],
				}),
			}),
		);
	});
});
