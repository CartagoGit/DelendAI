/**
 * file-artifact-store.spec.ts — the store context-compiler runs on, kept
 * on disk one file per key.
 */
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
	createContextCompiler,
	createContextRef,
} from '@delendai/context-compiler';
import {
	asWorktreeId,
	createMemoDerivationEngine,
	type IArtifactKey,
	type StateScope,
} from '@delendai/state';
import { createFileArtifactStore } from '@delendai/core/lib/context-store/file-artifact-store';

const scope: StateScope = {
	kind: 'project',
	locator: {
		workspaceRoot: '/repo',
		worktreeId: asWorktreeId('wt-file-store'),
		cacheRoot: '/repo/.cache/delendai',
		docsRoot: '/repo/docs/delendai',
	},
};

describe('createFileArtifactStore', () => {
	const dirs: string[] = [];
	afterEach(() => {
		for (const dir of dirs.splice(0))
			rmSync(dir, { recursive: true, force: true });
	});
	const root = (): string => {
		const dir = mkdtempSync(join(tmpdir(), 'artifact-store-'));
		dirs.push(dir);
		return dir;
	};

	it('keeps a record per key, its first time, lists it by kind and deletes it', async () => {
		let clock = 1000;
		const store = createFileArtifactStore({
			root: root(),
			now: () => clock,
			reconciledCommitSha: 'abc',
		});
		const key: IArtifactKey = { scope, kind: 'artifact', id: 'files/a.ts' };
		const first = await store.put(key, { text: 'one' });
		clock = 2000;
		const second = await store.put(key, { text: 'two' });
		expect(second).toMatchObject({
			createdAt: 1000,
			updatedAt: 2000,
			reconciledCommitSha: 'abc',
		});
		expect(second.contentHash).not.toBe(first.contentHash);
		expect((await store.get<{ text: string }>(key))?.value.text).toBe(
			'two',
		);
		await store.put({ scope, kind: 'manifest', id: 'm' }, { refs: [] });
		expect(await store.list(scope, 'artifact')).toEqual([key]);
		expect(await store.list(scope)).toHaveLength(2);
		expect(await store.list(scope, 'audit')).toEqual([]);
		await store.delete(key);
		expect(await store.get(key)).toBeNull();
		const elsewhere: StateScope = {
			...scope,
			locator: { ...scope.locator, worktreeId: asWorktreeId('other') },
		};
		expect(await store.list(elsewhere)).toEqual([]);
	});

	it('lets context-compiler compile a manifest of references on disk and expand one back', async () => {
		const store = createFileArtifactStore({ root: root() });
		const compiler = createContextCompiler({
			artifactStore: store,
			derivationEngine: createMemoDerivationEngine({ store, scope }),
		});
		const record = await store.put(
			{ scope, kind: 'artifact', id: 'files/a.ts' },
			{ text: 'export {}' },
		);
		const manifest = await compiler.compile([createContextRef(record)]);
		expect(manifest.refs).toHaveLength(1);
		expect(manifest.contentHash).toHaveLength(64);
		expect(await compiler.compile([createContextRef(record)])).toEqual(
			manifest,
		);
		const [ref] = manifest.refs;
		expect(
			ref === undefined ? undefined : await compiler.expand(ref),
		).toEqual({ text: 'export {}' });
	});
});
