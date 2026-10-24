/**
 * migrate-route.spec.ts — `migrate --dry-run`, `migrate status`,
 * `migrate run` and the start-up guard walk one route: on one fixture,
 * what the dry run lists is what status calls pending, what the guard
 * does and what the run applies.
 */
import { cpSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	DEFAULT_MIGRATIONS,
	createFileSystemJournal,
	ensureWorkspaceMigrated,
	migrationStepIds,
	type IMigrationRunResult,
} from '@delendai/core/cli';

import type { ICliCommandContext } from '../contracts/interfaces/cli-command.interface';
import { createMigrateCommand } from './migrate.command';

const roots: string[] = [];

afterEach(() => {
	for (const root of roots.splice(0)) {
		rmSync(root, { recursive: true, force: true });
	}
});

const mkCtx = (cwd: string): ICliCommandContext => ({
	cwd,
	globals: {
		workspace: cwd,
		json: true,
		format: 'json',
		lang: 'en',
		noColor: true,
		plugins: [],
	},
	request: async <TOut>() => undefined as unknown as TOut,
	listTools: async () => [],
	close: async () => {},
});

/** A workspace still carrying the product's old name, assembled here. */
const legacyWorkspace = (): string => {
	const root = mkdtempSync(join(tmpdir(), 'migrate-route-'));
	roots.push(root);
	const oldName = ['mcp', 'vertex'].join('-');
	writeFileSync(join(root, `${oldName}.config.json`), '{}\n');
	return root;
};

const copyOf = (root: string): string => {
	const copy = mkdtempSync(join(tmpdir(), 'migrate-route-copy-'));
	roots.push(copy);
	cpSync(root, copy, { recursive: true });
	return copy;
};

describe('the four migrate entry points', () => {
	it('list, report, do and apply the same steps', async () => {
		const root = legacyWorkspace();
		const guarded = copyOf(root);
		const command = createMigrateCommand();

		const dry = (await command.run(['--dry-run'], mkCtx(root))) as {
			readonly data: IMigrationRunResult;
		};
		const planned = migrationStepIds(dry.data, 'planned');
		const status = (await command.run(['status'], mkCtx(root))) as {
			readonly data: { readonly pending: readonly string[] };
		};
		const guard = await ensureWorkspaceMigrated({
			migrations: DEFAULT_MIGRATIONS,
			journal: createFileSystemJournal(),
			workspaceRoot: guarded,
		});

		expect(planned.length).toBeGreaterThan(0);
		expect(status.data.pending).toEqual(planned);
		expect(migrationStepIds(guard, 'done')).toEqual(planned);

		const run = (await command.run(['run'], mkCtx(root))) as {
			readonly data: { readonly status: string };
		};
		expect(run.data.status).toBe('committed');
		const after = (await command.run(['--dry-run'], mkCtx(root))) as {
			readonly data: IMigrationRunResult;
		};
		expect(migrationStepIds(after.data, 'planned')).toEqual([]);
	});
});
