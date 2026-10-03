/**
 * causality-shared-workspace.spec.ts — the architectural test that
 * defines f00417.
 *
 * Scenario: three agents A, B, C each own exactly one file
 * (`A.ts`, `B.ts`, `C.ts`) on a shared checkout. They commit in
 * order. The test asserts:
 *
 *   - commits land on `develop` in order;
 *   - the commits carry ONLY the agent's owned file — never
 *     someone else's;
 *   - foreign dirty files in the workspace are not touched, even
 *     though they exist and are observable;
 *   - no `git reset`/`git checkout --` style escapes modify
 *     unrelated working-tree bytes.
 *
 * If any of these fail, f00417 is broken: misattributed commits
 * are back.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IGitRunner } from '@delendai/core/public';

import { CommitPolicyOptionsSchema } from '../../../src/lib/contracts/options';
import { resolveCommitScope } from '../../../src/lib/services/resolve-scope';
import { runCommitDriver } from '../../../src/lib/services/commit-driver';

import {
	cleanupDogfoodRepo,
	createDogfoodRepo,
	git,
} from './_fixtures/dogfood-repo';

const SCOPED = CommitPolicyOptionsSchema.parse({
	commit: { enabled: true },
	identity: { mode: 'global' },
	cadence: {
		triggers: [{ kind: 'slice' }],
		sliceScoping: true,
		allowForeignChanges: false,
	},
	push: { enabled: false },
});

describe('f00417 — causality on a shared workspace', () => {
	let workspace = '';
	let remote = '';
	let runner: IGitRunner;

	const headShort = async (): Promise<string> => {
		const { stdout } = await git(workspace, 'rev-parse', '--short', 'HEAD');
		return stdout.trim();
	};

	const filesAtHead = async (): Promise<readonly string[]> => {
		const { stdout } = await git(
			workspace,
			'show',
			'--pretty=format:',
			'--name-only',
			'HEAD',
		);
		return stdout.split('\n').filter(Boolean).sort();
	};

	const porcelain = async (): Promise<readonly string[]> => {
		const { stdout } = await git(workspace, 'status', '--porcelain');
		return stdout.split('\n').filter(Boolean);
	};

	beforeEach(async () => {
		({ workspace, remote, runner } = await createDogfoodRepo());
		await git(workspace, 'checkout', '-q', 'develop');
	});
	afterEach(async () => {
		await cleanupDogfoodRepo({ workspace, remote });
	});

	it('commits A, B, C in order with disjoint file sets and never touches foreign dirty bytes', async () => {
		const initial = await headShort();

		// Three agents all dirty their files at once, simulating a swarm
		// mid-edit when agent A's slice trigger fires first.
		await writeFile(join(workspace, 'A.ts'), 'export const A = 1;\n');
		await writeFile(join(workspace, 'B.ts'), 'export const B = 1;\n');
		await writeFile(join(workspace, 'C.ts'), 'export const C = 1;\n');

		// Snapshot the dirty bytes of B and C so we can assert they
		// survive agent A's commit unchanged.
		const originalB = (
			await git(workspace, 'hash-object', 'B.ts')
		).stdout.trim();
		const originalC = (
			await git(workspace, 'hash-object', 'C.ts')
		).stdout.trim();

		// Agent A's slice fires: only A.ts is in scope.
		const scopeA = resolveCommitScope({
			proposalId: 'f00417',
			sliceId: 'A',
			declaredFiles: ['A.ts'],
			workspaceDirty: ['A.ts', 'B.ts', 'C.ts'],
		});
		expect(scopeA.files).toEqual(['A.ts']);

		const resultA = await runCommitDriver(
			{
				message: 'feat(A): commit A',
				sliceContext: {
					proposalId: 'f00417',
					sliceId: 'A',
					files: scopeA.files,
				},
			},
			{
				run: runner,
				policy: SCOPED,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
					hostIdentity: { host: 'test', model: 'test' },
				},
				workspaceRoot: workspace,
				auditAgent: null,
			},
		);
		expect(resultA.committed).toBe(true);
		expect(await filesAtHead()).toEqual(['A.ts']);
		const h1 = await headShort();
		expect(h1).not.toBe(initial);

		// Foreign bytes must survive untouched.
		const newB = (
			await git(workspace, 'hash-object', 'B.ts')
		).stdout.trim();
		const newC = (
			await git(workspace, 'hash-object', 'C.ts')
		).stdout.trim();
		expect(newB).toBe(originalB);
		expect(newC).toBe(originalC);

		// B and C still dirty in the worktree.
		const dirty = await porcelain();
		expect(dirty.some((line) => line.endsWith(' B.ts'))).toBe(true);
		expect(dirty.some((line) => line.endsWith(' C.ts'))).toBe(true);

		// Now agent B's slice fires.
		const resultB = await runCommitDriver(
			{
				message: 'feat(B): commit B',
				sliceContext: {
					proposalId: 'f00417',
					sliceId: 'B',
					files: ['B.ts'],
				},
			},
			{
				run: runner,
				policy: SCOPED,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
					hostIdentity: { host: 'test', model: 'test' },
				},
				workspaceRoot: workspace,
				auditAgent: null,
			},
		);
		expect(resultB.committed).toBe(true);
		expect(await filesAtHead()).toEqual(['B.ts']);
		const h2 = await headShort();
		expect(h2).not.toBe(h1);

		// Agent C's slice fires.
		const resultC = await runCommitDriver(
			{
				message: 'feat(C): commit C',
				sliceContext: {
					proposalId: 'f00417',
					sliceId: 'C',
					files: ['C.ts'],
				},
			},
			{
				run: runner,
				policy: SCOPED,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
					hostIdentity: { host: 'test', model: 'test' },
				},
				workspaceRoot: workspace,
				auditAgent: null,
			},
		);
		expect(resultC.committed).toBe(true);
		expect(await filesAtHead()).toEqual(['C.ts']);
		const h3 = await headShort();
		expect(h3).not.toBe(h2);

		// Workspace is clean.
		const dirtyFinal = await porcelain();
		expect(dirtyFinal).toEqual([]);

		// Linear history, no merge commits.
		const { stdout: logStdout } = await git(
			workspace,
			'log',
			'--oneline',
			'--no-merges',
			'develop',
		);
		const logLines = logStdout.split('\n').filter(Boolean);
		expect(logLines.length).toBeGreaterThanOrEqual(4); // initial + 3 commits
	});

	it('refuses a slice whose declared files resolve to zero canonical paths', async () => {
		await writeFile(join(workspace, 'A.ts'), 'export const A = 1;\n');
		const before = await headShort();
		const result = await runCommitDriver(
			{
				message: 'feat(f00417): unresolvable',
				sliceContext: {
					proposalId: 'f00417',
					sliceId: 'S-unresolvable',
					// Intentionally weird entries the resolver must drop.
					files: ['[a](b/c.ts)', 'foo.ts (or equivalent)'],
				},
			},
			{
				run: runner,
				policy: SCOPED,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
					hostIdentity: { host: 'test', model: 'test' },
				},
				workspaceRoot: workspace,
				auditAgent: null,
			},
		);
		expect(result.committed).toBe(false);
		// Worktree stays dirty because the commit was refused at scope
		// resolution; nothing was staged.
		const dirty = await porcelain();
		expect(dirty.some((line) => line.endsWith(' A.ts'))).toBe(true);
		const after = await headShort();
		expect(after).toBe(before);
	});
});
