import {
	existsSync,
	mkdtempSync,
	readFileSync,
	readdirSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
	CorruptFileError,
	quarantineCorruptFile,
	quarantineCorruptFileSync,
} from '@mcp-vertex/core/public';

describe('quarantineCorruptFile', () => {
	let dir = '';
	let target = '';
	beforeEach(() => {
		dir = mkdtempSync(join(tmpdir(), 'quarantine-'));
		target = join(dir, 'state.json');
	});
	afterEach(() => rmSync(dir, { recursive: true, force: true }));

	const backups = (): string[] =>
		readdirSync(dir).filter((f) =>
			f.startsWith(`${basename(target)}.corrupt-`),
		);

	it('moves the file aside and returns the backup path (async)', async () => {
		writeFileSync(target, 'corrupt bytes');
		const backup = await quarantineCorruptFile(target);

		expect(backup).not.toBeNull();
		expect(existsSync(target)).toBe(false);
		expect(readFileSync(backup!, 'utf8')).toBe('corrupt bytes');
		expect(backup).toContain('.corrupt-');
	});

	it('moves the file aside (sync)', () => {
		writeFileSync(target, 'sync corrupt');
		const backup = quarantineCorruptFileSync(target);

		expect(backup).not.toBeNull();
		expect(existsSync(target)).toBe(false);
		expect(readFileSync(backup!, 'utf8')).toBe('sync corrupt');
	});

	it('returns null when the file does not exist (never throws)', async () => {
		expect(await quarantineCorruptFile(target)).toBeNull();
		expect(quarantineCorruptFileSync(target)).toBeNull();
	});

	it('produces distinct backups for two corruptions of the same path', async () => {
		writeFileSync(target, 'first');
		const b1 = await quarantineCorruptFile(target);
		writeFileSync(target, 'second');
		const b2 = await quarantineCorruptFile(target);

		expect(b1).not.toBe(b2);
		expect(backups()).toHaveLength(2);
	});
});

describe('CorruptFileError', () => {
	it('names the preserved backup in the message', () => {
		const err = new CorruptFileError(
			'/x/state.json',
			'/x/state.json.corrupt-1',
			'invalid JSON',
		);
		expect(err).toBeInstanceOf(Error);
		expect(err.name).toBe('CorruptFileError');
		expect(err.originalPath).toBe('/x/state.json');
		expect(err.backupPath).toBe('/x/state.json.corrupt-1');
		expect(err.message).toContain('invalid JSON');
		expect(err.message).toContain('preserved at');
	});

	it('reports a failed backup rename when backupPath is null', () => {
		const err = new CorruptFileError('/x/state.json', null, 'invalid JSON');
		expect(err.backupPath).toBeNull();
		expect(err.message).toContain('backup rename failed');
	});
});
