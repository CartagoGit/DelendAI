import { describe, expect, it } from 'vitest';
import {
	mkdirSync,
	mkdtempSync,
	readdirSync,
	readFileSync,
	utimesSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	tmpStemFor,
	writeFileAtomic,
	writeFileAtomicSync,
} from '@delendai/core/lib/shared/atomic-write';

const scratch = (): string => mkdtempSync(join(tmpdir(), 'mcp-atomic-'));

describe('a file whose name leaves no room for the temporary suffix', () => {
	// 242 bytes: the length of a proposal file named after a long title.
	const longName = `${'q'.repeat(239)}.md`;

	it('is written, sync and async, where appending the suffix would pass 255 bytes', async () => {
		const dir = scratch();
		const target = join(dir, longName);
		await writeFileAtomic(target, 'async');
		expect(readFileSync(target, 'utf8')).toBe('async');
		writeFileAtomicSync(target, 'sync');
		expect(readFileSync(target, 'utf8')).toBe('sync');
		expect(readdirSync(dir)).toEqual([longName]);
	});

	it('keeps short names as they are and shortens only the ones that do not fit', () => {
		expect(tmpStemFor('state.json')).toBe('state.json');
		const stem = tmpStemFor(longName);
		expect(Buffer.byteLength(stem)).toBeLessThanOrEqual(255 - 32);
		expect(stem.startsWith('q'.repeat(200))).toBe(true);
		// Two long names with the same start get different stems.
		expect(tmpStemFor(`${'q'.repeat(239)}.mx`)).not.toBe(stem);
		// A multi-byte character is never cut in half.
		const wide = tmpStemFor('✓'.repeat(200));
		expect(Buffer.from(wide).toString('utf8')).toBe(wide);
	});
});

describe('writeFileAtomic (durable + atomic)', () => {
	it('writes content that round-trips exactly', async () => {
		const dir = scratch();
		const target = join(dir, 'state.json');
		await writeFileAtomic(target, '{"a":1}');
		expect(readFileSync(target, 'utf8')).toBe('{"a":1}');
	});

	it('overwrites an existing file and leaves NO .tmp sidecar behind', async () => {
		const dir = scratch();
		const target = join(dir, 'state.json');
		await writeFileAtomic(target, 'first');
		await writeFileAtomic(target, 'second');
		expect(readFileSync(target, 'utf8')).toBe('second');
		// a00065 S6: the temp file must be renamed away, never left as
		// litter — otherwise a crash mid-run accumulates *.tmp forever.
		expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
	});

	it('creates missing parent directories', async () => {
		const dir = scratch();
		const target = join(dir, 'nested', 'deep', 'state.json');
		await writeFileAtomic(target, 'ok');
		expect(readFileSync(target, 'utf8')).toBe('ok');
	});

	it('never leaves a partial file: many concurrent writers all land a whole document', async () => {
		const dir = scratch();
		const target = join(dir, 'state.json');
		const docs = Array.from({ length: 20 }, (_v, i) =>
			JSON.stringify({ writer: i, payload: 'x'.repeat(500) }),
		);
		await Promise.all(docs.map((d) => writeFileAtomic(target, d)));
		// Whichever writer won, the file is exactly one of the documents —
		// never a truncated/interleaved mix.
		expect(docs).toContain(readFileSync(target, 'utf8'));
		expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
	});
});

describe('writeFileAtomicSync (durable + atomic)', () => {
	it('writes content that round-trips exactly and cleans up the .tmp', () => {
		const dir = scratch();
		const target = join(dir, 'state.json');
		writeFileAtomicSync(target, 'boot');
		expect(readFileSync(target, 'utf8')).toBe('boot');
		expect(readdirSync(dir).filter((f) => f.endsWith('.tmp'))).toEqual([]);
	});

	it('creates missing parent directories', () => {
		const dir = scratch();
		const target = join(dir, 'a', 'b', 'state.json');
		writeFileAtomicSync(target, 'ok');
		expect(readFileSync(target, 'utf8')).toBe('ok');
	});
});

describe('a writer that died leaves nothing behind (x00734)', () => {
	it('fails a write it cannot land and leaves no temporary behind', async () => {
		const dir = scratch();
		const target = join(dir, 'taken');
		mkdirSync(join(target, 'inside'), { recursive: true });

		await expect(writeFileAtomic(target, '{}')).rejects.toThrow();
		expect(readdirSync(dir)).toEqual(['taken']);
	});

	it('sweeps the empty temporaries a dead writer left, and keeps the rest', async () => {
		const dir = scratch();
		const target = join(dir, 'pricing.json');
		const old = Date.now() / 1000 - 3600;
		const dead = `${target}.mukxutts-a9d19a5c5b8b.tmp`;
		const fresh = `${target}.mukxutts-0123456789ab.tmp`;
		const written = `${target}.mukxutts-bbbbbbbbbbbb.tmp`;
		const other = join(dir, 'other.json.mukxutts-a9d19a5c5b8b.tmp');
		for (const path of [dead, fresh, written, other])
			writeFileSync(path, '');
		writeFileSync(written, 'partial');
		for (const path of [dead, written, other]) utimesSync(path, old, old);

		await writeFileAtomic(target, '{}');

		expect(readdirSync(dir).sort()).toEqual(
			[
				'pricing.json',
				'pricing.json.mukxutts-0123456789ab.tmp',
				'pricing.json.mukxutts-bbbbbbbbbbbb.tmp',
				'other.json.mukxutts-a9d19a5c5b8b.tmp',
			].sort(),
		);
	});
});
