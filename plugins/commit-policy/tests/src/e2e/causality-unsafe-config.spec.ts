/**
 * causality-unsafe-config.spec.ts — the test that was missing.
 *
 * Every other causality test in this plugin runs under a SAFE
 * config (`sliceScoping: true`, `allowForeignChanges: false`) and
 * calls `runCommitDriver` directly. Neither matches production:
 *
 *   - This repo's own config is deliberately the dangerous one —
 *     `sliceScoping: false`, `allowForeignChanges: true`, slice
 *     trigger on, push on commit to a shared `develop`. That is
 *     the configuration the swarm actually runs under, so it is
 *     the configuration that has to be safe.
 *
 *   - The automatic slice listener does not call
 *     `runCommitDriver`. It goes through the engine. Until
 *     2026-09-03 the engine carried its OWN private copy of the
 *     commit logic, so the green tests below proved nothing about
 *     the path that fires on every slice event. Both copies are
 *     now one; these tests pin that down so it cannot silently
 *     fork again.
 *
 * The invariant under test, stated once:
 *
 *   Foreign dirt MAY coexist in the worktree.
 *   Foreign dirt may NEVER enter someone else's commit.
 *
 * `allowForeignChanges: true` grants the first. It has never
 * granted the second, and it must not be able to.
 */

import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import type { IGitRunner } from '@delendai/core/public';

import { CommitPolicyOptionsSchema } from '../../../src/lib/contracts/options';
import { createCommitPolicyEngine } from '../../../src/lib/engine';

import {
	cleanupDogfoodRepo,
	createDogfoodRepo,
	git,
} from './_fixtures/dogfood-repo';

/**
 * The repo's real, deliberately permissive cadence. Do not "fix"
 * this to a safe config — the point of the file is that safety
 * must not depend on it.
 */
const UNSAFE = CommitPolicyOptionsSchema.parse({
	commit: { enabled: true },
	identity: { mode: 'global' },
	cadence: {
		triggers: [{ kind: 'slice' }],
		sliceScoping: false,
		allowForeignChanges: true,
	},
	push: { enabled: false },
});

describe('slice causality under the permissive cadence', () => {
	let workspace = '';
	let remote = '';
	let runner: IGitRunner;

	const engineFor = (): ReturnType<typeof createCommitPolicyEngine> =>
		createCommitPolicyEngine({
			driver: {
				run: runner,
				policy: UNSAFE,
				identityCtx: {
					run: runner,
					envVars: Object.freeze({}),
					hostIdentity: { host: 'test', model: 'test' },
				},
				workspaceRoot: workspace,
				auditAgent: null,
			},
			branchPolicy: {
				protected: UNSAFE.push.protectedBranches,
				protectedPrefixes: UNSAFE.push.protectedPrefixes,
			},
		});

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

	const hashOf = async (file: string): Promise<string> =>
		(await git(workspace, 'hash-object', file)).stdout.trim();

	beforeEach(async () => {
		({ workspace, remote, runner } = await createDogfoodRepo());
		await git(workspace, 'checkout', '-q', 'develop');
	});
	afterEach(async () => {
		await cleanupDogfoodRepo({ workspace, remote });
	});

	it('commits only the slice-owned file and leaves foreign dirt untouched', async () => {
		await writeFile(join(workspace, 'A.ts'), 'export const A = 1;\n');
		await writeFile(join(workspace, 'B.ts'), 'export const B = 1;\n');
		const originalB = await hashOf('B.ts');

		const result = await engineFor().handle({
			kind: 'slice',
			proposalId: 'f00417',
			sliceId: 'S1',
			files: ['A.ts'],
			eventId: 'ev-a-only',
		});

		expect(result.ack).toBe('OK');
		// The whole point: B.ts is dirty and `allowForeignChanges`
		// is true, and it still must not be in this commit.
		expect(await filesAtHead()).toEqual(['A.ts']);
		expect(await hashOf('B.ts')).toBe(originalB);

		const { stdout } = await git(workspace, 'status', '--porcelain');
		expect(stdout).toContain('B.ts');
	});

	it('commits exactly one owned file with a hundred foreign files dirty', async () => {
		// The scale version. A sweep would pick up all 101.
		const foreign: string[] = [];
		for (let index = 0; index < 100; index += 1) {
			const name = `foreign-${String(index).padStart(3, '0')}.ts`;
			await writeFile(
				join(workspace, name),
				`export const f${String(index)} = ${String(index)};\n`,
			);
			foreign.push(name);
		}
		await writeFile(
			join(workspace, 'owned.ts'),
			'export const owned = 1;\n',
		);
		const before = new Map<string, string>();
		for (const name of foreign) {
			before.set(name, await hashOf(name));
		}

		const result = await engineFor().handle({
			kind: 'slice',
			proposalId: 'f00417',
			sliceId: 'S2',
			files: ['owned.ts'],
			eventId: 'ev-owned-only',
		});

		expect(result.ack).toBe('OK');
		expect(await filesAtHead()).toEqual(['owned.ts']);
		for (const name of foreign) {
			expect(await hashOf(name)).toBe(before.get(name));
		}
	});

	it('answers OK and does not ask to be retried when the files already match HEAD', async () => {
		// A slice whose work is already committed is DONE, not
		// failed. Answering ERR here left the event pending in the
		// listener, which scheduled another attempt, which got the
		// same answer — a single-slice retry loop.
		await writeFile(join(workspace, 'A.ts'), 'export const A = 1;\n');
		const first = await engineFor().handle({
			kind: 'slice',
			proposalId: 'f00417',
			sliceId: 'S3',
			files: ['A.ts'],
			eventId: 'ev-first',
		});
		expect(first.ack).toBe('OK');

		const second = await engineFor().handle({
			kind: 'slice',
			proposalId: 'f00417',
			sliceId: 'S3b',
			files: ['A.ts'],
			eventId: 'ev-already-done',
		});
		expect(second.ack).toBe('OK');
		// No second commit: HEAD is unchanged.
		expect(await filesAtHead()).toEqual(['A.ts']);
		const { stdout } = await git(workspace, 'rev-list', '--count', 'HEAD');
		expect(Number(stdout.trim())).toBe(2);
	});
});
