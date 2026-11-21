/**
 * migration-preview.service.spec.ts — the preview runs the guard on a
 * copy of the workspace and reports what it did as the plan.
 */
import {
	existsSync,
	mkdirSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import type { IMigrationRunResult } from '@delendai/core/lib/contracts/interfaces/workspace-migration.interface';
import { previewInScratchCopy } from '@delendai/core/lib/workspace-migration/migration-preview.service';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const workspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'migrate-preview-'));
	roots.push(root);
	writeFileSync(join(root, 'delendai.config.json'), '{}\n');
	mkdirSync(join(root, 'node_modules/pkg'), { recursive: true });
	writeFileSync(join(root, 'node_modules/pkg/index.js'), '');
	mkdirSync(join(root, '.git'), { recursive: true });
	writeFileSync(join(root, '.git/HEAD'), 'ref: refs/heads/main\n');
	mkdirSync(join(root, 'src/deep'), { recursive: true });
	writeFileSync(join(root, 'src/deep/a.ts'), 'export {};\n');
	return root;
};

describe('previewInScratchCopy', () => {
	it('runs the route on a copy without installed packages or the repository, and leaves the workspace alone', async () => {
		const root = workspace();
		const seen: Record<string, boolean> = {};
		let journalled: readonly string[] = [];
		const result = await previewInScratchCopy(
			{
				migrations: [],
				journal: {
					read: async () => ['already:v1'],
					record: async () => {
						throw new Error('the real journal is never written');
					},
				},
				workspaceRoot: root,
			},
			async (input): Promise<IMigrationRunResult> => {
				seen.config = existsSync(
					join(input.workspaceRoot, 'delendai.config.json'),
				);
				seen.deep = existsSync(
					join(input.workspaceRoot, 'src/deep/a.ts'),
				);
				seen.modules = existsSync(
					join(input.workspaceRoot, 'node_modules'),
				);
				seen.git = existsSync(join(input.workspaceRoot, '.git'));
				await input.journal.record(input.workspaceRoot, 'new:v1');
				journalled = await input.journal.read(input.workspaceRoot);
				writeFileSync(
					join(input.workspaceRoot, 'written-by-route.txt'),
					'x',
				);
				return {
					outcomes: [
						{
							status: 'migrated',
							id: 'new:v1',
							steps: [{ kind: 'k', detail: 'd' }],
						},
						{ status: 'migrated', id: 'bare:v1' },
						{ status: 'not-needed' },
					],
					acted: true,
					transitions: {
						previousSource: 'recorded',
						outcomes: [
							{ status: 'applied', id: 't1', steps: [] },
							{ status: 'failed', id: 't2', reason: 'r' },
						],
						acted: true,
						recorded: 'unchanged',
						recordPath: 'config-snapshot.json',
					},
				};
			},
		);

		expect(seen).toEqual({
			config: true,
			deep: true,
			modules: false,
			git: false,
		});
		expect(journalled).toEqual(['already:v1', 'new:v1']);
		expect(existsSync(join(root, 'written-by-route.txt'))).toBe(false);
		expect(result.outcomes).toEqual([
			{
				status: 'planned',
				id: 'new:v1',
				steps: [{ kind: 'k', detail: 'd' }],
			},
			{ status: 'planned', id: 'bare:v1', steps: [] },
			{ status: 'not-needed' },
		]);
		expect(
			result.transitions?.outcomes.map((outcome) => outcome.status),
		).toEqual(['planned', 'failed']);
	});

	it('passes the transitions it is given, and reports a route without transitions as such', async () => {
		const root = workspace();
		let passed: unknown;
		const result = await previewInScratchCopy(
			{
				migrations: [],
				journal: {
					read: async () => [],
					record: async () => undefined,
				},
				workspaceRoot: root,
				transitions: [],
			},
			async (input) => {
				passed = input.transitions;
				return { outcomes: [{ status: 'not-needed' }], acted: false };
			},
		);
		expect(passed).toEqual([]);
		expect(result).toEqual({
			outcomes: [{ status: 'not-needed' }],
			acted: false,
		});
	});
});
