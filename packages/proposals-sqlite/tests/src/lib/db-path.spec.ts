import {
	mkdirSync,
	mkdtempSync,
	readFileSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	PROPOSALS_DB_FILENAME,
	PROPOSALS_DB_STAGING_FILENAME,
	PROPOSALS_STATE_DIR_SEGMENTS,
	resolveProposalsDbPaths,
} from '../../../src';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');

describe('resolveProposalsDbPaths (x00533 S1)', () => {
	it('resolves the canonical location under the repo cache root', () => {
		const paths = resolveProposalsDbPaths('/ws');

		expect(paths.stateDir).toBe(join('/ws', '.cache', 'delendai', 'state'));
		expect(paths.databasePath).toBe(
			join('/ws', '.cache', 'delendai', 'state', 'proposals.sqlite'),
		);
	});

	it('puts the staging DB next to the active one', () => {
		const paths = resolveProposalsDbPaths('/ws');

		expect(paths.stagingPath).toBe(`${paths.databasePath}.staging`);
		expect(paths.stagingPath).toBe(
			join(paths.stateDir, PROPOSALS_DB_STAGING_FILENAME),
		);
	});

	it('never puts the database at the workspace root', () => {
		const paths = resolveProposalsDbPaths('/ws');

		expect(paths.databasePath).not.toBe(join('/ws', PROPOSALS_DB_FILENAME));
	});

	it('honours an explicit state directory override', () => {
		const paths = resolveProposalsDbPaths('/ws', {
			stateDir: '/elsewhere',
		});

		expect(paths.stateDir).toBe('/elsewhere');
		expect(paths.databasePath).toBe(join('/elsewhere', 'proposals.sqlite'));
		expect(paths.stagingPath).toBe(
			join('/elsewhere', 'proposals.sqlite.staging'),
		);
	});

	it('returns absolute paths for an absolute workspace root', () => {
		const paths = resolveProposalsDbPaths('/ws');

		expect(isAbsolute(paths.databasePath)).toBe(true);
		expect(isAbsolute(paths.stagingPath)).toBe(true);
	});

	it('exposes the canonical segments as data, not as a hand-written join', () => {
		expect([...PROPOSALS_STATE_DIR_SEGMENTS]).toEqual([
			'.cache',
			'delendai',
			'state',
		]);
		expect(PROPOSALS_DB_FILENAME).toBe('proposals.sqlite');
	});
});

describe('a clone that predates the move to the cache root', () => {
	let root: string;

	beforeEach(() => {
		root = mkdtempSync(join(tmpdir(), 'proposals-db-path-'));
	});

	afterEach(() => {
		rmSync(root, { recursive: true, force: true });
	});

	const seedLegacyDatabase = (): string => {
		const legacyStateDir = join(root, '.delendai', 'state');
		mkdirSync(legacyStateDir, { recursive: true });
		const legacyDb = join(legacyStateDir, PROPOSALS_DB_FILENAME);
		writeFileSync(legacyDb, 'SQLite format 3\u0000');
		return legacyDb;
	};

	it('refuses to hand back an empty new path while the old database exists', () => {
		seedLegacyDatabase();

		expect(() => resolveProposalsDbPaths(root)).toThrow(
			/pre-move location/,
		);
	});

	it('names the exact mv command, sidecar glob included, in the remedy', () => {
		seedLegacyDatabase();

		let message = '';
		try {
			resolveProposalsDbPaths(root);
		} catch (error) {
			message = error instanceof Error ? error.message : String(error);
		}

		expect(message).toContain(
			`mv ${join(root, '.delendai', 'state', 'proposals.sqlite*')} ${join(
				root,
				'.cache',
				'delendai',
				'state',
			)}/`,
		);
	});

	it('stops complaining once the canonical database exists', () => {
		seedLegacyDatabase();
		const stateDir = join(root, '.cache', 'delendai', 'state');
		mkdirSync(stateDir, { recursive: true });
		writeFileSync(
			join(stateDir, PROPOSALS_DB_FILENAME),
			'SQLite format 3\u0000',
		);

		expect(resolveProposalsDbPaths(root).databasePath).toBe(
			join(stateDir, PROPOSALS_DB_FILENAME),
		);
	});

	it('leaves an explicit stateDir override untouched by the guard', () => {
		seedLegacyDatabase();
		const elsewhere = join(root, 'elsewhere');

		expect(
			resolveProposalsDbPaths(root, { stateDir: elsewhere }).databasePath,
		).toBe(join(elsewhere, PROPOSALS_DB_FILENAME));
	});

	it('is silent for a workspace that never had the old layout', () => {
		expect(resolveProposalsDbPaths(root).databasePath).toBe(
			join(root, '.cache', 'delendai', 'state', PROPOSALS_DB_FILENAME),
		);
	});
});

describe('.gitignore pins the sqlite artefacts (x00533 S1)', () => {
	const entries = readFileSync(join(REPO_ROOT, '.gitignore'), 'utf8')
		.split('\n')
		.map((line) => line.trim())
		.filter((line) => line !== '' && !line.startsWith('#'));

	it.each([
		'*.sqlite',
		'*.sqlite-wal',
		'*.sqlite-shm',
		'*.sqlite.staging',
		'*.sqlite.staging-wal',
		'*.sqlite.staging-shm',
	])('ignores %s', (pattern) => {
		expect(entries).toContain(pattern);
	});

	it('covers the canonical database and staging file names', () => {
		const covered = (fileName: string): boolean =>
			entries.some((entry) => {
				if (!entry.startsWith('*')) return false;
				return fileName.endsWith(entry.slice(1));
			});

		expect(covered(PROPOSALS_DB_FILENAME)).toBe(true);
		expect(covered(PROPOSALS_DB_STAGING_FILENAME)).toBe(true);
		expect(covered(`${PROPOSALS_DB_FILENAME}-wal`)).toBe(true);
		expect(covered(`${PROPOSALS_DB_FILENAME}-shm`)).toBe(true);
	});
});
