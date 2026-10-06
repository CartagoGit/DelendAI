/**
 * proposals-state.migrator.spec.ts — the legacy proposal state is moved
 * where the current product reads it, and nothing of it stays behind.
 */
import { existsSync } from 'node:fs';
import {
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	rm,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PROPOSALS_STATE_DIR_SEGMENTS } from '../../../../../../proposals-sqlite/src/lib/db-path';
import { PROPOSALS_STATE_SEGMENTS } from '../../../../../src/lib/workspace-migration/migrators/proposals-state.constant';
import { createProposalsStateMigrator } from '../../../../../src/lib/workspace-migration/migrators/proposals-state.migrator';

let root: string;
const migrator = createProposalsStateMigrator();
const ctx = (dryRun = false) => ({ workspaceRoot: root, dryRun });

beforeEach(async () => {
	root = await mkdtemp(join(tmpdir(), 'proposals-state-'));
});
afterEach(async () => {
	await rm(root, { recursive: true, force: true });
});

const legacyDatabase = async (): Promise<void> => {
	await mkdir(join(root, '.delendai', 'state'), { recursive: true });
	await writeFile(join(root, '.delendai', 'state', 'proposals.sqlite'), 'db');
	await writeFile(
		join(root, '.delendai', 'state', 'proposals.sqlite-wal'),
		'wal',
	);
};

describe('the proposals state migrator', () => {
	it('names the state directory the proposals database package resolves', () => {
		expect(PROPOSALS_STATE_SEGMENTS).toEqual(PROPOSALS_STATE_DIR_SEGMENTS);
	});

	it('moves the legacy database with its sidecar, and removes the emptied directory', async () => {
		await legacyDatabase();
		expect(await migrator.detect(ctx())).toBe(true);
		const plan = await migrator.plan(ctx(true));
		expect(plan.map((step) => step.kind)).toEqual(['move']);
		// A rehearsal changes nothing.
		await migrator.apply(ctx(true));
		expect(
			existsSync(join(root, '.delendai', 'state', 'proposals.sqlite')),
		).toBe(true);

		await migrator.apply(ctx());

		const state = join(root, '.cache', 'delendai', 'state');
		expect(await readFile(join(state, 'proposals.sqlite'), 'utf8')).toBe(
			'db',
		);
		expect(
			await readFile(join(state, 'proposals.sqlite-wal'), 'utf8'),
		).toBe('wal');
		expect(existsSync(join(root, '.delendai', 'state'))).toBe(false);
		expect(await migrator.detect(ctx())).toBe(false);
	});

	it('keeps a database already at the current place, and reports the legacy one', async () => {
		await legacyDatabase();
		await mkdir(join(root, '.cache', 'delendai', 'state'), {
			recursive: true,
		});
		await writeFile(
			join(root, '.cache', 'delendai', 'state', 'proposals.sqlite'),
			'current',
		);

		expect(
			(await migrator.plan(ctx(true))).map((step) => step.kind),
		).toEqual(['conflict']);
		await migrator.apply(ctx());

		expect(
			await readFile(
				join(root, '.cache', 'delendai', 'state', 'proposals.sqlite'),
				'utf8',
			),
		).toBe('current');
		expect(
			existsSync(join(root, '.delendai', 'state', 'proposals.sqlite')),
		).toBe(true);
	});

	it('removes the committed registry under the declared documents directory, and nothing beside it', async () => {
		await writeFile(
			join(root, 'delendai.config.json'),
			JSON.stringify({ docsDir: 'notes' }),
		);
		await mkdir(join(root, 'notes', 'proposals', 'ready'), {
			recursive: true,
		});
		await writeFile(
			join(root, 'notes', 'proposals', 'index.json'),
			'{"proposals":[]}',
		);
		await writeFile(
			join(root, 'notes', 'proposals', 'ready', 'f00001-a.md'),
			'# a\n',
		);

		expect(
			(await migrator.plan(ctx(true))).map((step) => step.kind),
		).toEqual(['remove']);
		await migrator.apply(ctx());

		expect(existsSync(join(root, 'notes', 'proposals', 'index.json'))).toBe(
			false,
		);
		expect(
			await readdir(join(root, 'notes', 'proposals', 'ready')),
		).toEqual(['f00001-a.md']);
	});

	it('finds nothing to do in a project that has neither', async () => {
		expect(await migrator.detect(ctx())).toBe(false);
	});
});
