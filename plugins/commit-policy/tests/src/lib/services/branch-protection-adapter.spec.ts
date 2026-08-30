import { describe, expect, it } from 'vitest';

import type {
	IExternalToolRun,
	IRunExternalToolInput,
} from '@mcp-vertex/core/public';

import type { ICommitPolicyPush } from '@mcp-vertex/commit-policy/lib/contracts/options';
import {
	createBranchProtectionAdapter,
	type BranchProtectionAdapterOptions,
} from '@mcp-vertex/commit-policy/lib/services/branch-protection-adapter';

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
		if (input.tool.bin === 'git') return ok(`${remoteUrl}\n`);
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
			provider: 'github',
			remoteBranches: ['production', 'trunk'],
			effectiveBranches: ['release', 'production', 'trunk'],
		});
		expect(configured.protectedBranches).toEqual([
			'release',
			'production',
			'trunk',
		]);
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
			provider: 'gitlab',
			remoteBranches: ['staging'],
			effectiveBranches: ['trunk', 'staging'],
		});
		expect(configured.protectedBranches).toEqual(['trunk', 'staging']);
	});

	it('keeps local protection when no supported forge can be detected', async () => {
		const configured = policy(['trunk']);
		const adapter = createBranchProtectionAdapter({
			workspaceRoot: '/workspace',
			policy: configured,
			exec: buildExec('https://example.com/acme/widget.git', ''),
		});

		const result = await adapter.refresh();

		expect(result.ok).toBe(false);
		expect(configured.protectedBranches).toEqual(['trunk']);
	});
});
