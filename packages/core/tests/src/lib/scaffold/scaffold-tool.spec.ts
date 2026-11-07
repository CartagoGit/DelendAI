/**
 * scaffold-tool.spec.ts
 *
 * x00183 (F3): `keepLegacy` used to move the pre-existing file to
 * `legacy/` BEFORE the batch writer wrote the new content. If the batch
 * later failed, the original was already gone and the new content was
 * never written — breaking the "no partial scaffold on disk" promise.
 * The fix compensates a failed batch by moving every relocated original
 * back to its original path.
 */
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { buildScaffoldReport } from '../../../../src/lib/scaffold/scaffold-tool';
import type { IScaffoldToolOptions } from '../../../../src/lib/scaffold/scaffold-tool';
import type {
	IBatchAtomicWriter,
	IBatchOperation,
} from '../../../../src/lib/shared/batch-atomic-writer';
import { createFileSystemBatchWriter } from '../../../../src/lib/shared/batch-atomic-writer';

let workspaceRoot: string;

beforeEach(async () => {
	workspaceRoot = await mkdtemp(join(tmpdir(), 'scaffold-tool-'));
});

afterEach(async () => {
	await rm(workspaceRoot, { recursive: true, force: true });
});

const baseOptions = (
	batchWriter: IBatchAtomicWriter,
): IScaffoldToolOptions => ({
	namespacePrefix: 'test',
	workspace: {
		root: workspaceRoot,
		resolve: (relativePath: string) => join(workspaceRoot, relativePath),
	},
	projectName: 'test-project',
	projectPackageName: '@test/project',
	keepLegacy: true,
	batchWriter,
});

const TARGET_RELATIVE_PATH =
	'libs/mcp-project/src/lib/tools/test-sample.tool.ts';

describe('buildScaffoldReport — keepLegacy (x00183 F3)', () => {
	it('moves the original to legacy/ and writes the new content on success', async () => {
		const targetAbs = join(workspaceRoot, TARGET_RELATIVE_PATH);
		await mkdir(join(workspaceRoot, 'libs/mcp-project/src/lib/tools'), {
			recursive: true,
		});
		await writeFile(targetAbs, 'OLD CONTENT', 'utf8');

		const writer = createFileSystemBatchWriter(workspaceRoot);
		const report = await buildScaffoldReport(baseOptions(writer), {
			kind: 'tool',
			name: 'sample',
			dryRun: false,
		});

		expect(report.errors).toEqual([]);
		expect(report.moved).toHaveLength(1);
		expect(report.written).toContain(TARGET_RELATIVE_PATH);

		const newContent = await readFile(targetAbs, 'utf8');
		expect(newContent).not.toBe('OLD CONTENT');
		const legacyRel = report.moved[0];
		expect(legacyRel).toBeDefined();
		if (legacyRel !== undefined) {
			const legacyContent = await readFile(
				join(workspaceRoot, legacyRel),
				'utf8',
			);
			expect(legacyContent).toBe('OLD CONTENT');
		}
	});

	// The core regression test: a batch writer that always fails must
	// leave the workspace exactly as it was before the call — the
	// original file back in place with its original content, NOT gone
	// (moved to legacy with no new content ever written).
	it('restores the original file when the batch write fails (no partial scaffold on disk)', async () => {
		const targetAbs = join(workspaceRoot, TARGET_RELATIVE_PATH);
		await mkdir(join(workspaceRoot, 'libs/mcp-project/src/lib/tools'), {
			recursive: true,
		});
		await writeFile(targetAbs, 'OLD CONTENT', 'utf8');

		const alwaysFailingWriter: IBatchAtomicWriter = {
			writeAll: async (operations: readonly IBatchOperation[]) => ({
				ok: false,
				committed: [],
				errors: operations.map((op) => ({
					path: op.path,
					reason: 'simulated batch failure',
				})),
			}),
		};

		const report = await buildScaffoldReport(
			baseOptions(alwaysFailingWriter),
			{ kind: 'tool', name: 'sample', dryRun: false },
		);

		expect(report.errors.length).toBeGreaterThan(0);
		expect(report.written).toEqual([]);
		// The compensating move must have put the file back — moved
		// reports nothing outstanding, and kept records the restore.
		expect(report.moved).toEqual([]);
		expect(report.kept).toContain(TARGET_RELATIVE_PATH);

		const restoredContent = await readFile(targetAbs, 'utf8');
		expect(restoredContent).toBe('OLD CONTENT');
	});
});
