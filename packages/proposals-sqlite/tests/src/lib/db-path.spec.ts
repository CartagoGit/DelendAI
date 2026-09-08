import { readFileSync } from 'node:fs';
import { isAbsolute, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
	PROPOSALS_DB_FILENAME,
	PROPOSALS_DB_STAGING_FILENAME,
	PROPOSALS_STATE_DIR_SEGMENTS,
	resolveProposalsDbPaths,
} from '../../../src';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..', '..', '..');

describe('resolveProposalsDbPaths (x00533 S1)', () => {
	it('resolves the canonical q00022 location under the workspace root', () => {
		const paths = resolveProposalsDbPaths('/ws');

		expect(paths.stateDir).toBe(join('/ws', '.delendai', 'state'));
		expect(paths.databasePath).toBe(
			join('/ws', '.delendai', 'state', 'proposals.sqlite'),
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
			'.delendai',
			'state',
		]);
		expect(PROPOSALS_DB_FILENAME).toBe('proposals.sqlite');
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
