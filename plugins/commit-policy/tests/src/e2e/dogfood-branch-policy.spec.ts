/**
 * tests/src/e2e/dogfood-branch-policy.spec.ts — the end-to-end cases
 * about WHERE commit-policy is allowed to write: protected branches,
 * one branch policy shared by status/commit/push, and dry-run.
 *
 * Split out of `dogfood.spec.ts`, which had grown past the point where
 * a reader could see which case asserted what.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IGitRunner } from '@delendai/core/public';

import { CommitPolicyOptionsSchema } from '../../../src/lib/contracts/options';
import { runCommitDriver } from '../../../src/lib/services/commit-driver';
import { createPushScheduler } from '../../../src/lib/services/push-scheduler';
import { runCommitPolicyRun } from '../../../src/lib/tools/run-tool';
import { runCommitPolicyStatus } from '../../../src/lib/tools/status-tool';
import {
	cleanupDogfoodRepo,
	createDogfoodRepo,
	git,
} from './_fixtures/dogfood-repo';

describe('commit-policy dogfood E2E — branch policy', () => {
	let workspace = '';
	let remote = '';
	let runner: IGitRunner;

	beforeEach(async () => {
		({ workspace, remote, runner } = await createDogfoodRepo());
	});

	afterEach(async () => {
		await cleanupDogfoodRepo({ workspace, remote });
	});

	it('refuses to push to a protected branch even with onCommit=true', async () => {
		await git(workspace, 'checkout', '-q', '-b', 'main');
		await git(workspace, 'push', '-q', '-u', 'origin', 'main');
		const policy = CommitPolicyOptionsSchema.parse({
			commit: { enabled: true },
			identity: { mode: 'global' },
			cadence: { triggers: [], sliceScoping: false },
			push: {
				enabled: true,
				onCommit: true,
				force: 'with-lease',
				protectedBranches: ['main', 'master'],
				remote: 'origin',
				branch: 'main',
			},
		});
		const result = await createPushScheduler({
			run: runner,
			policy: policy.push,
		}).pushNow();
		expect(result.ok).toBe(false);
		if (result.ok) return;
		// x00272 (Track A): direct push to `main` is hard-blocked regardless
		// of the protectedBranches config — the refusal codes as
		// DIRECT_PUSH_TO_MAIN_NOT_ALLOWED (a defense-in-depth layer).
		expect(result.code).toBe('DIRECT_PUSH_TO_MAIN_NOT_ALLOWED');
	});

	it('uses the same configurable branch policy in status, commit and push', async () => {
		await git(workspace, 'checkout', '-q', '-b', 'release/candidate');
		const policy = CommitPolicyOptionsSchema.parse({
			commit: { enabled: true },
			identity: { mode: 'global' },
			push: {
				enabled: true,
				protectedBranches: ['release/candidate'],
				remote: 'origin',
				branch: 'release/candidate',
			},
		});
		const status = await runCommitPolicyStatus({
			namespacePrefix: 'mcp-vertex',
			options: policy,
			identityCtx: { run: runner, envVars: Object.freeze({}) },
		});
		const statusBody = status.structuredContent as {
			branchPolicy: { directCommitPushAllowed: boolean };
		};
		expect(statusBody.branchPolicy.directCommitPushAllowed).toBe(false);

		await writeFile(
			join(workspace, 'protected.ts'),
			'export const protectedBranch = true;\n',
			'utf8',
		);
		const commitResult = await runCommitDriver(
			{ message: 'feat: protected branch', files: ['protected.ts'] },
			{
				run: runner,
				policy,
				identityCtx: { run: runner, envVars: Object.freeze({}) },
				auditAgent: null,
			},
		);
		expect(commitResult.committed).toBe(false);
		expect(commitResult.refusal).toContain('BRANCH_PROTECTED');

		const pushResult = await createPushScheduler({
			run: runner,
			policy: policy.push,
		}).pushNow();
		expect(pushResult.ok).toBe(false);
		if (!pushResult.ok)
			expect(pushResult.refusal).toContain('BRANCH_PROTECTED');
	});

	it('runs dry-run end to end without creating a commit', async () => {
		const policy = CommitPolicyOptionsSchema.parse({
			commit: { enabled: true },
			identity: { mode: 'global' },
			cadence: { triggers: [{ kind: 'manual' }] },
			push: { enabled: true, onCommit: true },
		});
		const before = await git(workspace, 'rev-parse', 'HEAD');
		const result = await runCommitPolicyRun(
			{ kind: 'manual', dryRun: true },
			{
				namespacePrefix: 'mcp-vertex',
				workspaceRoot: workspace,
				docsDir: 'docs',
				policy,
				run: runner,
				identityCtx: { run: runner, envVars: Object.freeze({}) },
				auditAgent: null,
			},
		);
		const body = result.structuredContent as {
			ok: boolean;
			dryRun: boolean;
			wouldRun: readonly unknown[];
		};
		expect(result.isError).toBeUndefined();
		expect(body.ok).toBe(true);
		expect(body.dryRun).toBe(true);
		expect(body.wouldRun.length).toBeGreaterThan(0);
		const after = await git(workspace, 'rev-parse', 'HEAD');
		expect(after.stdout.trim()).toBe(before.stdout.trim());
	});
});
