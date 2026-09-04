import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IGitRunner, IGitRunResult } from '@delendai/core/public';

import type { ICommitPolicyOptions } from '@delendai/commit-policy/lib/contracts/options';
import { runCommitPolicyRun } from '@delendai/commit-policy/lib/tools/run-tool';

const ok = (output: string): IGitRunResult => ({ ok: true, output });

const buildRunner = (currentBranch: string): IGitRunner => {
	const handler = (args: readonly string[]): Promise<IGitRunResult> => {
		if (args[0] === 'rev-parse' && args.includes('--abbrev-ref')) {
			return Promise.resolve(ok(`${currentBranch}\n`));
		}
		if (args[0] === 'config') {
			return Promise.resolve(ok('Cartago\n'));
		}
		return Promise.resolve(ok(''));
	};
	return handler as IGitRunner;
};

const buildPolicy = (): ICommitPolicyOptions => ({
	gitTimeoutMs: 60_000,
	commit: {
		enabled: true,
		requireConventional: false,
		autoScopeFromProposal: false,
		refuseWhenDisabled: false,
	},
	stash: { enabled: false },
	identity: { mode: 'global' },
	audit: { trailer: 'none', agentFormat: '${host}/${model}' },
	cadence: {
		triggers: [{ kind: 'slice', onStatuses: ['done'] }],
		sliceScoping: false,
		allowForeignChanges: true,
		// This suite does not exercise the quiet period.
		quietPeriodMs: 0,
	},
	push: {
		enabled: false,
		onCommit: false,
		everyNCommits: 0,
		everyNMinutes: 0,
		protectedBranches: ['main', 'master'],
		protectedPrefixes: ['release/', 'hotfix/'],
		force: 'with-lease',
	},
});

const writeIndex = async (
	workspaceRoot: string,
	proposals: readonly {
		id: string;
		slices: readonly {
			id: string;
			status: string;
			files?: readonly string[];
		}[];
	}[],
): Promise<void> => {
	await mkdir(join(workspaceRoot, 'docs', 'proposals'), { recursive: true });
	await writeFile(
		join(workspaceRoot, 'docs', 'proposals', 'index.json'),
		JSON.stringify({ proposals }, null, 2),
		'utf8',
	);
};

const runOptions = (workspaceRoot: string) => {
	const run = buildRunner('develop');
	return {
		workspaceRoot,
		docsDir: 'docs',
		namespacePrefix: 'mcp-vertex',
		policy: buildPolicy(),
		run,
		identityCtx: {
			run,
			envVars: {},
		},
		auditAgent: null,
	};
};

const refusalReason = (
	result: Awaited<ReturnType<typeof runCommitPolicyRun>>,
): string => {
	const body = result.structuredContent as {
		error?: { reason?: string };
	};
	return body.error?.reason ?? '';
};

describe('commit_policy_run', () => {
	let workspaceRoot = '';

	beforeEach(async () => {
		workspaceRoot = await mkdtemp(
			join(tmpdir(), 'commit-policy-run-tool-'),
		);
	});

	afterEach(async () => {
		if (workspaceRoot.length > 0) {
			await rm(workspaceRoot, { recursive: true, force: true });
		}
	});

	it('refuses SELECTOR_REQUIRED for slice without proposalId and sliceId', async () => {
		const result = await runCommitPolicyRun(
			{ kind: 'slice', dryRun: true },
			runOptions(workspaceRoot),
		);
		expect(result.isError).toBe(true);
		expect(refusalReason(result)).toBe('SELECTOR_REQUIRED');
	});

	it('refuses INCOMPLETE_SELECTOR for a partial or blank slice selector', async () => {
		const partial = await runCommitPolicyRun(
			{ kind: 'slice', proposalId: 'f00181', dryRun: true },
			runOptions(workspaceRoot),
		);
		expect(partial.isError).toBe(true);
		expect(refusalReason(partial)).toBe('INCOMPLETE_SELECTOR');

		const blank = await runCommitPolicyRun(
			{ kind: 'slice', proposalId: '', sliceId: '', dryRun: true },
			runOptions(workspaceRoot),
		);
		expect(blank.isError).toBe(true);
		expect(refusalReason(blank)).toBe('INCOMPLETE_SELECTOR');
	});

	it('refuses SLICE_NOT_FOUND for an exact selector that is absent', async () => {
		await writeIndex(workspaceRoot, [
			{
				id: 'f00181',
				slices: [{ id: 'S1', status: 'done', files: ['only-this.ts'] }],
			},
		]);
		const result = await runCommitPolicyRun(
			{
				kind: 'slice',
				proposalId: 'f00181',
				sliceId: 'S9',
				dryRun: true,
			},
			runOptions(workspaceRoot),
		);
		expect(result.isError).toBe(true);
		expect(refusalReason(result)).toBe('SLICE_NOT_FOUND: f00181-S9');
	});

	it('uses the exact proposalId+sliceId selector for slice dryRun', async () => {
		await writeIndex(workspaceRoot, [
			{
				id: 'f00181',
				slices: [
					{ id: 'S1', status: 'done', files: ['other-slice.ts'] },
					{ id: 'S2', status: 'done', files: ['only-this.ts'] },
				],
			},
			{
				id: 'f00999',
				slices: [
					{
						id: 'S2',
						status: 'done',
						files: ['wrong-proposal.ts'],
					},
				],
			},
		]);
		const result = await runCommitPolicyRun(
			{
				kind: 'slice',
				proposalId: 'f00181',
				sliceId: 'S2',
				dryRun: true,
			},
			runOptions(workspaceRoot),
		);
		expect(result.isError).toBeUndefined();
		const body = result.structuredContent as {
			ok: boolean;
			dryRun: boolean;
			wouldChange: Array<{ path: string }>;
			wouldRun: Array<{ target: string }>;
		};
		expect(body.ok).toBe(true);
		expect(body.dryRun).toBe(true);
		expect(body.wouldChange.map((entry) => entry.path)).toEqual([
			'only-this.ts',
		]);
		expect(body.wouldRun[1]?.target).toContain(
			'feat(f00181): commit via slice',
		);
	});

	it('allows kind=manual without a selector', async () => {
		const result = await runCommitPolicyRun(
			{ kind: 'manual', dryRun: true },
			runOptions(workspaceRoot),
		);
		expect(result.isError).toBeUndefined();
		const body = result.structuredContent as {
			ok: boolean;
			dryRun: boolean;
			wouldChange: unknown[];
		};
		expect(body.ok).toBe(true);
		expect(body.dryRun).toBe(true);
		expect(body.wouldChange).toEqual([]);
	});
});
