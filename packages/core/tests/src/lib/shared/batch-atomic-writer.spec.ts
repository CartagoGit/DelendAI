/**
 * batch-atomic-writer.spec.ts
 *
 * r00003 S11 (CONC-2): the scaffold tool used to write files one by
 * one with no batch-level mutex. Two concurrent scaffold calls could
 * observe each other's mid-batch state (a directory created but not
 * yet filled, a file written but not yet visible). With the
 * `IBatchAtomicWriter` abstraction the scaffold tool plans the whole
 * batch, takes a single mutex for the batch, and either commits or
 * rolls back — keeping concurrent scaffolds from interleaving.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	createFileSystemBatchWriter,
	type IBatchOperation,
	type IBatchWriteResult,
} from '../../../src/lib/shared/batch-atomic-writer';

let workspace: string;

beforeEach(async () => {
	workspace = await mkdtemp(join(tmpdir(), 'batch-writer-'));
});

afterEach(async () => {
	await rm(workspace, { recursive: true, force: true });
});

const op = (path: string, content: string): IBatchOperation => ({
	path,
	content,
});

describe('createFileSystemBatchWriter — happy path', () => {
	it('writes every operation atomically and reports ok for each', async () => {
		const writer = createFileSystemBatchWriter(workspace);
		const result = await writer.writeAll([
			op('a.txt', 'hello'),
			op('nested/b.txt', 'world'),
		]);

		expect(result.ok).toBe(true);
		expect(result.committed).toHaveLength(2);
		expect(result.errors).toHaveLength(0);

		const aContents = await readFile(join(workspace, 'a.txt'), 'utf8');
		const bContents = await readFile(
			join(workspace, 'nested/b.txt'),
			'utf8',
		);
		expect(aContents).toBe('hello');
		expect(bContents).toBe('world');
	});

	it('creates parent directories recursively (mkdir -p)', async () => {
		const writer = createFileSystemBatchWriter(workspace);
		const result = await writer.writeAll([
			op('a/b/c/d/deep.txt', 'buried'),
		]);

		expect(result.ok).toBe(true);
		const contents = await readFile(
			join(workspace, 'a/b/c/d/deep.txt'),
			'utf8',
		);
		expect(contents).toBe('buried');
	});
});

describe('createFileSystemBatchWriter — rollback on failure', () => {
	it('leaves no partial files behind when a write in the middle fails', async () => {
		// The third operation points at a path that is impossible to
		// write (its parent is a regular file, not a directory). The
		// batch must roll back the first two committed operations.
		const writer = createFileSystemBatchWriter(workspace);
		const blockerPath = join(workspace, 'blocker');
		const { writeFile } = await import('node:fs/promises');
		await writeFile(blockerPath, 'not a directory');

		const result = await writer.writeAll([
			op('first.txt', 'one'),
			op('second.txt', 'two'),
			// Below this line the operation must fail because the
			// parent cannot be created.
			op('blocker/under.txt', 'three'),
			op('fourth.txt', 'four'),
		]);

		expect(result.ok).toBe(false);
		expect(result.errors.length).toBeGreaterThan(0);
		// No partial state: the first two committed operations must be
		// rolled back, and the fourth (which never got attempted)
		// must not exist.
		await expect(stat(join(workspace, 'first.txt'))).rejects.toThrow();
		await expect(stat(join(workspace, 'second.txt'))).rejects.toThrow();
		await expect(stat(join(workspace, 'fourth.txt'))).rejects.toThrow();
	});

	it('returns per-operation errors with file paths and reasons', async () => {
		const writer = createFileSystemBatchWriter(workspace);
		const { writeFile } = await import('node:fs/promises');
		const blocker = join(workspace, 'blocker');
		await writeFile(blocker, 'not a directory');

		const result: IBatchWriteResult = await writer.writeAll([
			op('blocker/under.txt', 'three'),
		]);

		expect(result.ok).toBe(false);
		expect(result.errors[0]?.path).toBe('blocker/under.txt');
		expect(result.errors[0]?.reason).toMatch(
			/EEXIST|ENOTDIR|not a directory/i,
		);
	});
});

describe('createFileSystemBatchWriter — serialization', () => {
	it('serializes two concurrent batches so neither observes the other mid-write', async () => {
		const writer = createFileSystemBatchWriter(workspace);

		// Fire two batches concurrently against the SAME path. Without
		// the batch-level mutex, the second batch could observe a
		// partial write of the first (an empty file, a corrupt file).
		// With the mutex, each batch completes in full before the next
		// starts; the second batch's contents win, but they win as a
		// whole, not as a torn read.
		const [r1, r2] = await Promise.all([
			writer.writeAll([op('shared.txt', 'A'.repeat(10_000))]),
			writer.writeAll([op('shared.txt', 'B'.repeat(10_000))]),
		]);

		// One of them must have committed; the other may have observed
		// the file already existed and skipped it. Both result objects
		// must be valid (ok: true and a non-empty committed/errors list).
		expect(
			[r1, r2].every((r) => r.committed.length + r.errors.length === 1),
		).toBe(true);

		// The final on-disk contents must be exactly one of the two
		// batches — never a half-mix.
		const final = await readFile(join(workspace, 'shared.txt'), 'utf8');
		expect(
			final === 'A'.repeat(10_000) || final === 'B'.repeat(10_000),
		).toBe(true);
	});
});
