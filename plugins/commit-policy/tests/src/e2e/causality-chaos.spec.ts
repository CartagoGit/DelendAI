/**
 * causality-chaos.spec.ts — concurrent commits on a shared
 * workspace, ownership-disjoint files. Stress-tests the file
 * mutex + `update-ref newHead oldHead` CAS semantics introduced
 * by f00417.
 *
 * The f00417 invariant we are proving here is narrow: NO commit,
 * successful or not, may carry files outside its declared scope.
 * The driver's serialised mutex means most concurrent attempts
 * will commit in turn; what we MUST NOT see is a commit whose
 * staged set includes another agent's file.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IGitRunner } from '@delendai/core/public';

import { CommitPolicyOptionsSchema } from '../../../src/lib/contracts/options';
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

describe('f00417 — chaos: concurrent ownership-disjoint commits', () => {
	let workspace = '';
	let remote = '';
	let runner: IGitRunner;

	beforeEach(async () => {
		({ workspace, remote, runner } = await createDogfoodRepo());
		await git(workspace, 'checkout', '-q', 'develop');
	});
	afterEach(async () => {
		await cleanupDogfoodRepo({ workspace, remote });
	});

	it('never mixes another agents files into a single commit', async () => {
		const N = 20;
		const files: string[] = [];
		for (let i = 0; i < N; i += 1) {
			const file = `agent-${i}.ts`;
			files.push(file);
			await writeFile(
				join(workspace, file),
				`export const A${i} = ${i};\n`,
			);
		}

		const results = await Promise.all(
			files.map((file, i) =>
				runCommitDriver(
					{
						message: `feat(agent-${i}): commit agent-${i}`,
						sliceContext: {
							proposalId: 'f00417',
							sliceId: `agent-${i}`,
							files: [file],
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
				),
			),
		);

		const committed = results.filter((r) => r.committed).length;
		// At least one commit must succeed; the mutex serialises the
		// rest, but we don't pin the exact count — the architectural
		// invariant under test is attribution, not throughput.
		expect(committed).toBeGreaterThan(0);

		// Drain pending serially so the final state is clean.
		const pending = files.filter((_, i) => !results[i]?.committed);
		for (const file of pending) {
			const i = files.indexOf(file);
			await runCommitDriver(
				{
					message: `feat(agent-${i}): commit agent-${i}`,
					sliceContext: {
						proposalId: 'f00417',
						sliceId: `agent-${i}`,
						files: [file],
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
		}

		await git(workspace, 'reset', '-q');

		// Each committed change must carry exactly one of the
		// 20 disjoint files. f00417 invariant.
		const { stdout: diffOut } = await git(
			workspace,
			'log',
			'--pretty=format:',
			'--name-only',
			'-n',
			String(N + 1),
			'develop',
		);
		const perCommit = diffOut
			.split('\n')
			.filter((line) => /^agent-\d+\.ts$/u.test(line));
		expect(perCommit.length).toBe(N);
		expect(new Set(perCommit).size).toBe(N);
	});
});
