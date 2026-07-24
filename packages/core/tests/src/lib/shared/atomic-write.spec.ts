import { describe, expect, it } from 'vitest';
import { mkdtempSync, readdirSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	writeFileAtomic,
	writeFileAtomicSync,
} from '@mcp-vertex/core/lib/shared/atomic-write';

const scratch = (): string => mkdtempSync(join(tmpdir(), 'mcp-atomic-'));

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
