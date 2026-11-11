/**
 * delegation-manifest.service.spec.ts — a delegated step goes with a
 * manifest of what it may open, and a step too large is refused.
 */
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { createFileArtifactStore } from '@delendai/core/runtime';
import { asWorktreeId, type StateScope } from '@delendai/state';

import {
	DelegationTooLargeError,
	changeContextSource,
	delegationFor,
	taskFilesSource,
} from '../../../../src/lib/dispatch/delegation-manifest.service';
import { LinearDispatcher } from '../../../../src/lib/dispatch/linear-dispatcher';
import {
	DEFAULT_BUDGET_POLICY,
	DEFAULT_ROTATION_POLICY,
	type IModePlan,
} from '../../../../src/lib/policy/types';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/w',
		worktreeId: asWorktreeId('delegation-spec'),
		cacheRoot: '.cache/delendai',
		docsRoot: 'docs/delendai',
	},
};

describe('delegationFor', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const workspace = (): string => {
		const dir = mkdtempSync(join(tmpdir(), 'delegation-'));
		dirs.push(dir);
		writeFileSync(join(dir, 'a.ts'), 'export const a = 1;\n');
		return dir;
	};
	const step = {
		order: 1,
		kind: 'spawn' as const,
		instruction: 'Rename a to b',
	};
	const task = {
		id: 't1',
		description: 'rename',
		files: ['a.ts', 'missing.ts'],
		tags: [],
		acceptance: ['bun run typecheck'],
	};
	const delegate = (root: string, inputBudget: number) =>
		delegationFor({
			store: createFileArtifactStore({ root: join(root, '.store') }),
			scope,
			sources: [taskFilesSource(root)],
			contractHash: 'sha256:policy',
			inputBudget,
		})(task);

	it('compiles a manifest of the files the task names, by reference', async () => {
		const root = workspace();
		const delegated = await delegate(root, 1000)(step);
		expect(delegated).toMatchObject({
			objective: 'Rename a to b',
			contractHash: 'sha256:policy',
			allowedTools: ['read', 'search', 'execute', 'todo', 'edit'],
			acceptance: ['bun run typecheck'],
			inputBudget: 1000,
			moreContext: { allowed: false },
		});
		// The file the task names but the workspace lacks is said, not dropped.
		expect(delegated.missingContext).toEqual([
			{ id: 'files:missing.ts', reason: expect.any(String) },
		]);
		expect(delegated.manifestId.length).toBeGreaterThan(0);
		expect((await delegate(root, 1000)(step)).manifestId).toBe(
			delegated.manifestId,
		);
	});

	it("gives a step its role's tools, and a read-only role no edit", async () => {
		const root = workspace();
		const delegated = await delegationFor({
			store: createFileArtifactStore({ root: join(root, '.store') }),
			scope,
			sources: [taskFilesSource(root)],
			contractHash: 'sha256:policy',
			inputBudget: 1000,
		})({ id: 't2', description: 'look', files: ['a.ts'], tags: [] })({
			...step,
			subagentRole: 'scout',
		});
		expect(delegated.allowedTools).toEqual([
			'read',
			'search',
			'execute',
			'todo',
		]);
		expect(delegated.allowedTools).not.toContain('edit');
		expect(delegated.acceptance).toEqual([]);
		expect(delegated.missingContext).toBeUndefined();
	});

	it('refuses a step whose context is over its input budget', async () => {
		await expect(delegate(workspace(), 1)(step)).rejects.toBeInstanceOf(
			DelegationTooLargeError,
		);
	});

	it('hands the manifest to the subagent, and fails a step too large without spawning it', async () => {
		const spawned: unknown[] = [];
		const port = {
			spawnSubagent: async (input: unknown) => {
				spawned.push(input);
				return {
					subagentId: 's1',
					tokensUsed: 1,
					output: 'ok',
					schemaOk: true,
					hadError: false,
				};
			},
		};
		const plan: IModePlan = {
			mode: 'linear',
			rationale: 'test',
			steps: [{ ...step, subagentRole: 'implementer' }],
			budget: DEFAULT_BUDGET_POLICY,
			rotation: DEFAULT_ROTATION_POLICY,
		};
		const root = workspace();
		await new LinearDispatcher(
			plan,
			port,
			't1',
			undefined,
			undefined,
			delegate(root, 1000),
		).run();
		expect(spawned[0]).toHaveProperty('task.manifestId');
		spawned.length = 0;
		await new LinearDispatcher(
			plan,
			port,
			't1',
			undefined,
			undefined,
			delegate(root, 1),
		).run();
		expect(spawned).toEqual([]);
	});
});

describe('changeContextSource', () => {
	const task = { id: 't1', description: 'rename', files: ['a.ts'], tags: [] };

	it('makes each section context-for-change gathers one item', async () => {
		const asked: unknown[] = [];
		const items = await changeContextSource(async (files) => {
			asked.push(files);
			return [
				{ source: 'code', summary: 'a.ts exports a' },
				{ source: 'memory', summary: 'a is renamed in v2' },
			];
		}).items(task);
		expect(asked).toEqual([['a.ts']]);
		expect(items).toEqual([
			{
				id: '0:code',
				value: { source: 'code', summary: 'a.ts exports a' },
			},
			{
				id: '1:memory',
				value: { source: 'memory', summary: 'a is renamed in v2' },
			},
		]);
	});

	it('asks nothing for a task with no files, and says what it could not gather', async () => {
		let asked = false;
		const source = changeContextSource(async () => {
			asked = true;
			throw new Error('no index');
		});
		expect(await source.items({ ...task, files: [] })).toEqual([]);
		expect(asked).toBe(false);
		expect(await source.items(task)).toEqual([
			{ id: 'context-for-change', missing: 'no index' },
		]);
	});
});
