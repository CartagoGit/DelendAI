/**
 * slice-snapshot.service.spec.ts — the slices of every proposal, read
 * from the documents, and read again only when one changed.
 */
import { mkdir, mkdtemp, rm, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { SafeWorkspaceReader } from '@delendai/core/runtime';

import { createSliceSnapshotReader } from '../../../../src/lib/triggers/slice-snapshot.service';
import { writeProposalDocuments } from './proposal-documents.fixture';

describe('createSliceSnapshotReader', () => {
	let root = '';
	beforeEach(async () => {
		root = await mkdtemp(join(tmpdir(), 'slice-snapshot-'));
	});
	afterEach(async () => {
		await rm(root, { recursive: true, force: true });
	});

	it('reads every slice of every proposal document, and nothing else', async () => {
		await writeProposalDocuments(join(root, 'proposals'), [
			{
				id: 'x00001',
				slices: [{ id: 'S1', status: 'done', files: ['a.ts'] }],
			},
			{ id: 'f00067a', slices: [{ id: 'S2', status: 'pending' }] },
		]);
		await writeFile(
			join(root, 'proposals', 'README.md'),
			'# not a proposal\n',
		);

		const read = await createSliceSnapshotReader(
			new SafeWorkspaceReader(root),
			'proposals',
		).read();

		expect(Object.fromEntries(read ?? [])).toEqual({
			'x00001-S1': {
				status: 'done',
				proposalId: 'x00001',
				files: ['a.ts'],
			},
			'f00067a-S2': { status: 'pending', proposalId: 'f00067a' },
		});
	});

	it('reads a document again only when it changed, and forgets one that is gone', async () => {
		const folder = join(root, 'proposals');
		await writeProposalDocuments(folder, [
			{
				id: 'x00001',
				slices: [{ id: 'S1', status: 'pending', files: ['a.ts'] }],
			},
			{
				id: 'x00002',
				slices: [{ id: 'S1', status: 'pending', files: ['b.ts'] }],
			},
		]);
		const workspace = new SafeWorkspaceReader(root);
		const readText = vi.spyOn(workspace, 'readText');
		const snapshot = createSliceSnapshotReader(workspace, 'proposals');

		await snapshot.read();
		expect(readText).toHaveBeenCalledTimes(2);

		await snapshot.read();
		expect(readText).toHaveBeenCalledTimes(2);

		await writeFile(
			join(folder, 'in-progress', 'x00001-fixture.md'),
			'---\nid: x00001\n---\n\n## slices\n\n### S1 — S1\n- **Status**: done\n- **Files**: `a.ts`\n',
		);
		await unlink(join(folder, 'in-progress', 'x00002-fixture.md'));
		const after = await snapshot.read();

		expect(readText).toHaveBeenCalledTimes(3);
		expect([...(after ?? []).keys()]).toEqual(['x00001-S1']);
		expect(after?.get('x00001-S1')?.status).toBe('done');
	});

	it('takes the id the document declares, whatever shape the project gives its ids', async () => {
		const folder = join(root, 'proposals', 'ready');
		await mkdir(folder, { recursive: true });
		await writeFile(
			join(folder, 'p9995-four-digits.md'),
			'---\nid: p9995\n---\n\n## slices\n\n### S1 — S1\n- **Status**: done\n- **Files**: `a.ts`\n',
		);
		await writeFile(
			join(folder, 'ADR-12-no-frontmatter.md'),
			'## slices\n\n### S1 — S1\n- **Status**: pending\n',
		);

		const read = await createSliceSnapshotReader(
			new SafeWorkspaceReader(root),
			'proposals',
		).read();

		expect([...(read ?? []).keys()].sort()).toEqual(['ADR-S1', 'p9995-S1']);
	});

	it('has nothing to compare against when the folder is not there', async () => {
		expect(
			await createSliceSnapshotReader(
				new SafeWorkspaceReader(root),
				'proposals',
			).read(),
		).toBeUndefined();
	});
});
