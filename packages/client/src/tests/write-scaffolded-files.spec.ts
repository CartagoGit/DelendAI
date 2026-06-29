import { describe, expect, it } from 'vitest';

import {
	scaffoldPluginFiles,
	type IBatchAtomicWriter,
	type IBatchOperation,
	type IBatchWriteResult,
} from '@mcp-vertex/core/public';
import {
	writeScaffoldedFiles,
	writeScaffoldedFilesOrThrow,
} from '@mcp-vertex/client';

/**
 * f00087 S2 unit tests. The writer helper re-uses the core's
 * `IBatchAtomicWriter`; we inject a fake writer that records every
 * operation without touching disk, so the specs are deterministic and
 * platform-independent.
 */

const captureWriter = (
	fakeOk = true,
): IBatchAtomicWriter & {
	readonly calls: readonly (readonly IBatchOperation[])[];
} => {
	const calls: (readonly IBatchOperation[])[] = [];
	return {
		calls,
		async writeAll(ops): Promise<IBatchWriteResult> {
			calls.push(ops);
			if (!fakeOk) {
				return {
					ok: false,
					committed: [],
					errors: ops.map((op) => ({
						path: op.path,
						reason: 'simulated failure',
					})),
				};
			}
			return {
				ok: true,
				committed: ops.map((op) => op.path),
				errors: [],
			};
		},
	};
};

const fixtureFiles = () =>
	scaffoldPluginFiles({
		pluginName: 'demo',
		description: 'A demo plugin',
	});

describe('writeScaffoldedFiles (f00087 S2)', () => {
	it('passes every scaffolded file to the batch writer', async () => {
		const writer = captureWriter();
		const files = fixtureFiles();
		const result = await writeScaffoldedFiles('/anywhere', files, {
			batchWriter: writer,
		});
		expect(result.errors).toEqual([]);
		expect(result.written.length).toBe(files.length);
		expect(writer.calls).toHaveLength(1);
		expect(writer.calls[0]?.length).toBe(files.length);
		// Every operation's path is what the scaffolder produced.
		const paths = (writer.calls[0] ?? []).map((op) => op.path).sort();
		const expected = files.map((f) => f.path).sort();
		expect(paths).toEqual(expected);
	});

	it('reports errors from the batch writer instead of throwing', async () => {
		const writer = captureWriter(false);
		const result = await writeScaffoldedFiles('/anywhere', fixtureFiles(), {
			batchWriter: writer,
		});
		expect(result.errors.length).toBeGreaterThan(0);
		expect(result.errors[0]).toMatch(/simulated failure/);
		expect(result.written).toEqual([]);
	});

	it('writeScaffoldedFilesOrThrow re-throws when the batch fails', async () => {
		const writer = captureWriter(false);
		await expect(
			writeScaffoldedFilesOrThrow('/anywhere', fixtureFiles(), {
				batchWriter: writer,
			}),
		).rejects.toThrow(/writeScaffoldedFiles failed/);
	});

	it('writeScaffoldedFilesOrThrow returns the report on success', async () => {
		const writer = captureWriter();
		const result = await writeScaffoldedFilesOrThrow(
			'/anywhere',
			fixtureFiles(),
			{ batchWriter: writer },
		);
		expect(result.errors).toEqual([]);
		expect(result.written.length).toBeGreaterThan(0);
	});
});
