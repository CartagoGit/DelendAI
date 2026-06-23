/**
 * blueprint-writer.spec.ts
 *
 * r00003 S1 (F-002, S + D): the prepareServerBlueprintOnStart hook used
 * to do `existsSync → mkdir → writeFile` directly, with no mutex and no
 * atomic write. Two concurrent first-starts could both observe the
 * blueprint missing and write conflicting bytes; readers during the
 * gap could observe a torn file. The new `IBlueprintWriter` abstraction
 * routes through `withFileMutex` + `writeFileAtomic` with a
 * double-check pattern, so the operation is idempotent and
 * concurrency-safe.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
	mkdtemp,
	readFile,
	readdir,
	rm,
	stat,
	writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
	createFileSystemBlueprintWriter,
	type IBlueprintWriter,
} from '../../../../src/lib/shared/blueprint-writer';

let workspace: string;

beforeEach(async () => {
	workspace = await mkdtemp(join(tmpdir(), 'bp-writer-'));
});

afterEach(async () => {
	await rm(workspace, { recursive: true, force: true });
});

describe('createFileSystemBlueprintWriter — writeOnce idempotency', () => {
	it('writes the blueprint and reports written:true on the first call', async () => {
		const writer: IBlueprintWriter = createFileSystemBlueprintWriter();
		const result = await writer.writeOnce(workspace, 'bp.json', {
			generatedAt: '2026-06-23T00:00:00Z',
			blueprint: { kind: 'tool' },
		});
		expect(result.written).toBe(true);
		expect(result.path).toBe('bp.json');

		const bytes = await readFile(join(workspace, 'bp.json'), 'utf8');
		expect(JSON.parse(bytes)).toEqual({
			generatedAt: '2026-06-23T00:00:00Z',
			blueprint: { kind: 'tool' },
		});
	});

	it('reports written:false (and does NOT overwrite) when the blueprint already exists', async () => {
		const writer: IBlueprintWriter = createFileSystemBlueprintWriter();
		await writer.writeOnce(workspace, 'bp.json', {
			generatedAt: 'first',
			blueprint: { kind: 'tool', version: 1 },
		});

		const result = await writer.writeOnce(workspace, 'bp.json', {
			generatedAt: 'second',
			blueprint: { kind: 'tool', version: 2 },
		});

		expect(result.written).toBe(false);
		expect(result.path).toBe('bp.json');

		// Original bytes must be intact — the second call must be a no-op.
		const bytes = await readFile(join(workspace, 'bp.json'), 'utf8');
		expect(JSON.parse(bytes)).toEqual({
			generatedAt: 'first',
			blueprint: { kind: 'tool', version: 1 },
		});
	});

	it('quarantines a corrupt (unparseable) pre-existing blueprint, then writes fresh', async () => {
		// A pre-existing file whose bytes do not parse as JSON must be
		// treated as corrupt — NOT as a valid "already exists" blueprint.
		// corrupt ≠ empty (AGENTS.md invariant 4): the garbage bytes are
		// moved aside to a `.corrupt-*` sidecar, then a fresh blueprint
		// lands in their place.
		await writeFile(
			join(workspace, 'bp.json'),
			'{ this is not json',
			'utf8',
		);

		const writer: IBlueprintWriter = createFileSystemBlueprintWriter();
		const result = await writer.writeOnce(workspace, 'bp.json', {
			generatedAt: 'fresh',
			blueprint: { kind: 'tool' },
		});

		// The corrupt file was replaced by a valid one.
		expect(result.written).toBe(true);
		const bytes = await readFile(join(workspace, 'bp.json'), 'utf8');
		expect(JSON.parse(bytes)).toEqual({
			generatedAt: 'fresh',
			blueprint: { kind: 'tool' },
		});

		// The original corrupt bytes are preserved in a sidecar, not lost.
		const entries = await readdir(workspace);
		const quarantined = entries.filter((e) => e.includes('.corrupt-'));
		expect(quarantined).toHaveLength(1);
		const sidecar = await readFile(
			join(workspace, quarantined[0] as string),
			'utf8',
		);
		expect(sidecar).toBe('{ this is not json');
	});

	it('creates parent directories recursively (mkdir -p) before writing', async () => {
		const writer: IBlueprintWriter = createFileSystemBlueprintWriter();
		const result = await writer.writeOnce(
			workspace,
			'deep/nested/bp.json',
			{
				generatedAt: '2026-06-23',
				blueprint: {},
			},
		);
		expect(result.written).toBe(true);
		const stats = await stat(join(workspace, 'deep/nested/bp.json'));
		expect(stats.isFile()).toBe(true);
	});
});

describe('createFileSystemBlueprintWriter — concurrency safety', () => {
	it('serializes concurrent writeOnce calls: exactly one wins, no torn file', async () => {
		// Fire 5 concurrent writeOnce calls against the same path.
		// Without the mutex + double-check, multiple writers could race
		// past the existence check and clobber each other's bytes. With
		// the mutex, exactly one of them reports written:true; the rest
		// observe the file already exists and report written:false.
		const writer: IBlueprintWriter = createFileSystemBlueprintWriter();
		const results = await Promise.all(
			[1, 2, 3, 4, 5].map((i) =>
				writer.writeOnce(workspace, 'shared.json', {
					generatedAt: `attempt-${i}`,
					blueprint: { attempt: i },
				}),
			),
		);

		const winners = results.filter((r) => r.written);
		const losers = results.filter((r) => !r.written);
		expect(winners).toHaveLength(1);
		expect(losers).toHaveLength(4);

		// The on-disk file must match exactly one of the five attempts —
		// never a half-mix of two attempts.
		const bytes = await readFile(join(workspace, 'shared.json'), 'utf8');
		const parsed = JSON.parse(bytes) as { generatedAt: string };
		const match = parsed.generatedAt.match(/^attempt-(\d)$/);
		expect(match).not.toBeNull();
	});
});
