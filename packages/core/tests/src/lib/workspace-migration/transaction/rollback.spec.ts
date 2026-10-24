import { mkdir, mkdtemp, readFile, rename, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
	createWorkspaceBackup,
	hashWorkspaceAt,
	rollback,
} from '@delendai/core/lib/workspace-migration/transaction/rollback';

describe('rollback (b00239 S6)', () => {
	it('restores file bytes, directory renames, and removes newly created files', async () => {
		const workspaceRoot = await mkdtemp(
			join(tmpdir(), 'delendai-s6-rollback-'),
		);
		await mkdir(join(workspaceRoot, 'docs', 'legacy'), { recursive: true });
		await writeFile(
			join(workspaceRoot, 'docs', 'legacy', 'note.md'),
			'legacy\n',
		);
		await writeFile(
			join(workspaceRoot, 'config.json'),
			'{"name":"legacy"}\n',
		);
		const before = await hashWorkspaceAt(workspaceRoot);
		const backups = await createWorkspaceBackup(workspaceRoot);

		await rename(
			join(workspaceRoot, 'docs', 'legacy'),
			join(workspaceRoot, 'docs', 'modern'),
		);
		await writeFile(
			join(workspaceRoot, 'config.json'),
			'{"name":"modern"}\n',
		);
		await writeFile(
			join(workspaceRoot, 'new.txt'),
			'created during apply\n',
		);

		const report = await rollback(
			backups,
			{ workspaceRoot },
			'forced test rollback',
		);
		const after = await hashWorkspaceAt(workspaceRoot);

		expect(report.errors).toEqual([]);
		expect(after).toBe(before);
		expect(await readFile(join(workspaceRoot, 'config.json'), 'utf8')).toBe(
			'{"name":"legacy"}\n',
		);
		expect(
			await readFile(
				join(workspaceRoot, 'docs', 'legacy', 'note.md'),
				'utf8',
			),
		).toBe('legacy\n');
	});
});
